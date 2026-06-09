import { defineStore } from 'pinia';
import * as presetApi from '@/api/preset';

/**
 * Preset catalogue cache.
 *
 * The catalogue is small (≤ 30 items), static for the session, and
 * identical for every user, so we fetch it once and serve subsequent
 * reads from memory. The Generate page calls `ensureLoaded()` on mount;
 * other consumers (e.g. the future admin panel) share the same store.
 *
 * The store is intentionally non-persisted: re-fetching once per session
 * is cheap and avoids stale snapshot bugs if the catalogue is hot-fixed
 * server-side.
 */
export const usePresetStore = defineStore('preset', {
  state: () => ({
    /** Map of category → PresetItem[] (matches the server response shape). */
    byCategory: {},
    /** Total preset count, derived from byCategory after load. */
    total: 0,
    loading: false,
    loaded: false,
  }),

  getters: {
    /** Flat list across categories, useful when you need to look up by key. */
    flat: (s) => Object.values(s.byCategory).flat(),

    /** Build a key→preset lookup in O(N); computed once per call. */
    byKey: (s) => {
      const map = {};
      for (const list of Object.values(s.byCategory)) {
        for (const p of list) map[p.key] = p;
      }
      return map;
    },
  },

  actions: {
    async ensureLoaded({ force = false } = {}) {
      if (this.loaded && !force) return;
      await this.fetch();
    },

    async fetch() {
      this.loading = true;
      try {
        const data = await presetApi.list();
        this.byCategory = data || {};
        this.total = Object.values(this.byCategory).reduce(
          (sum, list) => sum + list.length,
          0,
        );
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
  },
});

/**
 * Mirror of the server-side `DEFAULT_PRICING` ladder (server/src/generate/
 * generate.service.ts). The server is the source of truth — it re-computes
 * the cost on submit and may override via `system_configs.credit_pricing_
 * table`. This client-side helper is purely for the "实时显示积分价"
 * preview; the actual debit comes from the submit response.
 *
 *   1 preset  → 2 credits
 *   2 presets → 3
 *   3 presets → 4
 *   4+ presets → 5 (cap)
 */
export const computeClientCost = (count) => {
  if (count <= 0) return 0;
  if (count === 1) return 2;
  if (count === 2) return 3;
  if (count === 3) return 4;
  return 5;
};
