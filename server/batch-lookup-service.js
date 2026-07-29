const { lookupWaybill } = require("./lookup-service");

const DEFAULT_MAX_ITEMS = 50;

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

async function lookupWaybills(input, provider, now) {
  const parsed = parseWaybillNumbers(input);
  if (parsed.status !== "valid") {
    return { status: parsed.status, results: [] };
  }

  const results = [];
  for (const waybillNumber of parsed.waybillNumbers) {
    results.push(await lookupWaybill({ waybillNumber }, provider, now));
  }

  return { status: "completed", results };
}

module.exports = { parseWaybillNumbers, lookupWaybills };
