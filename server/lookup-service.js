function value(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return String(row[key]);
  }
  return "";
}

function normalize(row, queriedAt) {
  return {
    waybillNumber: value(row, "waybill_number", "waybillNo"),
    fbaNumber: value(row, "fba_number", "fbaNo"),
    status: value(row, "status", "shipment_status"),
    service: value(row, "service"),
    country: value(row, "country"),
    recipient: value(row, "recipient", "consignee"),
    pieces: value(row, "pieces", "quantity"),
    actualWeight: value(row, "actual_weight", "actualWeight"),
    volumeWeight: value(row, "volume_weight", "volumeWeight"),
    chargeWeight: value(row, "charge_weight", "chargeWeight"),
    customsMode: value(row, "customs_mode", "customsMode"),
    receivable: value(row, "receivable"),
    lastRoute: value(row, "last_route", "lastRoute"),
    source: "新智慧运单接口",
    queriedAt: queriedAt.toISOString()
  };
}

async function lookupWaybill(input, provider, now = () => new Date()) {
  const waybillNumber = String(input?.waybillNumber || "").trim().toUpperCase();
  if (!waybillNumber) return { status: "invalid_input" };

  try {
    const row = await provider.findByWaybill(waybillNumber);
    return row ? { status: "found", shipment: normalize(row, now()) } : { status: "not_found" };
  } catch {
    return { status: "source_unavailable" };
  }
}

module.exports = { lookupWaybill };
