const assert = require("node:assert/strict");
const test = require("node:test");
const { createWorkflowRunStore } = require("./workflow-run-store");

test("stores only safe workflow summaries and filters by tenant", () => {
  let clock = 1000;
  const store = createWorkflowRunStore({ now: () => clock, maxEntries: 10 });
  store.record({ workflowId: "shipment_tracking", tenantId: "tenant-a", status: "completed", durationMs: 42, inputCount: 2 });
  store.record({ workflowId: "billing_query", tenantId: "tenant-b", status: "failed", durationMs: 10, inputCount: 1 });
  clock = 2000;
  const runs = store.list("tenant-a");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].workflowId, "shipment_tracking");
  assert.equal(runs[0].createdAt, 1000);
  assert.equal(Object.hasOwn(runs[0], "waybillNumbers"), false);
});

test("trims old entries at the configured limit", () => {
  const store = createWorkflowRunStore({ maxEntries: 1 });
  store.record({ workflowId: "one", tenantId: "a", status: "completed" });
  store.record({ workflowId: "two", tenantId: "a", status: "completed" });
  assert.deepEqual(store.list("a").map((run) => run.workflowId), ["two"]);
});
