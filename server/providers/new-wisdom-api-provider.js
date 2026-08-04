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

function normalizeListQuery(query = {}) {
  const shipment = {
    shipment_id: String(query.shipmentId || "").trim(),
    client_reference: String(query.clientReference || "").trim(),
    status: String(query.status || "").trim(),
    start_created: String(query.startCreated || "").trim(),
    end_created: String(query.endCreated || "").trim(),
    start_updated: String(query.startUpdated || "").trim(),
    end_updated: String(query.endUpdated || "").trim(),
    page: Number.isInteger(query.page) && query.page > 0 ? query.page : 1,
    page_size: Number.isInteger(query.pageSize) && query.pageSize > 0
      ? Math.min(query.pageSize, 100)
      : 30
  };
  return { time: Math.floor(Date.now() / 1000), shipment };
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

  async function getDetail(query) {
    try {
      const detail = await request("/shipment/get_info", {
        shipment: query
      });
      return detail.shipment || null;
    } catch (error) {
      if (/找不到运单/i.test(error.message)) return null;
      throw error;
    }
  }

  function trackingRequest(identifier, field) {
    return {
      shipment: {
        shipment_id: "",
        client_reference: "",
        tracking_number: "",
        parcel_number: "",
        waybill_number: "",
        ext_numbers: "",
        [field]: identifier,
        language: "zh"
      }
    };
  }

  return {
    async listShipments(query = {}) {
      const data = await request("/shipment/list", normalizeListQuery(query));
      return (Array.isArray(data.shipment) ? data.shipment : []).map((shipment) => normalizeShipment(shipment, null));
    },

    async findByWaybill(waybillNumber) {
      const identifier = String(waybillNumber || "").trim();
      if (!identifier) return null;

      // Customers may enter an internal shipment ID or their own reference number.
      let shipment = await getDetail({ shipment_id: identifier, client_reference: "" });
      if (!shipment) {
        shipment = await getDetail({ shipment_id: "", client_reference: identifier });
      }

      let tracking = null;
      try {
        const trackingData = await request(
          "/shipment/get_tracking",
          trackingRequest(shipment?.shipment_id || identifier, shipment ? "shipment_id" : "waybill_number")
        );
        tracking = trackingData.shipment || null;
      } catch {
        // A detail result remains useful when the carrier route is temporarily unavailable.
      }

      if (!shipment && tracking?.shipment_id) {
        shipment = await getDetail({ shipment_id: tracking.shipment_id, client_reference: "" });
      }
      if (!shipment) return null;

      return normalizeShipment(shipment, tracking);
    }
  };
}

module.exports = { createNewWisdomApiProvider, normalizeShipment, normalizeListQuery, toRouteNodes };
