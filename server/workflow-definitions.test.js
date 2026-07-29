const assert = require("node:assert/strict");
const test = require("node:test");
const { listWorkflowDefinitions, getWorkflowDefinition } = require("./workflow-definitions");

test("lists customer-safe fixed workflow definitions", () => {
  const definitions = listWorkflowDefinitions();
  assert.deepEqual(definitions.map((item) => item.workflowId), [
    "waybill_lookup", "shipment_tracking", "billing_query", "monthly_billing_query", "billing_weight_confirmation", "weight_validation"
  ]);
  assert.equal(definitions.every((item) => item.readOnly), true);
  assert.equal(Object.hasOwn(definitions[0], "handler"), false);
  assert.deepEqual(definitions[0].dataSources, ["new_wisdom_shipment", "short_cache"]);
  assert.deepEqual(definitions[3].outputTypes, ["portal_result", "xlsx_export", "async_export"]);
  definitions[0].validationRules.push("mutated");
  assert.equal(listWorkflowDefinitions()[0].validationRules.includes("mutated"), false);
});

test("returns a copy of one definition", () => {
  const definition = getWorkflowDefinition("billing_query");
  assert.equal(definition.name, "费用明细查询");
  assert.deepEqual(definition.requiredInputs, ["waybillNumbers"]);
  assert.equal(getWorkflowDefinition("unknown"), null);
});
