"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();

Object.defineProperty(exports, "__esModule", { value: true });
exports.makeLibSignalRepository = makeLibSignalRepository;

const libsignal = __importStar(require("libsignal"));
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const sender_key_name_1 = require("./Group/sender-key-name");
const sender_key_record_1 = require("./Group/sender-key-record");
const Group_1 = require("./Group");
const lid_mapping_1 = require("./lid-mapping");

/**
 * Backport of Baileys-master LID-aware Signal repository.
 * This fixes "SessionError: No sessions" in LID-addressed groups by:
 * - maintaining a PN<->LID mapping store (persisted in keys)
 * - resolving PN signal addresses to LID signal addresses when a mapping exists
 */
function makeLibSignalRepository(auth, logger, pnToLIDFunc) {
    const log = logger || console;
    const lidMapping = new lid_mapping_1.LIDMappingStore(auth.keys, log, pnToLIDFunc);
    const storage = signalStorage(auth, lidMapping, log);
    const parsedKeys = auth.keys;
    const withTxn = (fn, tag) => {
        if (typeof parsedKeys?.transaction === 'function') {
            return parsedKeys.transaction(fn, tag);
        }
        return fn();
    };
    return {
        // expose mapping store
        lidMapping,

        decryptGroupMessage({ group, authorJid, msg }) {
            const senderName = jidToSignalSenderKeyName(group, authorJid);
            const cipher = new Group_1.GroupCipher(storage, senderName);
            return withTxn(() => cipher.decrypt(msg), group);
        },
        async processSenderKeyDistributionMessage({ item, authorJid }) {
            const builder = new Group_1.GroupSessionBuilder(storage);
            if (!item.groupId) {
                throw new Error('Group ID is required for sender key distribution message');
            }
            const senderName = jidToSignalSenderKeyName(item.groupId, authorJid);
            const senderMsg = new Group_1.SenderKeyDistributionMessage(null, null, null, null, item.axolotlSenderKeyDistributionMessage);
            const senderNameStr = senderName.toString();
            const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
            if (!senderKey) {
                await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
            }
            return withTxn(async () => {
                const { [senderNameStr]: sk } = await auth.keys.get('sender-key', [senderNameStr]);
                if (!sk) {
                    await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
                }
                await builder.process(senderName, senderMsg);
            }, item.groupId);
        },
        async decryptMessage({ jid, type, ciphertext }) {
            const addr = jidToSignalProtocolAddress(jid);
            const session = new libsignal.SessionCipher(storage, addr);
            const doDecrypt = async () => {
                switch (type) {
                    case 'pkmsg':
                        return await session.decryptPreKeyWhisperMessage(ciphertext);
                    case 'msg':
                        return await session.decryptWhisperMessage(ciphertext);
                    default:
                        throw new Error(`Unknown message type: ${type}`);
                }
            };
            return withTxn(() => doDecrypt(), jid);
        },
        async encryptMessage({ jid, data }) {
            const addr = jidToSignalProtocolAddress(jid);
            const cipher = new libsignal.SessionCipher(storage, addr);
            return withTxn(async () => {
                const { type: sigType, body } = await cipher.encrypt(data);
                const type = sigType === 3 ? 'pkmsg' : 'msg';
                return { type, ciphertext: Buffer.from(body, 'binary') };
            }, jid);
        },
        async encryptGroupMessage({ group, meId, data }) {
            const senderName = jidToSignalSenderKeyName(group, meId);
            const builder = new Group_1.GroupSessionBuilder(storage);
            const senderNameStr = senderName.toString();
            return withTxn(async () => {
                const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
                if (!senderKey) {
                    await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
                }
                const senderKeyDistributionMessage = await builder.create(senderName);
                const session = new Group_1.GroupCipher(storage, senderName);
                const ciphertext = await session.encrypt(data);
                return {
                    ciphertext,
                    senderKeyDistributionMessage: senderKeyDistributionMessage.serialize()
                };
            }, group);
        },
        async injectE2ESession({ jid, session }) {
            log?.debug?.({ jid }, 'injecting E2EE session');
            const cipher = new libsignal.SessionBuilder(storage, jidToSignalProtocolAddress(jid));
            return withTxn(async () => {
                await cipher.initOutgoing(session);
            }, jid);
        },
        jidToSignalProtocolAddress(jid) {
            return jidToSignalProtocolAddress(jid).toString();
        },
        async validateSession(jid) {
            try {
                const addr = jidToSignalProtocolAddress(jid);
                const session = await storage.loadSession(addr.toString());
                if (!session) {
                    return { exists: false, reason: 'no session' };
                }
                if (typeof session.haveOpenSession === 'function' && !session.haveOpenSession()) {
                    return { exists: false, reason: 'no open session' };
                }
                return { exists: true };
            }
            catch (e) {
                return { exists: false, reason: 'validation error' };
            }
        }
    };
}

