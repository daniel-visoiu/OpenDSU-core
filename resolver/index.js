const KeySSIResolver = require("key-ssi-resolver");
const keySSISpace = require("opendsu").loadApi("keyssi");

let {ENVIRONMENT_TYPES, KEY_SSIS} = require("../moduleConstants.js");
const {getWebWorkerBootScript, getNodeWorkerBootScript} = require("./resolver-utils");

const getResolver = (options) => {
    options = options || {};
    return KeySSIResolver.initialize(options);
};

const registerDSUFactory = (type, factory) => {
    KeySSIResolver.DSUFactory.prototype.registerDSUType(type, factory);
};

const createDSU = (templateKeySSI, options, callback) => {
    if (typeof options === "function") {
        callback = options;
        options = {addLog: true};
    }

    if (typeof options === "undefined") {
        options = {};
    }

    if (typeof options.addLog === "undefined") {
        options.addLog = true;
    }

    if (typeof templateKeySSI === "string") {
        try {
            templateKeySSI = keySSISpace.parse(templateKeySSI);
        } catch (e) {
            return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${templateKeySSI}`, e));
        }
    }

    const keySSIResolver = getResolver(options);
    keySSIResolver.createDSU(templateKeySSI, options, callback);
};

const createDSUx = (domain, ssiType, options, callback) => {
    const templateKeySSI = keySSISpace.createTemplateKeySSI(ssiType, domain);
    createDSU(templateKeySSI, options, callback);
}

const createSeedDSU = (domain, options, callback) => {
    const seedSSI = keySSISpace.createTemplateSeedSSI(domain);
    createDSU(seedSSI, options, callback);
}

const createArrayDSU = (domain, arr, options, callback) => {
    const arraySSI = keySSISpace.createArraySSI(domain, arr);
    createDSUForExistingSSI(arraySSI, options, callback);
}

const createConstDSU = (domain, constString, options, callback) => {
    const constSSI = keySSISpace.createConstSSI(domain, constString);
    createDSUForExistingSSI(constSSI, options, callback);
}

const createDSUForExistingSSI = (ssi, options, callback) => {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }
    if (!options) {
        options = {};
    }
    options.useSSIAsIdentifier = true;
    createDSU(ssi, options, callback);
};

/**
 * Check if the DSU is up to date by comparing its
 * current anchored HashLink with the latest anchored version.
 * If a new anchor is detected refresh the DSU
 */
const getLatestDSUVersion = (dsu, callback) => {
    dsu.getCurrentAnchoredHashLink((err, current) => {
        if (err) {
            return callback(err);
        }

        dsu.getLatestAnchoredHashLink((err, latest) => {
            if (err) {
                return callback(err);
            }

            if (current.getHash() === latest.getHash()) {
                // No new version detected
                return callback(undefined, dsu);
            }

            dsu.hasUnanchoredChanges((err, result) => {
                if (err) {
                    return callback(err);
                }

                if (result) {
                    // The DSU is in the process of anchoring - don't refresh it
                    return callback(undefined, dsu);
                }

                // A new version is detected, refresh the DSU content
                dsu.refresh((err) => {
                    if (err) {
                        return callback(err);
                    }
                    return callback(undefined, dsu);
                });
            })
        });
    });
}

const loadDSUVersion = (keySSI, versionHashlink, options, callback) => {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }

    if (typeof keySSI === "string") {
        try {
            keySSI = keySSISpace.parse(keySSI);
        } catch (e) {
            return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${keySSI}`, e));
        }
    }

    const keySSIResolver = getResolver(options);
    options.versionHashlink = versionHashlink;
    keySSIResolver.loadDSU(keySSI, options, callback);
}

