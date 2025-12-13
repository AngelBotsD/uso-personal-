"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SenderChainKey = void 0;
const crypto_1 = require("libsignal/src/crypto");
const sender_message_key_1 = require("./sender-message-key");

class SenderChainKey {
    constructor(iteration, chainKey) {
        this.MESSAGE_KEY_SEED = Buffer.from([0x01]);
        this.CHAIN_KEY_SEED = Buffer.from([0x02]);
        this.iteration = iteration;
        this.chainKey = chainKey instanceof Buffer ? chainKey : Buffer.from(chainKey || []);
    }
    getIteration() {
        return this.iteration;
    }
    getSenderMessageKey() {
        const messageKey = this.getDerivative(this.MESSAGE_KEY_SEED, this.chainKey);
        return new sender_message_key_1.SenderMessageKey(this.iteration, messageKey);
    }
    getNext() {
        const nextChainKey = this.getDerivative(this.CHAIN_KEY_SEED, this.chainKey);
        return new SenderChainKey(this.iteration + 1, nextChainKey);
    }
    getSeed() {
        return this.chainKey;
    }
    getDerivative(seed, key) {
        return (0, crypto_1.calculateMAC)(key, seed);
    }
}
exports.SenderChainKey = SenderChainKey;