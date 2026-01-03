"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMultiFileAuthState = void 0;
const async_mutex_1 = require("async-mutex");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const fileLocks = new Map();
// Get or create a mutex for a specific file path
const getFileLock = (path) => {
    let mutex = fileLocks.get(path);
    if (!mutex) {
        mutex = new async_mutex_1.Mutex();
        fileLocks.set(path, mutex);
    }
    return mutex;
};

const AUTH_FILE_CACHE_SIZE = Math.max(0, Number(process.env.BLY_AUTH_CACHE_SIZE || 2000)) | 0;
class SimpleLRU {
    constructor(limit) {
        this.limit = limit;
        this.map = new Map();
    }
    get(key) {
        if (!this.limit) {
            return undefined;
        }
        if (!this.map.has(key)) {
            return undefined;
        }
        const v = this.map.get(key);
        // refresh recency
        this.map.delete(key);
        this.map.set(key, v);
        return v;
    }
    set(key, value) {
        if (!this.limit) {
            return;
        }
        if (this.map.has(key)) {
            this.map.delete(key);
        }
        this.map.set(key, value);
        if (this.map.size > this.limit) {
            // delete oldest
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined) {
                this.map.delete(oldest);
            }
        }
    }
    delete(key) {
        this.map.delete(key);
    }
}
const authFileCache = new SimpleLRU(AUTH_FILE_CACHE_SIZE);
/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
const useMultiFileAuthState = async (folder) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writeData = async (data, file) => {
        const filePath = (0, path_1.join)(folder, fixFileName(file));
        // update cache eagerly so concurrent readers don't re-hit disk
        authFileCache.set(filePath, data);
        const mutex = getFileLock(filePath);
        return mutex.acquire().then(async (release) => {
            try {
                await (0, promises_1.writeFile)(filePath, JSON.stringify(data, generics_1.BufferJSON.replacer));
            }
            finally {
                release();
            }
        });
    };
    const readData = async (file) => {
        try {
            const filePath = (0, path_1.join)(folder, fixFileName(file));
            const cached = authFileCache.get(filePath);
            if (cached !== undefined) {
                return cached;
            }
            const mutex = getFileLock(filePath);
            return await mutex.acquire().then(async (release) => {
                try {
                    const data = await (0, promises_1.readFile)(filePath, { encoding: 'utf-8' });
                    const parsed = JSON.parse(data, generics_1.BufferJSON.reviver);
                    authFileCache.set(filePath, parsed);
                    return parsed;
                }
                finally {
                    release();
                }
            });
        }
        catch (error) {
            // cache miss/absent file to avoid repeated disk attempts
            try {
                const filePath = (0, path_1.join)(folder, fixFileName(file));
                authFileCache.set(filePath, null);
            }
            catch (_a) {
            }
            return null;
        }
    };
    const removeData = async (file) => {
        try {
            const filePath = (0, path_1.join)(folder, fixFileName(file));
            authFileCache.set(filePath, null);
            const mutex = getFileLock(filePath);
            return mutex.acquire().then(async (release) => {
                try {
                    await (0, promises_1.unlink)(filePath);
                }
                catch (_a) {
                }
                finally {
                    release();
                }
            });
        }
        catch (_a) {
        }
    };
    const folderInfo = await (0, promises_1.stat)(folder).catch(() => { });
    if (folderInfo) {
        if (!folderInfo.isDirectory()) {
            throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
        }
    }
    else {
        await (0, promises_1.mkdir)(folder, { recursive: true });
    }
    const fixFileName = (file) => { var _a; return (_a = file === null || file === void 0 ? void 0 : file.replace(/\//g, '__')) === null || _a === void 0 ? void 0 : _a.replace(/:/g, '-'); };
    const creds = await readData('creds.json') || (0, auth_utils_1.initAuthCreds)();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}.json`);
                        if (type === 'app-state-sync-key' && value) {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const file = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            return writeData(creds, 'creds.json');
        }
    };
};
exports.useMultiFileAuthState = useMultiFileAuthState;