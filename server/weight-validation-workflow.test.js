const assert = require("node:assert/strict");
const test = require("node:test");
const { runWeightValidationWorkflow } = require("./weight-validation-workflow");

test("marks a chargeable weight below source weights as an anomaly", () => {
  const result = runWeightValidationWorkflow([{
    waybillNumber: "MO1", status: "found", shipment: { waybillNumber: "MO1", actualWeight: "10", volumeWeight: "12", chargeWeight: "11" }
  }]);
  assert.equal(result.workflowId, "weight_validation");
  assert.equal(result.items[0].validationStatus, "anomaly");
});

test("keeps valid and missing source fields distinct", () => {
  const result = runWeightValidationWorkflow([
    { waybillNumber: "MO1", status: "found", shipment: { waybillNumber: "MO1", actualWeight: "10", volumeWeight: "12", chargeWeight: "12" } },
    { waybillNumber: "MO2", status: "found", shipment: { waybillNumber: "MO2", actualWeight: "", volumeWeight: "12", chargeWeight: "12" } },
    { waybillNumber: "MISSING", status: "not_found" }
  ]);
  assert.deepEqual(result.items.map((item) => item.validationStatus), ["valid", "needs_review", "unavailable"]);
});
