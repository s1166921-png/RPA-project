const assert = require("node:assert/strict");
const test = require("node:test");

const { handleAssistantMessage, interpretAssistantMessage } = require("./assistant-service");

test("interprets multiple waybills as a read-only lookup request", () => {
  assert.deepEqual(interpretAssistantMessage("帮我查 MO10068327 和 MO10084025"), {
    intent: "waybill_lookup",
    waybillNumbers: ["MO10068327", "MO10084025"]
  });
});

test("routes billing-weight requests to the fixed workflow", () => {
  assert.equal(interpretAssistantMessage("生成 MO10082215 的计费重确认").intent, "billing_weight_confirmation");
});

test("asks for a waybill instead of querying when the parameter is missing", () => {
  assert.deepEqual(interpretAssistantMessage("帮我查一下物流"), { intent: "need_waybill", waybillNumbers: [] });
});

test("returns structured tool results and does not invent a business answer", async () => {
  const result = await handleAssistantMessage("查 MO10068327", {
    lookup: async (numbers) => ({ status: "completed", results: numbers.map((waybillNumber) => ({ waybillNumber, status: "not_found" })) }),
    billing: async () => { throw new Error("must not run"); }
  });
  assert.equal(result.intent, "waybill_lookup");
  assert.equal(result.tool, "batchLookup");
  assert.equal(result.results[0].status, "not_found");
  assert.match(result.reply, /未找到/);
});
