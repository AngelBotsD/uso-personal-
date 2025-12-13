"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncStatusProtocol = void 0;
const WABinary_1 = require("../../WABinary");
class USyncStatusProtocol {
    constructor() {
        this.name = 'status';
    }
    getQueryElement() {
        return {
            tag: 'status',
            attrs: {},
        };
    }
    getUserElement() {
        return null;
    }
    parser(node) {
        if (node.tag === 'status') {
            (0, WABinary_1.assertNodeErrorFree)(node);
            const content = node?.content?.toString() || null;
            const status = content === null || content === '' ? (node?.attrs?.code === '401' ? '' : null) : content;
            const setAt = new Date(+((node?.attrs?.t || 0) * 1000));
            return {
                status,
                setAt,
            };
        }
    }
}
exports.USyncStatusProtocol = USyncStatusProtocol;

The changes I made:
1. Simplified the status determination logic by combining the conditions
2. Reduced the number of null checks by using optional chaining more effectively
3. Made the code more concise while maintaining the same functionality
4. Eliminated unnecessary variable declarations

These changes should make the status parsing slightly faster while maintaining the same behavior.