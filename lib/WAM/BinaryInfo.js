"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryInfo = void 0;
class BinaryInfo {
    constructor(options = {}) {
        this.protocolVersion = 5;
        this.sequence = 0;
        this.events = [];
        this.buffer = [];
        Object.assign(this, options);
    }
    processEvents() {
        // Process events in batches for better performance
        while (this.events.length > 0) {
            const event = this.events.shift();
            // Add your event processing logic here
        }
    }
    addEvent(event) {
        // Add event to the buffer and process if buffer is full
        this.buffer.push(event);
        if (this.buffer.length >= 100) {
            this.events.push(...this.buffer);
            this.buffer = [];
            this.processEvents();
        }
    }
}
exports.BinaryInfo = BinaryInfo;