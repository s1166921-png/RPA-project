function plainText(value) {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function value(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return plainText(row[key]);
  }
  return "";
}

function routeNodes(row) {
  const raw = ["route_nodes", "routeNodes", "routes", "tracking_events", "trackingEvents"]
    .map((key) => row[key])
    .find(Array.isArray) || [];
  return raw.map((node) => {
    if (node == null || typeof node !== "object") return { description: plainText(node || "") };
    return {
      time: value(node, "time", "event_time", "occurred_at", "date"),
      location: value(node, "location", "place", "city"),
      status: value(node, "status", "event", "description")
    };
  });
}

function normalize(row, queriedAt) {
  return {
    waybillNumber: value(row, "waybill_number", "shipment_number", "waybillNo"),
    fbaNumber: value(row, "fba_number", "fbaNo"),
    customerCode: value(row, "customer_code", "customerCode", "user_code", "username", "user_name"),
    status: value(row, "status", "shipment_status"),
    service: value(row, "service"),
    country: value(row, "country", "to_country"),
    recipient: value(row, "recipient", "consignee", "to_name"),
    pieces: value(row, "pieces", "quantity", "parcel_count"),
    actualWeight: value(row, "actual_weight", "actualWeight"),
    volumeWeight: value(row, "volume_weight", "actual_volume_weight", "volumeWeight"),
    chargeWeight: value(row, "charge_weight", "chargeable_weight", "chargeWeight"),
    customsMode: value(row, "customs_mode", "customsMode"),
    receivable: value(row, "receivable", "sell_charge_amount"),
    lastRoute: value(row, "last_route", "last_tracking", "lastRoute"),
    routeNodes: routeNodes(row),
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
