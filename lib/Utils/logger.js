"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
exports.default = (0, pino_1.default)({
    timestamp: () => `,"time":"${new Date().toJSON()}"`,
    level: process.env.LOG_LEVEL || 'info',
    enabled: process.env.LOG_ENABLED !== 'false'
});