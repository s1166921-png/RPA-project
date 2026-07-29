const assert = require("node:assert/strict");
const test = require("node:test");
const { createAuditedProvider, maskWaybill } = require("./audit-log");

test("masks waybills before writing audit events", async () => {
  const events = [];
  const provider = createAuditedProvider({
    async findByWaybill() { return { waybill_number: "MO10068327" }; }
  }, { sink: (event) => events.push(event), now: () => 1000 });
  await provider.findByWaybill("MO10068327");
  assert.equal(maskWaybill("MO10068327"), "MO***27");
  assert.deepEqual(events[0], { action: "source_lookup", waybill: "MO***27", outcome: "found", durationMs: 0 });
});

test("records only an error category when the source fails", async () => {
  const events = [];
  const provider = createAuditedProvider({
    async findByWaybill() { throw new Error("contains sensitive source detail"); }
  }, { sink: (event) => events.push(event), now: () => 2000 });
  await assert.rejects(provider.findByWaybill("MO1234"));
  assert.deepEqual(events[0], { action: "source_lookup", waybill: "MO***34", outcome: "error", durationMs: 0 });
});
