const assert = require("node:assert/strict");
const test = require("node:test");

const { lookupWaybill } = require("./lookup-service");

const fixedNow = () => new Date("2026-07-28T08:00:00.000Z");

test("returns a standardized shipment from the provider", async () => {
  const provider = {
    async findByWaybill(waybillNumber) {
      assert.equal(waybillNumber, "MO10083334");
      return {
        waybill_number: "MO10083334",
        fba_number: "FBA15M2B6V3B",
        service: "Europe Air Freight",
        country: "France",
        charge_weight: "21.00",
        receivable: "826.00CNY"
      };
    }
  };

  const result = await lookupWaybill({ waybillNumber: " mo10083334 " }, provider, fixedNow);

  assert.equal(result.status, "found");
  assert.equal(result.shipment.waybillNumber, "MO10083334");
  assert.equal(result.shipment.fbaNumber, "FBA15M2B6V3B");
  assert.equal(result.shipment.chargeWeight, "21.00");
  assert.equal(result.shipment.source, "新智慧运单接口");
  assert.equal(result.shipment.queriedAt, "2026-07-28T08:00:00.000Z");
});

test("rejects an empty waybill before calling the provider", async () => {
  const result = await lookupWaybill({ waybillNumber: "   " }, {
    async findByWaybill() {
      throw new Error("must not run");
    }
  }, fixedNow);

  assert.deepEqual(result, { status: "invalid_input" });
});

test("returns not found when the provider has no matching waybill", async () => {
  const result = await lookupWaybill({ waybillNumber: "MISSING-1" }, {
    async findByWaybill() {
      return null;
    }
  }, fixedNow);

  assert.deepEqual(result, { status: "not_found" });
});

test("does not expose provider errors", async () => {
  const result = await lookupWaybill({ waybillNumber: "MO10083334" }, {
    async findByWaybill() {
      throw new Error("upstream credentials");
    }
  }, fixedNow);

  assert.deepEqual(result, { status: "source_unavailable" });
});
