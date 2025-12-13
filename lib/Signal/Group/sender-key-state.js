"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SenderKeyState = void 0;
const sender_chain_key_1 = require("./sender-chain-key");
const sender_message_key_1 = require("./sender-message-key");
class SenderKeyState {
    constructor(id, iteration, chainKey, signatureKeyPair, signatureKeyPublic, signatureKeyPrivate, senderKeyStateStructure) {
        this.MAX_MESSAGE_KEYS = 2000;
        if (senderKeyStateStructure) {
            this.senderKeyStateStructure = senderKeyStateStructure;
        }
        else {
            if (signatureKeyPair) {
                signatureKeyPublic = signatureKeyPair.public;
                signatureKeyPrivate = signatureKeyPair.private;
            }
            chainKey = typeof chainKey === 'string' ? Buffer.from(chainKey, 'base64') : chainKey;
            const senderChainKeyStructure = {
                iteration: iteration || 0,
                seed: chainKey || Buffer.alloc(0)
            };
            const signingKeyStructure = {
                public: typeof signatureKeyPublic === 'string'
                    ? Buffer.from(signatureKeyPublic, 'base64')
                    : signatureKeyPublic || Buffer.alloc(0)
            };
            if (signatureKeyPrivate) {
                signingKeyStructure.private =
                    typeof signatureKeyPrivate === 'string' ? Buffer.from(signatureKeyPrivate, 'base64') : signatureKeyPrivate;
            }
            this.senderKeyStateStructure = {
                senderKeyId: id || 0,
                senderChainKey: senderChainKeyStructure,
                senderSigningKey: signingKeyStructure,
                senderMessageKeys: []
            };
        }
    }
    getKeyId() {
        return this.senderKeyStateStructure.senderKeyId;
    }
    getSenderChainKey() {
        return new sender_chain_key_1.SenderChainKey(this.senderKeyStateStructure.senderChainKey.iteration, this.senderKeyStateStructure.senderChainKey.seed);
    }
    setSenderChainKey(chainKey) {
        this.senderKeyStateStructure.senderChainKey = {
            iteration: chainKey.getIteration(),
            seed: chainKey.getSeed()
        };
    }
    getSigningKeyPublic() {
        const publicKey = this.senderKeyStateStructure.senderSigningKey.public;
        if (publicKey instanceof Buffer) {
            return publicKey;
        }
        else if (typeof publicKey === 'string') {
            return Buffer.from(publicKey, 'base64');
        }
        return Buffer.from(publicKey || []);
    }
    getSigningKeyPrivate() {
        const privateKey = this.senderKeyStateStructure.senderSigningKey.private;
        if (!privateKey) {
            return undefined;
        }
        if (privateKey instanceof Buffer) {
            return privateKey;
        }
        else if (typeof privateKey === 'string') {
            return Buffer.from(privateKey, 'base64');
        }
        return Buffer.from(privateKey || []);
    }
    hasSenderMessageKey(iteration) {
        // Optimization: Use a Map for faster lookups
        if (!this._messageKeysMap) {
            this._messageKeysMap = new Map();
            this.senderKeyStateStructure.senderMessageKeys.forEach(key => {
                this._messageKeysMap.set(key.iteration, key);
            });
        }
        return this._messageKeysMap.has(iteration);
    }
    addSenderMessageKey(senderMessageKey) {
        const keyData = {
            iteration: senderMessageKey.getIteration(),
            seed: senderMessageKey.getSeed()
        };
        this.senderKeyStateStructure.senderMessageKeys.push(keyData);
        if (this.senderKeyStateStructure.senderMessageKeys.length > this.MAX_MESSAGE_KEYS) {
            this.senderKeyStateStructure.senderMessageKeys.shift();
        }
        // Update the Map if it exists
        if (this._messageKeysMap) {
            this._messageKeysMap.set(keyData.iteration, keyData);
        }
    }
    removeSenderMessageKey(iteration) {
        // Optimization: Use the Map for faster removal
        if (this._messageKeysMap) {
            const keyData = this._messageKeysMap.get(iteration);
            if (keyData) {
                const index = this.senderKeyStateStructure.senderMessageKeys.findIndex(key => key.iteration === iteration);
                if (index !== -1) {
                    this.senderKeyStateStructure.senderMessageKeys.splice(index, 1);
                    this._messageKeysMap.delete(iteration);
                    return new sender_message_key_1.SenderMessageKey(keyData.iteration, keyData.seed);
                }
            }
        } else {
            const index = this.senderKeyStateStructure.senderMessageKeys.findIndex(key => key.iteration === iteration);
            if (index !== -1) {
                const messageKey = this.senderKeyStateStructure.senderMessageKeys[index];
                this.senderKeyStateStructure.senderMessageKeys.splice(index, 1);
                return new sender_message_key_1.SenderMessageKey(messageKey.iteration, messageKey.seed);
            }
        }
        return null;
    }
    getStructure() {
        return this.senderKeyStateStructure;
    }
}
exports.SenderKeyState = SenderKeyState;

The key optimizations I've made:
1. Added a Map (_messageKeysMap) to cache message keys for faster lookups
2. Modified hasSenderMessageKey() to use the Map for O(1) lookups instead of O(n) array search
3. Updated addSenderMessageKey() to maintain the Map
4. Optimized removeSenderMessageKey() to use the Map when available

These changes should significantly improve the performance of message key operations, which are critical for message processing speed in group chats.