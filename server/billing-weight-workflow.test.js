const assert = require("node:assert/strict");
const test = require("node:test");

const { runBillingWeightWorkflow } = require("./billing-weight-workflow");

const shipment = {
  waybillNumber: "MO10082215",
  fbaNumber: "FBA19HYL970R",
  service: "美国-COSCO普船-卡派",
  country: "美国",
  recipient: "Amazon-GYR2",
  pieces: "24",
  chargeWeight: "256",
  receivable: "1945.60CNY  运费 (7.60/KG)",
  customsMode: "报关退税",
  source: "新智慧运单接口",
  queriedAt: "2026-07-29T00:00:00.000Z"
};

test("builds the fee confirmation branch with freight rate", () => {
  const result = runBillingWeightWorkflow([{ waybillNumber: shipment.waybillNumber, status: "found", shipment }]);
  assert.equal(result.workflowId, "billing_weight_confirmation");
  assert.equal(result.items[0].branch, "with_fee");
  assert.match(result.items[0].message, /运单号：MO10082215\/FBA19HYL970R/);
  assert.match(result.items[0].message, /运费：7.60\/KG/);
  assert.match(result.items[0].message, /2个小时内反馈/);
});

test("builds the no-fee confirmation branch without a freight line", () => {
  const noFee = { ...shipment, waybillNumber: "MO10082064", receivable: "0.00CNY", fbaNumber: "FBA15M108FT0" };
  const result = runBillingWeightWorkflow([{ waybillNumber: noFee.waybillNumber, status: "found", shipment: noFee }]);
  assert.equal(result.items[0].branch, "no_fee");
  assert.doesNotMatch(result.items[0].message, /运费：/);
  assert.match(result.items[0].message, /请及时确认/);
});

test("does not generate confirmation content for failed lookups", () => {
  const result = runBillingWeightWorkflow([{ waybillNumber: "MISSING-1", status: "not_found" }]);
  assert.equal(result.items[0].message, "");
  assert.equal(result.items[0].branch, "unavailable");
});
