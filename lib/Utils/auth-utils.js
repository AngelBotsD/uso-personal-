"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAuthCreds = exports.addTransactionCapability = void 0;
exports.makeCacheableSignalKeyStore = makeCacheableSignalKeyStore;
const crypto_1 = require("crypto");
const node_cache_1 = __importDefault(require("@cacheable/node-cache"));
const async_hooks_1 = require("async_hooks");
const async_mutex_1 = require("async-mutex");
const Defaults_1 = require("../Defaults");
const crypto_2 = require("./crypto");
const generics_1 = require("./generics");

function makeCacheableSignalKeyStore(store, logger, _cache) {
    const cache = _cache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.SIGNAL_STORE, 
        useClones: false,
        deleteOnExpire: true,
    });
    const cacheMutex = new async_mutex_1.Mutex();
    function getUniqueId(type, id) {
        return `${type}.${id}`;
    }
    return {
        async get(type, ids) {
            return cacheMutex.runExclusive(async () => {
                const data = {};
                const idsToFetch = [];
                for (const id of ids) {
                    const item = cache.get(getUniqueId(type, id));
                    if (typeof item !== 'undefined') {
                        data[id] = item;
                    }
                    else {
                        idsToFetch.push(id);
                    }
                }
                if (idsToFetch.length) {
                    logger === null || logger === void 0 ? void 0 : logger.trace({ items: idsToFetch.length }, 'loading from store');
                    const fetched = await store.get(type, idsToFetch);
                    for (const id of idsToFetch) {
                        const item = fetched[id];
                        if (item) {
                            data[id] = item;
                            cache.set(getUniqueId(type, id), item);
                        }
                    }
                }
                return data;
            });
        },
        async set(data) {
            return cacheMutex.runExclusive(async () => {
                let keys = 0;
                for (const type in data) {
                    for (const id in data[type]) {
                        cache.set(getUniqueId(type, id), data[type][id]);
                        keys += 1;
                    }
                }
                logger === null || logger === void 0 ? void 0 : logger.trace({ keys }, 'updated cache');
                await store.set(data);
            });
        },
        async clear() {
            var _a;
            return cacheMutex.runExclusive(async () => {
                cache.flushAll();
                await ((_a = store.clear) === null || _a === void 0 ? void 0 : _a.call(store));
            });
        }
    };
}
/**
 * Adds DB like transaction capability (https://en.wikipedia.org/wiki/Database_transaction) to the SignalKeyStore,
 * this allows batch read & write operations & improves the performance of the lib
 * @param state the key store to apply this capability to
 * @param logger logger to log events
 * @returns SignalKeyStore with transaction capability
 */
