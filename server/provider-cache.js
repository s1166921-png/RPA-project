const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 1_000;

function createCachedProvider(provider, options = {}) {
  const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
  const maxEntries = Number(options.maxEntries || DEFAULT_MAX_ENTRIES);
  const now = options.now || (() => Date.now());
  const entries = new Map();

  function remember(key, value) {
    entries.delete(key);
    entries.set(key, { value, expiresAt: now() + ttlMs });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  return {
    async findByWaybill(waybillNumber) {
      const key = String(waybillNumber || "").trim().toUpperCase();
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now()) {
        entries.delete(key);
        entries.set(key, cached);
        return cached.value;
      }
      if (cached) entries.delete(key);
      const value = await provider.findByWaybill(key);
      remember(key, value);
      return value;
    }
  };
}

module.exports = { createCachedProvider };
