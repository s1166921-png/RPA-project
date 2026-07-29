const assert = require("node:assert/strict");
const test = require("node:test");
const { createRequestRateLimiter } = require("./request-rate-limiter");

test("limits a key within its window and resets it afterwards", () => {
  let timestamp = 1_000;
  const limiter = createRequestRateLimiter({ maxRequests: 2, windowMs: 10_000, now: () => timestamp });
  assert.equal(limiter.consume("tenant-a:user-a").allowed, true);
  assert.equal(limiter.consume("tenant-a:user-a").allowed, true);
  const denied = limiter.consume("tenant-a:user-a");
  assert.deepEqual(denied, { allowed: false, retryAfterSeconds: 10 });
  assert.equal(limiter.consume("tenant-b:user-b").allowed, true);
  timestamp += 10_000;
  assert.equal(limiter.consume("tenant-a:user-a").allowed, true);
});
