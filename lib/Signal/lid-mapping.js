"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.LIDMappingStore = void 0;

const node_cache_1 = require("@cacheable/node-cache");
const WABinary_1 = require("../WABinary");

class LIDMappingStore {
  constructor(keys, logger, pnToLIDFunc) {
    this.keys = keys;
    this.logger = logger;
    this.pnToLIDFunc = pnToLIDFunc;

    this.cache = new node_cache_1.default({
      stdTTL: 3 * 24 * 60 * 60, // seconds (3 days)
      useClones: false,
    });
  }

  async storeLIDPNMappings(pairs) {
    if (!Array.isArray(pairs) || !pairs.length) return;

    const updates = {};
    const revUpdates = {};

    for (const pair of pairs) {
      const lid = pair?.lid;
      const pn = pair?.pn;
      if (!lid || !pn) continue;

      // accept either ordering
      const lidIsLid = (0, WABinary_1.isLidUser)(lid) || (0, WABinary_1.isHostedLidUser?.(lid));
      const pnIsPn = (0, WABinary_1.isPnUser?.(pn)) || (0, WABinary_1.isHostedPnUser?.(pn)) || (0, WABinary_1.isJidUser)(pn);
      const pnIsLid = (0, WABinary_1.isLidUser)(pn) || (0, WABinary_1.isHostedLidUser?.(pn));
      const lidIsPn = (0, WABinary_1.isPnUser?.(lid)) || (0, WABinary_1.isHostedPnUser?.(lid)) || (0, WABinary_1.isJidUser)(lid);

      let pnJid = pn;
      let lidJid = lid;
      if (pnIsLid && lidIsPn) {
        pnJid = lid;
        lidJid = pn;
      }

      const pnDecoded = (0, WABinary_1.jidDecode)(pnJid);
      const lidDecoded = (0, WABinary_1.jidDecode)(lidJid);
      if (!pnDecoded || !lidDecoded) continue;

      const pnUser = pnDecoded.user;
      const lidUser = lidDecoded.user;
      if (!pnUser || !lidUser) continue;

      // skip if already cached equal
      const cached = this.cache.get(`pn:${pnUser}`);
      if (cached && cached === lidUser) continue;

      updates[pnUser] = lidUser;
      revUpdates[`${lidUser}_reverse`] = pnUser;

      this.cache.set(`pn:${pnUser}`, lidUser);
      this.cache.set(`lid:${lidUser}`, pnUser);
    }

    const updateKeys = Object.keys(updates);
    if (!updateKeys.length) return;

    try {
      await this.keys.transaction(async () => {
        await this.keys.set({
          'lid-mapping': {
            ...updates,
            ...revUpdates,
          }
        });
      }, 'lid-mapping');

      this.logger?.trace?.({ count: updateKeys.length }, 'stored LID-PN mappings');
    } catch (e) {
      this.logger?.warn?.({ e }, 'failed to store LID-PN mappings');
    }
  }

  async getLIDForPN(pnJid) {
    const res = await this.getLIDsForPNs([pnJid]);
    return res?.[0]?.lid || null;
  }

  async getLIDsForPNs(pns) {
    if (!Array.isArray(pns) || !pns.length) return null;

    const needFetch = [];
    const results = {};

    for (const pn of pns) {
      const decoded = (0, WABinary_1.jidDecode)(pn);
      if (!decoded?.user) continue;
      const pnUser = decoded.user;

      let lidUser = this.cache.get(`pn:${pnUser}`);
      if (!lidUser) {
        const stored = await this.keys.get('lid-mapping', [pnUser]);
        lidUser = stored?.[pnUser];
        if (lidUser) {
          this.cache.set(`pn:${pnUser}`, lidUser);
          this.cache.set(`lid:${lidUser}`, pnUser);
        }
      }

      if (!lidUser) {
        needFetch.push(pn);
        continue;
      }

      const device = decoded.device || 0;
      const isHosted = decoded.server === 'hosted';
      const lid = `${lidUser}${device ? `:${device}` : ''}@${isHosted ? 'hosted.lid' : 'lid'}`;
      results[pn] = { pn, lid };
    }

    if (needFetch.length && this.pnToLIDFunc) {
      try {
        const fetched = await this.pnToLIDFunc(needFetch);
        if (Array.isArray(fetched) && fetched.length) {
          await this.storeLIDPNMappings(fetched);
          // re-run mapping for the ones we fetched
          for (const pn of needFetch) {
            const decoded = (0, WABinary_1.jidDecode)(pn);
            if (!decoded?.user) continue;
            const pnUser = decoded.user;
            const lidUser = this.cache.get(`pn:${pnUser}`) || (await this.keys.get('lid-mapping', [pnUser]))?.[pnUser];
            if (!lidUser) continue;
            const device = decoded.device || 0;
            const isHosted = decoded.server === 'hosted';
            const lid = `${lidUser}${device ? `:${device}` : ''}@${isHosted ? 'hosted.lid' : 'lid'}`;
            results[pn] = { pn, lid };
          }
        } else {
          return null;
        }
      } catch (e) {
        this.logger?.warn?.({ e }, 'pnToLID lookup failed');
        return null;
      }
    } else if (needFetch.length) {
      return null;
    }

    return Object.values(results);
  }

  async getPNForLID(lidJid) {
    const decoded = (0, WABinary_1.jidDecode)(lidJid);
    if (!decoded?.user) return null;

    const lidUser = decoded.user;
    let pnUser = this.cache.get(`lid:${lidUser}`);
    if (!pnUser) {
      const stored = await this.keys.get('lid-mapping', [`${lidUser}_reverse`]);
      pnUser = stored?.[`${lidUser}_reverse`];
      if (pnUser) {
        this.cache.set(`lid:${lidUser}`, pnUser);
        this.cache.set(`pn:${pnUser}`, lidUser);
      }
    }
    if (!pnUser) return null;

    const device = decoded.device || 0;
    const pn = `${pnUser}${device ? `:${device}` : ''}@s.whatsapp.net`;
    return pn;
  }
}

exports.LIDMappingStore = LIDMappingStore;
