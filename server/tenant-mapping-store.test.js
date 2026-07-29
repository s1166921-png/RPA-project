const assert = require("node:assert/strict");
const test = require("node:test");
const { createTenantMappingStore } = require("./tenant-mapping-store");

test("stores tenant mappings with source user ids and customer codes", () => {
  const store = createTenantMappingStore();
  const mapping = store.upsert("tenant-a", { customerCodes: ["CUST-A"], invoiceUserIds: [101] });
  assert.deepEqual(mapping, { tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] });
  assert.deepEqual(store.get("tenant-a"), mapping);
});

test("returns copies and rejects invalid tenant mappings", () => {
  const store = createTenantMappingStore([{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }]);
  const mapping = store.get("tenant-a");
  mapping.customerCodes.push("MUTATED");
  assert.deepEqual(store.get("tenant-a").customerCodes, ["CUST-A"]);
  assert.throws(() => store.upsert("", { customerCodes: [], invoiceUserIds: [] }), /tenantId/);
});
