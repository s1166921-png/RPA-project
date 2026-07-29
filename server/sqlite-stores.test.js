const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createSqliteStores } = require("./sqlite-stores");

test("persists tenant mappings and workflow runs across SQLite restarts", () => {
  const filename = path.join(os.tmpdir(), `portal-store-${process.pid}-${Date.now()}.sqlite`);
  let stores = createSqliteStores({ filename, now: () => 1234 });

  try {
    stores.tenantMappings.upsert("tenant-a", { customerCodes: ["CUST-A"], invoiceUserIds: [101] });
    stores.runStore.record({ workflowId: "billing_query", tenantId: "tenant-a", status: "completed", durationMs: 12, inputCount: 2 });
    stores.close();
    stores = createSqliteStores({ filename });

    assert.deepEqual(stores.tenantMappings.get("tenant-a"), {
      tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"]
    });
    assert.deepEqual(stores.runStore.list("tenant-a"), [{
      workflowId: "billing_query", tenantId: "tenant-a", status: "completed", durationMs: 12, inputCount: 2, createdAt: 1234
    }]);
  } finally {
    stores.close();
    fs.rmSync(filename, { force: true });
  }
});
