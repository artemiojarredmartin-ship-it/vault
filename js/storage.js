/* Vault — storage layer.
 * State lives in localStorage under one key. Proof photos live in IndexedDB
 * (they're too big for localStorage). No network.
 */
(function (global) {
  'use strict';

  const KEY = 'vault.v1';
  const DB_NAME = 'vault-media', STORE = 'media';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return Core.blank();
      const data = JSON.parse(raw);
      return normalize(data);
    } catch (e) {
      console.warn('Vault: could not read saved data, starting fresh.', e);
      return Core.blank();
    }
  }

  function normalize(data) {
    const b = Core.blank();
    const out = Object.assign(b, data);
    for (const k of ['bets', 'proofs', 'vault', 'redemptions', 'ledger', 'partners']) if (!Array.isArray(out[k])) out[k] = [];
    out.wallet = Object.assign({ credits: 0 }, data.wallet || {});
    out.grace = Object.assign({ tokens: 0, earned: 0, spent: 0 }, data.grace || {});
    out.settings = Object.assign(Core.blank().settings, { clockOffset: 0 }, data.settings || {});
    return out;
  }

  function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
  function exportJSON(state) { return JSON.stringify(state, null, 2); }

  /** Export including proof photos (async: photos live in IndexedDB). */
  async function exportJSONWithMedia(state) {
    const keys = state.proofs.map(p => p.mediaKey).filter(Boolean);
    const media = {};
    for (const k of keys) { const url = await getMedia(k); if (url) media[k] = url; }
    return JSON.stringify(Object.assign({}, state, { media }), null, 2);
  }

  function importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.bets) || !Array.isArray(data.ledger)) {
      throw new Error('That file does not look like a Vault export.');
    }
    const media = data.media && typeof data.media === 'object' ? data.media : {};
    delete data.media;
    const s = normalize(data);
    const problems = Core.checkInvariants(s);
    if (problems.length) throw new Error('Import refused, the money does not balance: ' + problems[0]);
    return { state: s, media };
  }

  async function restoreMedia(media) {
    let n = 0;
    for (const [k, url] of Object.entries(media || {})) { if (typeof url === 'string' && url.startsWith('data:image/')) { await putMedia(k, url).catch(() => {}); n++; } }
    return n;
  }

  function clear() { localStorage.removeItem(KEY); }

  // ---------- IndexedDB for proof media ----------
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in global)) return reject(new Error('IndexedDB unavailable'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  function putMedia(key, dataUrl) {
    return db().then(d => new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(dataUrl, key);
      tx.oncomplete = () => res(key); tx.onerror = () => rej(tx.error);
    }));
  }
  function getMedia(key) {
    return db().then(d => new Promise((res, rej) => {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => res(req.result || null); req.onerror = () => rej(req.error);
    })).catch(() => null);
  }
  function clearMedia() {
    return db().then(d => new Promise((res) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = res; })).catch(() => {});
  }

  global.Storage = { KEY, load, save, exportJSON, exportJSONWithMedia, importJSON, restoreMedia, clear, putMedia, getMedia, clearMedia };
})(window);
