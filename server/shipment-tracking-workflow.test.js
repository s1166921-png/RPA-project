const assert = require("node:assert/strict");
const test = require("node:test");
const { runShipmentTrackingWorkflow } = require("./shipment-tracking-workflow");

test("returns a fixed read-only tracking result", () => {
  const result = runShipmentTrackingWorkflow([
    {
      waybillNumber: "MO1",
      status: "found",
      shipment: {
        waybillNumber: "MO1",
        status: "运输中",
        lastRoute: "已离开仓库",
        routeNodes: [{ time: "2026-07-29 10:00", location: "仓库", status: "已出库" }],
        source: "新智慧运单接口",
        queriedAt: "2026-07-29T02:00:00.000Z"
      }
    },
    { waybillNumber: "MISSING", status: "not_found" }
  ]);

  assert.equal(result.workflowId, "shipment_tracking");
  assert.equal(result.readOnly, true);
  assert.equal(result.items[0].currentStatus, "运输中");
  assert.equal(result.items[0].lastRoute, "已离开仓库");
  assert.equal(result.items[0].routeNodes[0].location, "仓库");
  assert.equal(result.items[1].status, "not_found");
  assert.equal(result.items[1].routeNodes.length, 0);
});
