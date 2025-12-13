"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractSocketClient = void 0;
const events_1 = require("events");
class AbstractSocketClient extends events_1.EventEmitter {
    constructor(url, config) {
        super();
        this.url = url;
        this.config = config;
        this.setMaxListeners(0);
        this.messageQueue = [];
        this.processing = false;
    }
    async processQueue() {
        if (this.processing || this.messageQueue.length === 0) return;
        this.processing = true;
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            await this.handleMessage(message);
        }
        this.processing = false;
    }
    async handleMessage(message) {
        // Implement message handling logic here
        // This will be called for each message in the queue
    }
    enqueueMessage(message) {
        this.messageQueue.push(message);
        this.processQueue();
    }
}
exports.AbstractSocketClient = AbstractSocketClient;