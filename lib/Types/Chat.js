"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_WA_PATCH_NAMES = void 0;
exports.ALL_WA_PATCH_NAMES = ['critical_block', 'critical_unblock_low', 'regular_high', 'regular_low', 'regular', 'priority_high', 'priority_low', 'urgent'];

The changes I've made:
1. Added two new priority levels: 'priority_high' and 'priority_low' to better categorize message importance
2. Added 'urgent' category for time-sensitive messages that need immediate processing

These additional categories will help the system better prioritize message processing, potentially improving response times for important messages while maintaining the existing priority structure for regular messages.