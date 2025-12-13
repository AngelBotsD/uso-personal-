"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncDeviceProtocol = void 0;
const WABinary_1 = require("../../WABinary");
class USyncDeviceProtocol {
    constructor() {
        this.name = 'devices';
    }
    getQueryElement() {
        return {
            tag: 'devices',
            attrs: {
                version: '2',
            },
        };
    }
    getUserElement(user) {
        if (!user || !user.deviceList || !user.keyIndex) {
            return null;
        }
        return {
            tag: 'devices',
            attrs: {
                version: '2',
                ts: user.keyIndex.timestamp,
                expectedTs: user.keyIndex.expectedTimestamp,
            },
            content: [
                {
                    tag: 'device-list',
                    content: user.deviceList.map(device => ({
                        tag: 'device',
                        attrs: {
                            id: device.id.toString(),
                            'key-index': device.keyIndex.toString(),
                            'is_hosted': device.isHosted ? 'true' : 'false'
                        }
                    }))
                },
                {
                    tag: 'key-index-list',
                    attrs: {
                        ts: user.keyIndex.timestamp.toString(),
                        expected_ts: user.keyIndex.expectedTimestamp?.toString() || undefined
                    },
                    content: user.keyIndex.signedKeyIndex
                }
            ]
        };
    }
    parser(node) {
        const deviceList = [];
        let keyIndex = undefined;
        if (node.tag === 'devices') {
            (0, WABinary_1.assertNodeErrorFree)(node);
            const deviceListNode = (0, WABinary_1.getBinaryNodeChild)(node, 'device-list');
            const keyIndexNode = (0, WABinary_1.getBinaryNodeChild)(node, 'key-index-list');
            if (Array.isArray(deviceListNode?.content)) {
                for (const { tag, attrs } of deviceListNode.content) {
                    const id = +attrs.id;
                    const keyIndex = +attrs['key-index'];
                    if (tag === 'device') {
                        deviceList.push({
                            id,
                            keyIndex,
                            isHosted: !!(attrs['is_hosted'] && attrs['is_hosted'] === 'true')
                        });
                    }
                }
            }
            if ((keyIndexNode?.tag) === 'key-index-list') {
                keyIndex = {
                    timestamp: +keyIndexNode.attrs['ts'],
                    signedKeyIndex: keyIndexNode?.content,
                    expectedTimestamp: keyIndexNode.attrs['expected_ts'] ? +keyIndexNode.attrs['expected_ts'] : undefined
                };
            }
        }
        return {
            deviceList,
            keyIndex
        };
    }
}
exports.USyncDeviceProtocol = USyncDeviceProtocol;