const jidToSignalProtocolAddress = (jid) => {
    const decoded = (0, WABinary_1.jidDecode)(jid);
    const user = decoded?.user;
    const device = decoded?.device;
    return new libsignal.ProtocolAddress(user, device || 0);
};

const jidToSignalSenderKeyName = (group, user) => {
    return new sender_key_name_1.SenderKeyName(group, jidToSignalProtocolAddress(user));
};

function signalStorage({ creds, keys }, lidMapping, logger) {
    // Attempt to resolve PN signal address -> LID signal address when a mapping exists.
    // libsignal ProtocolAddress.toString() format in this fork is typically: "<user>.<device>"
    const resolveLIDSignalAddress = async (id) => {
        try {
            if (!id || typeof id !== 'string') return id;
            const parts = id.split('.');
            if (parts.length < 2) return id;
            const user = parts[0];
            const device = parts[1] || '0';
            // Build PN jid for mapping lookup. Most bots operate on pn domain.
            const pnJid = `${user}${device !== '0' ? `:${device}` : ''}@s.whatsapp.net`;
            const lidForPn = await lidMapping?.getLIDForPN(pnJid);
            if (lidForPn) {
                const lidAddr = jidToSignalProtocolAddress(lidForPn);
                return lidAddr.toString();
            }
        }
        catch (e) {
            logger?.trace?.({ e }, 'resolveLIDSignalAddress failed');
        }
        return id;
    };

    return {
        loadSession: async (id) => {
            try {
                const wireId = await resolveLIDSignalAddress(id);
                const { [wireId]: sess } = await keys.get('session', [wireId]);
                if (sess) {
                    return libsignal.SessionRecord.deserialize(sess);
                }
            }
            catch {
                // ignore
            }
        },
        storeSession: async (id, session) => {
            const wireId = await resolveLIDSignalAddress(id);
            await keys.set({ session: { [wireId]: session.serialize() } });
        },
        isTrustedIdentity: () => true,
        loadPreKey: async (id) => {
            const keyId = id.toString();
            const { [keyId]: key } = await keys.get('pre-key', [keyId]);
            if (key) {
                return {
                    privKey: Buffer.from(key.private),
                    pubKey: Buffer.from(key.public)
                };
            }
        },
        removePreKey: (id) => keys.set({ 'pre-key': { [id]: null } }),
        loadSignedPreKey: () => {
            const key = creds.signedPreKey;
            return {
                privKey: Buffer.from(key.keyPair.private),
                pubKey: Buffer.from(key.keyPair.public)
            };
        },
        loadSenderKey: async (senderKeyName) => {
            const keyId = senderKeyName.toString();
            const { [keyId]: key } = await keys.get('sender-key', [keyId]);
            if (key) {
                return sender_key_record_1.SenderKeyRecord.deserialize(key);
            }
            return new sender_key_record_1.SenderKeyRecord();
        },
        storeSenderKey: async (senderKeyName, key) => {
            const keyId = senderKeyName.toString();
            const serialized = JSON.stringify(key.serialize());
            await keys.set({ 'sender-key': { [keyId]: Buffer.from(serialized, 'utf-8') } });
        },
        getOurRegistrationId: () => creds.registrationId,
        getOurIdentity: () => {
            const { signedIdentityKey } = creds;
            return {
                privKey: Buffer.from(signedIdentityKey.private),
                pubKey: (0, Utils_1.generateSignalPubKey)(signedIdentityKey.public)
            };
        }
    };
}