const getDSUVersionHashlink = (keySSI, versionNumber, callback) => {
    if (typeof keySSI === "string") {
        try {
            keySSI = keySSISpace.parse(keySSI);
        } catch (e) {
            return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${keySSI}`, e));
        }
    }
    const anchoringAPI = require("opendsu").loadAPI("anchoring");
    const anchoringX = anchoringAPI.getAnchoringX();
    keySSI.getAnchorId((err, anchorId) => {
        if (err) {
            return callback(err);
        }
        anchoringX.getAllVersions(anchorId, (err, versions) => {
            if (err) {
                return callback(err);
            }

            if (!versions || !versions.length) {
                return callback(createOpenDSUErrorWrapper(`No versions found for anchor ${anchorId}`));
            }
            const versionHashLink = versions[versionNumber];
            if (!versionHashLink) {
                return callback(createOpenDSUErrorWrapper(`Version number ${versionNumber} for anchor ${anchorId} does not exist.`));
            }

            callback(undefined, versionHashLink);
        })
    })
}

const getVersionNumberFromKeySSI = (keySSI) => {
    let versionNumber;
    try {
        versionNumber = parseInt(keySSI.getHint());
    } catch (e) {
        return undefined;
    }

    if (versionNumber < 0) {
        return undefined;
    }

    return versionNumber;
}

const loadDSUVersionBasedOnVersionNumber = (keySSI, versionNumber, callback) => {
    getDSUVersionHashlink(keySSI, versionNumber, (err, versionHashLink) => {
        if (err) {
            return callback(err);
        }

        loadDSUVersion(keySSI, versionHashLink, callback);
    })
}

const loadFallbackDSU = (keySSI, options, callback) => {
    if (typeof keySSI === "string") {
        try {
            keySSI = keySSISpace.parse(keySSI);
        } catch (e) {
            return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${keySSI}`, e));
        }
    }
    const anchoringAPI = require("opendsu").loadAPI("anchoring");
    const anchoringX = anchoringAPI.getAnchoringX();

    keySSI.getAnchorId((err, anchorId) => {
        if (err) {
            return callback(createOpenDSUErrorWrapper(`Failed to get anchorId for keySSI ${keySSI.getIdentifier()}`, err));
        }

        anchoringX.getAllVersions(anchorId, (err, versions) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to get versions for anchorId ${anchorId}`, err));
            }

            if (!versions || !versions.length) {
                return callback(createOpenDSUErrorWrapper(`No versions found for anchorId ${anchorId}`));
            }

            const __loadFallbackDSURecursively = (index) => {
                const versionHashlink = versions[index];
                if (typeof versionHashlink === "undefined") {
                    //we weren't able to load any version of the dsu (const or not)
                    options.addLog = false;
                    return createDSUForExistingSSI(keySSI, options, (err, recoveredInstance) => {
                        if(err){
                            return callback(err);
                        }

                        if(typeof options.contentRecoveryFnc === "function"){
                            let ignoreError = false;
                            try{
                                let cb = (err)=>{
                                    ignoreError = true;
                                    if(err){
                                        return callback(createOpenDSUErrorWrapper(`Failed to recover fallback DSU for keySSI ${keySSI.getIdentifier()}`, err));
                                    }

                                    return callback(undefined, recoveredInstance);
                                };

                                options.contentRecoveryFnc(recoveredInstance, cb);
                            }catch(err){
                                if(!ignoreError){
                                    return callback(createOpenDSUErrorWrapper(`Caught an error in contentRecoveryFunction`, err));
                                }
                                throw err;
                            }
                            return;
                        }

                        return callback(undefined, recoveredInstance);
                    });
                }

                loadDSUVersion(keySSI, versionHashlink, options, (err, dsuInstance) => {
                    if (err) {
                        return __loadFallbackDSURecursively(index - 1);
                    }

                    callback(undefined, dsuInstance);
                })
            }

            __loadFallbackDSURecursively(versions.length - 1);
        })
    })
}

const loadDSU = (keySSI, options, callback) => {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }

    if (typeof keySSI === "string") {
        try {
            keySSI = keySSISpace.parse(keySSI);
        } catch (e) {
            return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${keySSI}`, e));
        }
    }

    const versionNumber = keySSI.getDSUVersionHint();
    if (Number.isInteger(versionNumber)) {
        return loadDSUVersionBasedOnVersionNumber(keySSI, versionNumber, callback);
    }

    if (options.recoveryMode) {
        return loadFallbackDSU(keySSI, options, callback);
    }

    const keySSIResolver = getResolver(options);
    keySSIResolver.loadDSU(keySSI, options, (err, dsuInstance) => {
        if (err) {
            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU`, err));
        }

        callback(undefined, dsuInstance);
    });
};

/*
    boot the DSU in a thread
 */
const getDSUHandler = (dsuKeySSI) => {
    if (typeof dsuKeySSI === "string") {
        // validate the dsuKeySSI to ensure it's valid
        try {
            keySSISpace.parse(dsuKeySSI);
        } catch (error) {
            const errorMessage = `Cannot parse keySSI ${dsuKeySSI}`;
            console.error(errorMessage, error);
            throw new Error(errorMessage);
        }
    }

    const syndicate = require("syndicate");

    function DSUHandler() {
        switch ($$.environmentType) {
            case ENVIRONMENT_TYPES.SERVICE_WORKER_ENVIRONMENT_TYPE:
                throw new Error(`service-worker environment is not supported!`);
            case ENVIRONMENT_TYPES.BROWSER_ENVIRONMENT_TYPE:
                if (!window.Worker) {
                    throw new Error("Current environment does not support Web Workers!");
                }

                console.log("[Handler] starting web worker...");

                let blobURL = getWebWorkerBootScript(dsuKeySSI);
                workerPool = syndicate.createWorkerPool({
                    bootScript: blobURL,
                    maximumNumberOfWorkers: 1,
                    workerStrategy: syndicate.WorkerStrategies.WEB_WORKERS,
                });

                setTimeout(() => {
                    // after usage, the blob must be removed in order to avoit memory leaks
                    // it requires a timeout in order for syndicate to be able to get the blob script before it's removed
                    URL.revokeObjectURL(blobURL);
                });

                break;
            case ENVIRONMENT_TYPES.NODEJS_ENVIRONMENT_TYPE: {
                console.log("[Handler] starting node worker...");

                const script = getNodeWorkerBootScript(dsuKeySSI);
                workerPool = syndicate.createWorkerPool({
                    bootScript: script,
                    maximumNumberOfWorkers: 1,
                    workerOptions: {
                        eval: true,
                    },
                });

                break;
            }
            default:
                throw new Error(`Unknown environment ${$$.environmentType}!`);
        }

        const sendTaskToWorker = (task, callback) => {
            workerPool.addTask(task, (err, message) => {
                if (err) {
                    return callback(err);
                }

                let {error, result} =
                    typeof Event !== "undefined" && message instanceof Event ? message.data : message;

                if (error) {
                    return callback(error);
                }

                if (result) {
                    if (result instanceof Uint8Array) {
                        // the buffers sent from the worker will be converted to Uint8Array when sending to parent
                        result = Buffer.from(result);
                    } else {
                        try {
                            result = JSON.parse(result);
                        } catch (error) {
                            // if parsing fails then the string must be an ordinary one so we leave it as it is
                        }
                    }
                }

                callback(error, result);
            });
        };

        this.callDSUAPI = function (fn, ...args) {
            const fnArgs = [...args];
            const callback = fnArgs.pop();

            const parseResult = (error, result) => {
                if (error) {
                    return callback(error);
                }

                // try to recreate keyssi
                try {
                    result = keySSISpace.parse(result);
                } catch (error) {
                    // if it fails, then the result is not a valid KeySSI
                }
                callback(undefined, result);
            };

            sendTaskToWorker({fn, args: fnArgs}, parseResult);
        };

        this.callApi = function (fn, ...args) {
            const apiArgs = [...args];
            const callback = apiArgs.pop();
            sendTaskToWorker({api: fn, args: apiArgs}, callback);
        };
    }

    let res = new DSUHandler();
    let availableFunctions = [
        "addFile",
        "addFiles",
        "addFolder",
        "appendToFile",
        "createFolder",
        "delete",
        //"extractFile",
        //"extractFolder",
        "listFiles",
        "listFolders",
        "mount",
        "readDir",
        "readFile",
        "rename",
        "unmount",
        "writeFile",
        "listMountedDSUs",
        "beginBatch",
        "commitBatch",
        "cancelBatch",
    ];

    function getWrapper(functionName) {
        return function (...args) {
            res.callDSUAPI(functionName, ...args);
        }.bind(res);
    }

    for (let f of availableFunctions) {
        res[f] = getWrapper(f);
    }

    return res;
};

const getRemoteHandler = (dsuKeySSI, remoteURL, presentation) => {
    throw Error("Not available yet");
};

function invalidateDSUCache(dsuKeySSI, callback) {
    //there is a cache at Bar level...
    return callback();
}

module.exports = {
    createDSU,
    createDSUx,
    createSeedDSU,
    createConstDSU,
    createArrayDSU,
    createDSUForExistingSSI,
    loadDSU,
    getDSUHandler,
    registerDSUFactory,
    invalidateDSUCache,
    loadDSUVersion
};
