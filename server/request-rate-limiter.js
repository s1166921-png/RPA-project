function createRequestRateLimiter(options = {}) {
  const maxRequests = Math.max(1, Number(options.maxRequests || 60));
  const windowMs = Math.max(1_000, Number(options.windowMs || 60_000));
  const now = options.now || (() => Date.now());
  const entries = new Map();

  function consume(key) {
    const timestamp = now();
    const normalizedKey = String(key || "anonymous");
    const existing = entries.get(normalizedKey);
    const entry = !existing || timestamp >= existing.resetAt
      ? { count: 0, resetAt: timestamp + windowMs }
      : existing;
    entry.count += 1;
    entries.set(normalizedKey, entry);
    return {
      allowed: entry.count <= maxRequests,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1_000))
    };
  }

  return { consume };
}

module.exports = { createRequestRateLimiter };
