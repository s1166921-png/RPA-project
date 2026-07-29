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

test("persists tenant-scoped export tasks and keeps files out of task listings", () => {
  const stores = createSqliteStores({ filename: ":memory:", now: () => 1234, newId: () => "export-1" });
  try {
    const task = stores.exportTasks.create({ tenantId: "tenant-a", exportType: "monthly_billing", request: { month: "2026-07" } });
    assert.deepEqual(task, {
      id: "export-1", tenantId: "tenant-a", exportType: "monthly_billing", status: "queued", createdAt: 1234, updatedAt: 1234
    });

    stores.exportTasks.complete("export-1", { filename: "monthly-billing-2026-07.xlsx", file: Buffer.from("xlsx") });
    assert.deepEqual(stores.exportTasks.list("tenant-a"), [{
      id: "export-1", tenantId: "tenant-a", exportType: "monthly_billing", status: "completed", createdAt: 1234, updatedAt: 1234, filename: "monthly-billing-2026-07.xlsx"
    }]);
    assert.equal(stores.exportTasks.download("tenant-b", "export-1"), null);
    assert.deepEqual(stores.exportTasks.download("tenant-a", "export-1"), { filename: "monthly-billing-2026-07.xlsx", file: Buffer.from("xlsx") });
  } finally {
    stores.close();
  }
});

test("requeues only a failed export task for its owning tenant", () => {
  const stores = createSqliteStores({ filename: ":memory:", now: () => 1234, newId: () => "export-retry" });
  try {
    stores.exportTasks.create({ tenantId: "tenant-a", exportType: "monthly_billing", request: { month: "2026-07" } });
    stores.exportTasks.fail("export-retry");

    assert.equal(stores.exportTasks.retry("tenant-b", "export-retry"), null);
    assert.deepEqual(stores.exportTasks.retry("tenant-a", "export-retry"), {
      task: { id: "export-retry", tenantId: "tenant-a", exportType: "monthly_billing", status: "queued", createdAt: 1234, updatedAt: 1234 },
      request: { month: "2026-07" }
    });
  } finally {
    stores.close();
  }
});

test("stores portal users with password hashes hidden from administrative listings", () => {
  const stores = createSqliteStores({ filename: ":memory:", now: () => 1234 });
  try {
    stores.portalUsers.upsert({
      username: "client-a", passwordHash: "scrypt$secret", tenantId: "tenant-a", role: "customer", allowedCustomerCodes: ["CUST-A"], enabled: true
    });
    assert.deepEqual(stores.portalUsers.get("client-a"), {
      username: "client-a", passwordHash: "scrypt$secret", tenantId: "tenant-a", role: "customer", allowedCustomerCodes: ["CUST-A"], enabled: true
    });
    assert.deepEqual(stores.portalUsers.list(), [{
      username: "client-a", tenantId: "tenant-a", role: "customer", allowedCustomerCodes: ["CUST-A"], enabled: true
    }]);
  } finally {
    stores.close();
  }
});

test("stores source snapshot metadata per tenant without business payloads", () => {
  const stores = createSqliteStores({ filename: ":memory:", now: () => 1234, newId: () => "snapshot-1" });
  try {
    assert.deepEqual(stores.sourceSnapshots.create({ tenantId: "tenant-a", source: "New Wisdom", queryType: "shipment_tracking" }), {
      id: "snapshot-1", source: "New Wisdom", queryType: "shipment_tracking", queriedAt: 1234
    });
    assert.deepEqual(stores.sourceSnapshots.list("tenant-a"), [{
      id: "snapshot-1", source: "New Wisdom", queryType: "shipment_tracking", queriedAt: 1234
    }]);
    assert.deepEqual(stores.sourceSnapshots.list("tenant-b"), []);
  } finally {
    stores.close();
  }
});

test("stores only safe audit summaries", () => {
  const stores = createSqliteStores({ filename: ":memory:", now: () => 1234 });
  try {
    stores.auditLogs.record({ tenantId: "tenant-a", actorUsername: "client-a", action: "workflow:shipment_tracking", outcome: "completed" });
    assert.deepEqual(stores.auditLogs.list(), [{
      tenantId: "tenant-a", actorUsername: "client-a", action: "workflow:shipment_tracking", outcome: "completed", createdAt: 1234
    }]);
  } finally {
    stores.close();
  }
});
