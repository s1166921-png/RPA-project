const { lookupWaybill } = require("./lookup-service");

const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_CONCURRENCY = 5;

function parseWaybillNumbers(input, maxItems = DEFAULT_MAX_ITEMS) {
  const rawInput = Array.isArray(input) ? input.join(" ") : String(input ?? "");
  const waybillNumbers = rawInput
    .split(/[\s,，]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  if (waybillNumbers.length === 0) {
    return { status: "invalid_input", waybillNumbers: [] };
  }

  if (waybillNumbers.length > maxItems) {
    return { status: "limit_exceeded", waybillNumbers: [] };
  }

  return { status: "valid", waybillNumbers };
}

async function lookupWaybills(input, provider, now, options = {}) {
  const parsed = parseWaybillNumbers(input);
  if (parsed.status !== "valid") {
    return { status: parsed.status, results: [] };
  }

  const concurrency = Math.max(1, Math.min(
    parsed.waybillNumbers.length,
    Number(options.concurrency || DEFAULT_CONCURRENCY)
  ));
  const results = Array(parsed.waybillNumbers.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < parsed.waybillNumbers.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await lookupWaybill({ waybillNumber: parsed.waybillNumbers[index] }, provider, now);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  return { status: "completed", results };
}

module.exports = { parseWaybillNumbers, lookupWaybills };
