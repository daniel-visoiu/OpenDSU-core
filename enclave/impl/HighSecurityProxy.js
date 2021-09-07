const {createCommandObject} = require("./lib/createCommandObject");

function HighSecurityProxy(domain, did) {
    const openDSU = require("opendsu");
    const system = openDSU.loadAPI("system");
    const w3cDID = openDSU.loadAPI("w3cdid");
    const http = openDSU.loadAPI("http");
    const crypto = openDSU.loadAPI("crypto");
    let didDocument;
    const ProxyMixin = require("./ProxyMixin");
    ProxyMixin(this);

    const init = async () => {
        if (typeof did === "undefined") {
            didDocument = await $$.promisify(w3cDID.createIdentity)("key");
        } else {
            didDocument = await $$.promisify(w3cDID.resolveDID)(did);
        }
        did = didDocument.getIdentifier();
        this.url = `${system.getBaseURL()}/runEnclaveEncryptedCommand/${domain}/${did}`;
        this.finishInitialisation();
    }

    this.getDID = (callback) => {
        callback(undefined, did);
    }

    this.__putCommandObject = (commandName, ...args) => {
        const callback = args.pop();
        const command = createCommandObject(commandName, ...args);
        didDocument.getPublicKey("raw", (err, publicKey)=>{
            if (err) {
                return callback(err);
            }

            const encryptionKey = crypto.deriveEncryptionKey(publicKey);
            const encryptedCommand = crypto.encrypt(Buffer.from(JSON.stringify(command)), encryptionKey);
            http.doPut(this.url, encryptedCommand, callback);
        })
    }

    const bindAutoPendingFunctions = require(".././../utils/BindAutoPendingFunctions").bindAutoPendingFunctions;
    bindAutoPendingFunctions(this, "__putCommandObject");
    init();
}

module.exports = HighSecurityProxy;