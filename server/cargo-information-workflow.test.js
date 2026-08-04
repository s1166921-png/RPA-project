const assert = require("node:assert/strict");
const test = require("node:test");
const { runCargoInformationWorkflow } = require("./cargo-information-workflow");

test("returns a fixed read-only cargo information result", () => {
  const result = runCargoInformationWorkflow([{
    waybillNumber: "MO1",
    status: "found",
    shipment: {
      waybillNumber: "MO1", service: "Air", country: "FR", recipient: "Receiver", pieces: "2",
      actualWeight: "3.1", volumeWeight: "4.2", chargeWeight: "4.2", source: "new_wisdom_shipment"
    }
  }, { waybillNumber: "MISSING", status: "not_found" }]);

  assert.equal(result.workflowId, "cargo_information");
  assert.equal(result.readOnly, true);
  assert.equal(result.items[0].recipient, "Receiver");
  assert.equal(result.items[0].chargeWeight, "4.2");
  assert.equal(result.items[1].service, "");
});
