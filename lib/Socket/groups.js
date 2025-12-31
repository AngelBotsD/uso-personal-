"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGroupMetadata = exports.makeGroupsSocket = void 0;
const WAProto_1 = require("../../WAProto");
const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const chats_1 = require("./chats");
const makeGroupsSocket = (config) => {
    const sock = (0, chats_1.makeChatsSocket)(config);
    const { authState, ev, query, upsertMessage } = sock;
    const groupQuery = async (jid, type, content) => (query({
        tag: 'iq',
        attrs: {
            type,
            xmlns: 'w:g2',
            to: jid,
        },
        content
    }));
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    const isRateOverlimit = (err) => {
        const msg = String((err === null || err === void 0 ? void 0 : err.message) || err || "");
        const code = (err === null || err === void 0 ? void 0 : err.status) || (err === null || err === void 0 ? void 0 : err.statusCode) || ((err === null || err === void 0 ? void 0 : err.output) && err.output.statusCode);
        return msg.includes("rate-overlimit") || code === 429;
    };
    // Fast, deduped & rate-limit-safe group metadata cache
    const GROUP_META_TTL_MS = Math.max(5_000, Number(config.groupMetadataCacheTtlMs || 60_000));
    const GROUP_META_MAX_STALE_MS = Math.max(GROUP_META_TTL_MS, Number(config.groupMetadataCacheMaxStaleMs || 10 * 60_000));
    const GROUP_META_MIN_FETCH_INTERVAL_MS = Math.max(0, Number(config.groupMetadataMinIntervalMs || 5_000));
    const groupMetaCache = new Map(); // jid => { ts, lastFetchTs, data }
    const groupMetaInflight = new Map(); // jid => Promise<GroupMetadata>
    const setGroupMetaCache = (jid, data) => {
        const now = Date.now();
        groupMetaCache.set(jid, { ts: now, lastFetchTs: now, data });
        if (typeof WABinary_1.cacheGroupParticipantMappings === "function" && (data === null || data === void 0 ? void 0 : data.participants)) {
            try {
                WABinary_1.cacheGroupParticipantMappings(data.participants);
            }
            catch (_e) { }
        }
    };
    const fetchGroupMetadataFresh = async (jid) => {
        // exponential backoff on rate-overlimit
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                const result = await groupQuery(jid, "get", [{ tag: "query", attrs: { request: "interactive" } }]);
                const meta = (0, exports.extractGroupMetadata)(result);
                setGroupMetaCache(jid, meta);
            setGroupMetaCache(meta.id, meta);
            return meta;
            }
            catch (err) {
                if (isRateOverlimit(err) && attempt < 3) {
                    const delay = Math.min(30_000, 200 * Math.pow(2, attempt));
                    await sleep(delay);
                    continue;
                }
                throw err;
            }
        }
        const result = await groupQuery(jid, "get", [{ tag: "query", attrs: { request: "interactive" } }]);
        const meta = (0, exports.extractGroupMetadata)(result);
        setGroupMetaCache(jid, meta);
            setGroupMetaCache(meta.id, meta);
            return meta;
    };
    const groupMetadata = async (jid) => {
        const now = Date.now();
        const cached = groupMetaCache.get(jid);
        if (cached === null || cached === void 0 ? void 0 : cached.data) {
            const age = now - (cached.ts || 0);
            if (age <= GROUP_META_TTL_MS) {
                return cached.data;
            }
            const sinceFetch = now - (cached.lastFetchTs || 0);
            if (sinceFetch < GROUP_META_MIN_FETCH_INTERVAL_MS && age <= GROUP_META_MAX_STALE_MS) {
                return cached.data;
            }
        }
        const inflight = groupMetaInflight.get(jid);
        if (inflight) {
            try {
                return await inflight;
            }
            catch (err) {
                if (cached === null || cached === void 0 ? void 0 : cached.data) {
                    const age = now - (cached.ts || 0);
                    if (age <= GROUP_META_MAX_STALE_MS) {
                        return cached.data;
                    }
                }
                throw err;
            }
        }
        const p = (async () => {
            if (cached === null || cached === void 0 ? void 0 : cached.data) {
                groupMetaCache.set(jid, { ...cached, lastFetchTs: now });
            }
            else {
                groupMetaCache.set(jid, { ts: 0, lastFetchTs: now, data: undefined });
            }
            try {
                return await fetchGroupMetadataFresh(jid);
            }
            catch (err) {
                const fallback = groupMetaCache.get(jid);
                if (fallback === null || fallback === void 0 ? void 0 : fallback.data) {
                    const age = Date.now() - (fallback.ts || 0);
                    if (age <= GROUP_META_MAX_STALE_MS) {
                        return fallback.data;
                    }
                }
                throw err;
            }
            finally {
                groupMetaInflight.delete(jid);
            }
        })();
        groupMetaInflight.set(jid, p);
        return await p;
    };
    const groupFetchAllParticipating = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                to: '@g.us',
                xmlns: 'w:g2',
                type: 'get',
            },
            content: [
                {
                    tag: 'participating',
                    attrs: {},
                    content: [
                        { tag: 'participants', attrs: {} },
                        { tag: 'description', attrs: {} }
                    ]
                }
            ]
        });
        const data = {};
        const groupsChild = (0, WABinary_1.getBinaryNodeChild)(result, 'groups');
        if (groupsChild) {
            const groups = (0, WABinary_1.getBinaryNodeChildren)(groupsChild, 'group');
            for (const groupNode of groups) {
                const meta = (0, exports.extractGroupMetadata)({
                    tag: 'result',
                    attrs: {},
                    content: [groupNode]
                });
                if (typeof WABinary_1.cacheGroupParticipantMappings === 'function') {
                    WABinary_1.cacheGroupParticipantMappings(meta.participants);
                }
                setGroupMetaCache(meta.id, meta);
                data[meta.id] = meta;
            }
        }
        sock.ev.emit('groups.update', Object.values(data));
        return data;
    };
    sock.ws.on('CB:ib,,dirty', async (node) => {
        const { attrs } = (0, WABinary_1.getBinaryNodeChild)(node, 'dirty');
        if (attrs.type !== 'groups') {
            return;
        }
        await groupFetchAllParticipating();
        await sock.cleanDirtyBits('groups');
    });
    return {
        ...sock,
        groupQuery,
        groupMetadata,
        groupCreate: async (subject, participants) => {
            const key = (0, Utils_1.generateMessageIDV2)();
            const result = await groupQuery('@g.us', 'set', [
                {
                    tag: 'create',
                    attrs: {
                        subject,
                        key
                    },
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            const meta = (0, exports.extractGroupMetadata)(result);
            if (typeof WABinary_1.cacheGroupParticipantMappings === 'function') {
                WABinary_1.cacheGroupParticipantMappings(meta.participants);
            }
            setGroupMetaCache(meta.id, meta);
            return meta;
        },
        groupLeave: async (id) => {
            await groupQuery('@g.us', 'set', [
                {
                    tag: 'leave',
                    attrs: {},
                    content: [
                        { tag: 'group', attrs: { id } }
                    ]
                }
            ]);
        },
        groupUpdateSubject: async (jid, subject) => {
            await groupQuery(jid, 'set', [
                {
                    tag: 'subject',
                    attrs: {},
                    content: Buffer.from(subject, 'utf-8')
                }
            ]);
        },
        groupRequestParticipantsList: async (jid) => {
            const result = await groupQuery(jid, 'get', [
                {
                    tag: 'membership_approval_requests',
                    attrs: {}
                }
            ]);
            const node = (0, WABinary_1.getBinaryNodeChild)(result, 'membership_approval_requests');
            const participants = (0, WABinary_1.getBinaryNodeChildren)(node, 'membership_approval_request');
            return participants.map(v => v.attrs);
        },
        groupRequestParticipantsUpdate: async (jid, participants, action) => {
            const result = await groupQuery(jid, 'set', [{
                    tag: 'membership_requests_action',
                    attrs: {},
                    content: [
                        {
                            tag: action,
                            attrs: {},
                            content: participants.map(jid => ({
                                tag: 'participant',
                                attrs: { jid }
                            }))
                        }
                    ]
                }]);
            const node = (0, WABinary_1.getBinaryNodeChild)(result, 'membership_requests_action');
            const nodeAction = (0, WABinary_1.getBinaryNodeChild)(node, action);
            const participantsAffected = (0, WABinary_1.getBinaryNodeChildren)(nodeAction, 'participant');
            return participantsAffected.map(p => {
                return { status: p.attrs.error || '200', jid: p.attrs.jid };
            });
        },
        groupParticipantsUpdate: async (jid, participants, action) => {
            const result = await groupQuery(jid, 'set', [
                {
                    tag: action,
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            const node = (0, WABinary_1.getBinaryNodeChild)(result, action);
            const participantsAffected = (0, WABinary_1.getBinaryNodeChildren)(node, 'participant');
            return participantsAffected.map(p => {
                return { status: p.attrs.error || '200', jid: p.attrs.jid, content: p };
            });
        },
        groupUpdateDescription: async (jid, description) => {
            var _a;
            const metadata = await groupMetadata(jid);
            const prev = (_a = metadata.descId) !== null && _a !== void 0 ? _a : null;
            await groupQuery(jid, 'set', [
                {
                    tag: 'description',
                    attrs: {
                        ...(description ? { id: (0, Utils_1.generateMessageIDV2)() } : { delete: 'true' }),
                        ...(prev ? { prev } : {})
                    },
                    content: description ? [
                        { tag: 'body', attrs: {}, content: Buffer.from(description, 'utf-8') }
                    ] : undefined
                }
            ]);
        },
        groupInviteCode: async (jid) => {
            const result = await groupQuery(jid, 'get', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = (0, WABinary_1.getBinaryNodeChild)(result, 'invite');
            return inviteNode === null || inviteNode === void 0 ? void 0 : inviteNode.attrs.code;
        },
        groupRevokeInvite: async (jid) => {
            const result = await groupQuery(jid, 'set', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = (0, WABinary_1.getBinaryNodeChild)(result, 'invite');
            return inviteNode === null || inviteNode === void 0 ? void 0 : inviteNode.attrs.code;
        },
        groupAcceptInvite: async (code) => {
            const results = await groupQuery('@g.us', 'set', [{ tag: 'invite', attrs: { code } }]);
            const result = (0, WABinary_1.getBinaryNodeChild)(results, 'group');
            return result === null || result === void 0 ? void 0 : result.attrs.jid;
        },
        /**
         * revoke a v4 invite for someone
         * @param groupJid group jid
         * @param invitedJid jid of person you invited
         * @returns true if successful
         */
        groupRevokeInviteV4: async (groupJid, invitedJid) => {
            const result = await groupQuery(groupJid, 'set', [{ tag: 'revoke', attrs: {}, content: [{ tag: 'participant', attrs: { jid: invitedJid } }] }]);
            return !!result;
        },
        groupAcceptInviteV4: ev.createBufferedFunction(async (key, inviteMessage) => {
            var _a;
            key = typeof key === 'string' ? { remoteJid: key } : key;
            const results = await groupQuery(inviteMessage.groupJid, 'set', [{
                    tag: 'accept',
                    attrs: {
                        code: inviteMessage.inviteCode,
                        expiration: inviteMessage.inviteExpiration.toString(),
                        admin: key.remoteJid
                    }
                }]);
         
            if (key.id) {
                
                inviteMessage = WAProto_1.proto.Message.GroupInviteMessage.fromObject(inviteMessage);
                inviteMessage.inviteExpiration = 0;
                inviteMessage.inviteCode = '';
                ev.emit('messages.update', [
                    {
                        key,
                        update: {
                            message: {
                                groupInviteMessage: inviteMessage
                            }
                        }
                    }
                ]);
            }
           
            await upsertMessage({
                key: {
                    remoteJid: inviteMessage.groupJid,
                    id: (0, Utils_1.generateMessageIDV2)((_a = sock.user) === null || _a === void 0 ? void 0 : _a.id),
                    fromMe: false,
                    participant: key.remoteJid,
                },
                messageStubType: Types_1.WAMessageStubType.GROUP_PARTICIPANT_ADD,
                messageStubParameters: [
                    authState.creds.me.id
                ],
                participant: key.remoteJid,
                messageTimestamp: (0, Utils_1.unixTimestampSeconds)()
            }, 'notify');
            return results.attrs.from;
        }),
        groupGetInviteInfo: async (code) => {
            const results = await groupQuery('@g.us', 'get', [{ tag: 'invite', attrs: { code } }]);
            return (0, exports.extractGroupMetadata)(results);
        },
        groupToggleEphemeral: async (jid, ephemeralExpiration) => {
            const content = ephemeralExpiration ?
                { tag: 'ephemeral', attrs: { expiration: ephemeralExpiration.toString() } } :
                { tag: 'not_ephemeral', attrs: {} };
            await groupQuery(jid, 'set', [content]);
        },
        groupSettingUpdate: async (jid, setting) => {
            await groupQuery(jid, 'set', [{ tag: setting, attrs: {} }]);
        },
        groupMemberAddMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [{ tag: 'member_add_mode', attrs: {}, content: mode }]);
        },
        groupJoinApprovalMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [{ tag: 'membership_approval_mode', attrs: {}, content: [{ tag: 'group_join', attrs: { state: mode } }] }]);
        },
        groupFetchAllParticipating
    };
};
exports.makeGroupsSocket = makeGroupsSocket;
const extractGroupMetadata = (result) => {
    var _a, _b;
    const group = (0, WABinary_1.getBinaryNodeChild)(result, 'group');
    const descChild = (0, WABinary_1.getBinaryNodeChild)(group, 'description');
    let desc;
    let descId;
    let descOwner;
    let descOwnerLid;
    let descTime;
    if (descChild) {
        desc = (0, WABinary_1.getBinaryNodeChildString)(descChild, 'body');
        descOwner = (0, WABinary_1.jidNormalizedUser)(descChild.attrs.participant_pn || descChild.attrs.participant);
        if (group.attrs.addressing_mode === 'lid') {
            descOwnerLid = (0, WABinary_1.jidNormalizedUser)(descChild.attrs.participant);
        }
        descId = descChild.attrs.id;
        descTime = descChild.attrs.t ? +descChild.attrs.t : undefined;
    }
    const groupSize = group.attrs.size ? Number(group.attrs.size) : undefined;
    const groupId = group.attrs.id.includes('@') ? group.attrs.id : (0, WABinary_1.jidEncode)(group.attrs.id, 'g.us');
    const eph = (_a = (0, WABinary_1.getBinaryNodeChild)(group, 'ephemeral')) === null || _a === void 0 ? void 0 : _a.attrs.expiration;
    const memberAddMode = (0, WABinary_1.getBinaryNodeChildString)(group, 'member_add_mode') === 'all_member_add';
    const metadata = {
        id: groupId,
        addressingMode: group.attrs.addressing_mode,
        subject: group.attrs.subject,
        subjectOwner: (0, WABinary_1.jidNormalizedUser)(group.attrs.s_o_pn || group.attrs.s_o),
        ...(group.attrs.addressing_mode === 'lid' ? { subjectOwnerLid: (0, WABinary_1.jidNormalizedUser)(group.attrs.s_o) } : {}),
        subjectTime: group.attrs.s_t ? +group.attrs.s_t : undefined,
        size: groupSize || (0, WABinary_1.getBinaryNodeChildren)(group, 'participant').length,
        creation: group.attrs.creation ? +group.attrs.creation : undefined,
        owner: (0, WABinary_1.jidNormalizedUser)(group.attrs.creator_pn || group.attrs.creator),
        ...(group.attrs.addressing_mode === 'lid' ? { ownerLid: (0, WABinary_1.jidNormalizedUser)(group.attrs.creator) } : {}),
        desc,
        descId,
        descOwner,
        descOwnerLid,
        descTime,
        linkedParent: ((_b = (0, WABinary_1.getBinaryNodeChild)(group, 'linked_parent')) === null || _b === void 0 ? void 0 : _b.attrs.jid) || undefined,
        restrict: !!(0, WABinary_1.getBinaryNodeChild)(group, 'locked'),
        announce: !!(0, WABinary_1.getBinaryNodeChild)(group, 'announcement'),
        isCommunity: !!(0, WABinary_1.getBinaryNodeChild)(group, 'parent'),
        isCommunityAnnounce: !!(0, WABinary_1.getBinaryNodeChild)(group, 'default_sub_group'),
        joinApprovalMode: !!(0, WABinary_1.getBinaryNodeChild)(group, 'membership_approval_mode'),
        memberAddMode,
        participants: (0, WABinary_1.getBinaryNodeChildren)(group, 'participant').map(({ attrs }) => {
            const pnRaw = attrs.phone_number || attrs.jid;
            const pn = (0, WABinary_1.isLidUser)(pnRaw) ? (0, WABinary_1.lidToJid)(pnRaw) : pnRaw;
            const lid = attrs.lid || attrs.jid;
            return {
                id: pn,
                jid: pn,
                lid,
                admin: (attrs.type || null),
            };
        }),
        ephemeralDuration: eph ? +eph : undefined
    };
    return metadata;
};
exports.extractGroupMetadata = extractGroupMetadata;
