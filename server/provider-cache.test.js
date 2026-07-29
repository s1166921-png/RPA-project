const assert = require("node:assert/strict");
const test = require("node:test");
const { createCachedProvider } = require("./provider-cache");

test("returns a cached read-only row within the TTL", async () => {
  let calls = 0;
  let clock = 1000;
  const cached = createCachedProvider({
    async findByWaybill() {
      calls += 1;
      return { waybill_number: "MO1" };
    }
  }, { ttlMs: 100, now: () => clock });

  await cached.findByWaybill("MO1");
  await cached.findByWaybill("mo1");
  assert.equal(calls, 1);
  clock += 101;
  await cached.findByWaybill("MO1");
  assert.equal(calls, 2);
});

test("does not cache source failures", async () => {
  let calls = 0;
  const cached = createCachedProvider({
    async findByWaybill() {
      calls += 1;
      throw new Error("source unavailable");
    }
  }, { ttlMs: 1000 });

  await assert.rejects(cached.findByWaybill("MO1"));
  await assert.rejects(cached.findByWaybill("MO1"));
  assert.equal(calls, 2);
});
