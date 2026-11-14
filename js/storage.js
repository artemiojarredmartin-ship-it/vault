/* Checkpoint — storage layer.
 * Everything lives in localStorage under one key. No network.
 */
(function (global) {
  'use strict';

  const KEY = 'checkpoint.v1';

  function blank() {
    return {
      version: 1,
      goals: [],
      checkins: [],
      partners: [],
      settings: { name: '' }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const data = JSON.parse(raw);
      // Fill any missing top-level fields so older saves still work.
      return Object.assign(blank(), data, { settings: Object.assign(blank().settings, data.settings || {}) });
    } catch (e) {
      console.warn('Checkpoint: could not read saved data, starting fresh.', e);
      return blank();
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function exportJSON(state) {
    return JSON.stringify(state, null, 2);
  }

  /** Validate and return an imported state, or throw with a readable message. */
  function importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!data || typeof data !== 'object') throw new Error('That file does not look like Checkpoint data.');
    if (!Array.isArray(data.goals) || !Array.isArray(data.checkins)) {
      throw new Error('Missing goals or check-ins. Is this a Checkpoint export?');
    }
    return Object.assign(blank(), data);
  }

  function clear() { localStorage.removeItem(KEY); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  global.Storage = { KEY, blank, load, save, exportJSON, importJSON, clear, uid };
})(window);
