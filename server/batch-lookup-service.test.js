const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseWaybillNumbers,
  lookupWaybills
} = require("./batch-lookup-service");

test("parses, normalizes, deduplicates, and preserves waybill order", () => {
  assert.deepEqual(
    parseWaybillNumbers("mo1, MO2\nMO1  MO3"),
    { status: "valid", waybillNumbers: ["MO1", "MO2", "MO3"] }
  );
});

test("splits Chinese commas and rejects empty input", () => {
  assert.deepEqual(
    parseWaybillNumbers("mo1，MO2"),
    { status: "valid", waybillNumbers: ["MO1", "MO2"] }
  );
  assert.deepEqual(parseWaybillNumbers("  \n，  "), {
    status: "invalid_input",
    waybillNumbers: []
  });
});

test("rejects more than 50 distinct waybill numbers", () => {
  const input = Array.from({ length: 51 }, (_, index) => `MO${index + 1}`);

  assert.deepEqual(parseWaybillNumbers(input), {
    status: "limit_exceeded",
    waybillNumbers: []
  });
});

test("looks up sequentially and preserves mixed results after a source failure", async () => {
  const calls = [];
  const provider = {
    async findByWaybill(waybillNumber) {
      calls.push(waybillNumber);
      if (waybillNumber === "MO2") throw new Error("source unavailable");
      return { shipment_number: waybillNumber };
    }
  };

  const result = await lookupWaybills("MO1,MO2,MO3", provider, () => new Date("2026-07-29T00:00:00.000Z"));

  assert.deepEqual(calls, ["MO1", "MO2", "MO3"]);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.results.map(({ status }) => status), ["found", "source_unavailable", "found"]);
  assert.equal(result.results[0].shipment.waybillNumber, "MO1");
  assert.equal(result.results[2].shipment.waybillNumber, "MO3");
});
