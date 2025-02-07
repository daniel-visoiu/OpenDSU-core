function CommunicationHub() {
    const pubSub = require("soundpubsub").soundPubSub;
    const didAPI = require("opendsu").loadAPI("w3cdid");
    const connectedToMQ = {};
    let strongPubSub;
    const getChannelName = (did, messageType) => {
        return `${did.getIdentifier()}/${messageType}`;
    }

    const ensureDIDDocumentIsLoadedThenExecute = (did, fnToExecute) => {
        if (typeof did === "string") {
            return didAPI.resolveDID(did, (err, resolvedDID) => {
                if (err) {
                    console.error(err);
                    return;
                }

                did = resolvedDID;
                fnToExecute(did);
            })
        }

        fnToExecute(did);
    }

    this.subscribe = (did, messageType, callback) => {
        const __subscribe = (did) => {
            if (!connectedToMQ[did.getIdentifier()]) {
                connectedToMQ[did.getIdentifier()] = true;
                did.waitForMessages((err, message) => {
                    if (err) {
                        console.error(err);
                        return;
                    }

                    try {
                        message = JSON.parse(message);
                    } catch (e) {
                        console.error(e);
                        return;
                    }

                    const channelName = getChannelName(did, message.messageType);
                    if (!pubSub.hasChannel(channelName)) {
                        pubSub.addChannel(channelName);
                    }

                    pubSub.publish(channelName, message);
                });
            }
            const channel = getChannelName(did, messageType);
            pubSub.subscribe(channel, callback);
        }

        ensureDIDDocumentIsLoadedThenExecute(did, __subscribe);
    };

    this.unsubscribe = (did, messageType, callback) => {
        const stopWaitingForMessages = (did) => {
            did.stopWaitingForMessages();
            const channel = getChannelName(did, messageType);
            delete connectedToMQ[did.getIdentifier()];
            pubSub.unsubscribe(channel, callback);
        }

        ensureDIDDocumentIsLoadedThenExecute(did, stopWaitingForMessages);
    };

    const subscribers = {};
    // soundpubSub keeps WeakRefs
    this.strongSubscribe = (did, messageType, callback) => {
        const __strongSubscribe = (did) => {
            const channelName = getChannelName(did, messageType);
            if (!subscribers[channelName]) {
                subscribers[channelName] = [];
            }

            const index = subscribers[channelName].findIndex(sub => sub === callback);
            if (index === -1) {
                subscribers[channelName].push(callback);
            }

            this.subscribe(did, messageType, callback);
        }

        ensureDIDDocumentIsLoadedThenExecute(did, __strongSubscribe);
    }

    this.strongUnsubscribe = (did, messageType, callback) => {
        const channelName = getChannelName(did, messageType);
        const __strongUnsubscribe = (did) => {
            if (!subscribers[channelName]) {
                return callback();
            }

            const index = subscribers[channelName].findIndex(sub => sub === callback);
            if (index === -1) {
                return callback();
            }

            subscribers[channelName].splice(index);
            if (subscribers[channelName].length === 0) {
                delete subscribers[channelName];
                return callback();
            }

            this.unsubscribe(did, messageType, callback);
        }

        ensureDIDDocumentIsLoadedThenExecute(did, __strongUnsubscribe);
    }

    this.getPubSub = () => {
        return pubSub;
    }

    const createStrongPubSub = (_pubSub) => {
        const strongPubSub = Object.assign({}, _pubSub);
        strongPubSub.subscribe = (target, callback, waitForMore, filter) => {
            if (!subscribers[target]) {
                subscribers[target] = [];
            }

            const index = subscribers[target].findIndex(sub => sub === callback);
            if (index === -1) {
                subscribers[target].push(callback);
            }

            if (!_pubSub.hasChannel(target)) {
                _pubSub.addChannel(target);
            }

            _pubSub.subscribe(target, callback, waitForMore, filter);
        }

        strongPubSub.unsubscribe = (target, callback, filter) => {
            if (!strongPubSub[target]) {
                return callback();
            }

            const index = subscribers[target].findIndex(sub => sub === callback);
            if (index === -1) {
                return callback();
            }

            subscribers[target].splice(index);
            if (subscribers[target].length === 0) {
                delete subscribers[target];
                return callback();
            }

            _pubSub.unsubscribe(target, callback, filter);
        }

        return strongPubSub;
    }

    this.getStrongPubSub = () => {
        if (!strongPubSub) {
            strongPubSub = createStrongPubSub(pubSub);
        }

        return strongPubSub;
    }
}

const getCommunicationHub = () => {
    if (!$$.CommunicationHub) {
        $$.CommunicationHub = new CommunicationHub();
    }

    return $$.CommunicationHub;
}

module.exports = {
    getCommunicationHub
}
