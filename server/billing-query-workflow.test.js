const assert = require("node:assert/strict");
const test = require("node:test");
const { parseReceivable, runBillingQueryWorkflow } = require("./billing-query-workflow");

test("parses amount, currency, and freight rate from the source field", () => {
  assert.deepEqual(parseReceivable("826.00CNY 运费 (7.60/KG)"), {
    raw: "826.00CNY 运费 (7.60/KG)", amount: "826.00", currency: "CNY", freightRate: "7.60/KG"
  });
});

test("does not invent missing billing fields", () => {
  assert.deepEqual(parseReceivable(""), {
    raw: "", amount: "", currency: "", freightRate: ""
  });
});

test("returns fixed read-only fee rows and preserves failed lookups", () => {
  const result = runBillingQueryWorkflow([
    { waybillNumber: "MO1", status: "found", shipment: { waybillNumber: "MO1", receivable: "100.00CNY", source: "新智慧运单接口", queriedAt: "2026-07-29T00:00:00.000Z" } },
    { waybillNumber: "MISSING", status: "not_found" }
  ]);
  assert.equal(result.workflowId, "billing_query");
  assert.equal(result.items[0].amount, "100.00");
  assert.equal(result.items[0].currency, "CNY");
  assert.equal(result.items[1].status, "not_found");
  assert.equal(result.items[1].amount, "");
});
