const DEFAULT_BASE_URL = "https://moyckj.nextsls.com/api/v5";

function toRouteNodes(traces) {
  return (Array.isArray(traces) ? traces : []).map((trace) => ({
    time: trace.time == null ? "" : String(trace.time),
    location: trace.location == null ? "" : String(trace.location),
    status: trace.info == null ? "" : String(trace.info)
  }));
}

function normalizeShipment(shipment, tracking) {
  const firstParcel = Array.isArray(shipment.parcels) ? shipment.parcels[0] || {} : {};
  return {
    waybill_number: shipment.shipment_id,
    fba_number: shipment.amazon_ref_id,
    customer_code: shipment.store_id,
    status: shipment.status,
    service: shipment.service || shipment.service_code,
    country: shipment.to_address?.country,
    recipient: shipment.to_address?.name,
    pieces: shipment.parcel_count,
    actual_weight: firstParcel.client_weight,
    volume_weight: "",
    charge_weight: shipment.chargeable_weight || firstParcel.chargeable_weight,
    receivable: shipment.charge_amount,
    last_route: tracking?.traces?.[0]?.info || "",
    route_nodes: toRouteNodes(tracking?.traces),
    raw_source: "new_wisdom_api_v5"
  };
}

function createNewWisdomApiProvider({ accessToken, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch }) {
  if (!accessToken) throw new Error("New Wisdom API access token is required");

  async function request(path, body) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "zh-CN"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`New Wisdom API request failed with ${response.status}`);
    const payload = await response.json();
    if (payload?.status !== 1) throw new Error(payload?.info || "New Wisdom API returned an error");
    return payload.data || {};
  }

  return {
    async findByWaybill(waybillNumber) {
      const shipmentId = String(waybillNumber || "").trim();
      if (!shipmentId) return null;

      const detail = await request("/shipment/get_info", {
        shipment: { shipment_id: shipmentId, client_reference: "" }
      });
      if (!detail.shipment) return null;

      let tracking = null;
      try {
        const trackingData = await request("/shipment/get_tracking", {
          shipment: {
            shipment_id: shipmentId,
            client_reference: "",
            tracking_number: "",
            parcel_number: "",
            waybill_number: "",
            ext_numbers: "",
            language: "zh"
          }
        });
        tracking = trackingData.shipment || null;
      } catch {
        // A detail result remains useful when the carrier route is temporarily unavailable.
      }

      return normalizeShipment(detail.shipment, tracking);
    }
  };
}

module.exports = { createNewWisdomApiProvider, normalizeShipment, toRouteNodes };