const addTransactionCapability = (state, logger, { maxCommitRetries, delayBetweenTriesMs }) => {
    // per-async-call transaction context (prevents cross-talk between parallel tasks)
    const txStorage = new async_hooks_1.AsyncLocalStorage();
    // keyed mutexes for transaction scopes & per-type store operations
    const txMutexes = new Map();
    const txMutexRefCounts = new Map();
    const getTxMutex = (key) => {
        let mutex = txMutexes.get(key);
        if (!mutex) {
            mutex = new async_mutex_1.Mutex();
            txMutexes.set(key, mutex);
            txMutexRefCounts.set(key, 0);
        }
        return mutex;
    };
    const acquireTxMutexRef = (key) => {
        const count = (txMutexRefCounts.get(key) || 0) + 1;
        txMutexRefCounts.set(key, count);
    };
    const releaseTxMutexRef = (key) => {
        const count = (txMutexRefCounts.get(key) || 1) - 1;
        txMutexRefCounts.set(key, count);
        if (count <= 0) {
            const mutex = txMutexes.get(key);
            if (mutex && !mutex.isLocked()) {
                txMutexes.delete(key);
                txMutexRefCounts.delete(key);
            }
        }
    };
    const isInTransaction = () => !!txStorage.getStore();
    const commitWithRetry = async (mutations) => {
        if (!mutations || Object.keys(mutations).length === 0) {
            logger === null || logger === void 0 ? void 0 : logger.trace('no mutations in transaction');
            return;
        }
        logger === null || logger === void 0 ? void 0 : logger.trace('committing transaction');
        for (let attempt = 0; attempt < maxCommitRetries; attempt++) {
            try {
                await state.set(mutations);
                logger === null || logger === void 0 ? void 0 : logger.trace({ mutationCount: Object.keys(mutations).length }, 'committed transaction');
                return;
            }
            catch (error) {
                const retriesLeft = maxCommitRetries - attempt - 1;
                logger === null || logger === void 0 ? void 0 : logger.warn(`failed to commit mutations, retries left=${retriesLeft}`);
                if (retriesLeft === 0) {
                    throw error;
                }
                await (0, generics_1.delay)(delayBetweenTriesMs);
            }
        }
    };
    return {
        get: async (type, ids) => {
            const ctx = txStorage.getStore();
            if (!ctx) {
                // no transaction => direct access for maximum concurrency
                return state.get(type, ids);
            }
            // in transaction => use the per-transaction cache
            const cached = ctx.cache[type] || {};
            const missing = ids.filter(id => !(id in cached));
            if (missing.length > 0) {
                ctx.dbQueries += 1;
                logger === null || logger === void 0 ? void 0 : logger.trace({ type, count: missing.length }, 'fetching missing keys in transaction');
                const fetched = await getTxMutex(type).runExclusive(() => state.get(type, missing));
                ctx.cache[type] = ctx.cache[type] || {};
                Object.assign(ctx.cache[type], fetched);
            }
            return ids.reduce((dict, id) => {
                const value = ctx.cache[type] && ctx.cache[type][id];
                if (typeof value !== 'undefined' && value !== null) {
                    dict[id] = value;
                }
                return dict;
            }, {});
        },
        set: async (data) => {
            const ctx = txStorage.getStore();
            if (!ctx) {
                return state.set(data);
            }
            logger === null || logger === void 0 ? void 0 : logger.trace({ types: Object.keys(data) }, 'caching in transaction');
            for (const key in data) {
                ctx.cache[key] = ctx.cache[key] || {};
                Object.assign(ctx.cache[key], data[key]);
                ctx.mutations[key] = ctx.mutations[key] || {};
                Object.assign(ctx.mutations[key], data[key]);
            }
        },
        isInTransaction,
        transaction: async (work, key = 'global') => {
            const existing = txStorage.getStore();
            if (existing) {
                logger === null || logger === void 0 ? void 0 : logger.trace('reusing existing transaction context');
                return work();
            }
            const mutex = getTxMutex(key);
            acquireTxMutexRef(key);
            try {
                return await mutex.runExclusive(async () => {
                    const ctx = { cache: {}, mutations: {}, dbQueries: 0 };
                    logger === null || logger === void 0 ? void 0 : logger.trace('entering transaction');
                    try {
                        const result = await txStorage.run(ctx, work);
                        await commitWithRetry(ctx.mutations);
                        logger === null || logger === void 0 ? void 0 : logger.trace({ dbQueries: ctx.dbQueries }, 'transaction completed');
                        return result;
                    }
                    catch (error) {
                        logger === null || logger === void 0 ? void 0 : logger.error({ error }, 'transaction failed, rolling back');
                        throw error;
                    }
                });
            }
            finally {
                releaseTxMutexRef(key);
            }
        }
    };
};
exports.addTransactionCapability = addTransactionCapability;
const initAuthCreds = () => {
    const identityKey = crypto_2.Curve.generateKeyPair();
    return {
        noiseKey: crypto_2.Curve.generateKeyPair(),
        pairingEphemeralKeyPair: crypto_2.Curve.generateKeyPair(),
        signedIdentityKey: identityKey,
        signedPreKey: (0, crypto_2.signedKeyPair)(identityKey, 1),
        registrationId: (0, generics_1.generateRegistrationId)(),
        advSecretKey: (0, crypto_1.randomBytes)(32).toString('base64'),
        processedHistoryMessages: [],
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSyncCounter: 0,
        accountSettings: {
            unarchiveChats: false
        },
        registered: false,
        pairingCode: undefined,
        lastPropHash: undefined,
        routingInfo: undefined,
    };
};
exports.initAuthCreds = initAuthCreds;
