const assert = require("node:assert/strict");
const test = require("node:test");

const { createNewWisdomApiProvider, normalizeListQuery } = require("./new-wisdom-api-provider");

test("builds the documented shipment-list filters and caps a page at 100", () => {
  const request = normalizeListQuery({
    shipmentId: "MO10083353,MO10083354",
    startCreated: "2026-08-01 00:00:00",
    endCreated: "2026-08-01 23:59:59",
    startUpdated: "2026-08-01 00:00:00",
    endUpdated: "2026-08-01 23:59:59",
    page: 2,
    pageSize: 150
  });

  assert.equal(typeof request.time, "number");
  assert.deepEqual(request.shipment, {
    shipment_id: "MO10083353,MO10083354",
    client_reference: "",
    status: "",
    start_created: "2026-08-01 00:00:00",
    end_created: "2026-08-01 23:59:59",
    start_updated: "2026-08-01 00:00:00",
    end_updated: "2026-08-01 23:59:59",
    page: 2,
    page_size: 100
  });
});

test("lists shipments by documented created and updated time filters", async () => {
  const calls = [];
  const provider = createNewWisdomApiProvider({
    accessToken: "test-token",
    baseUrl: "https://api.example.test/api/v5",
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        async json() {
          return { status: 1, data: { shipment: [{
            shipment_id: "MO10083353", service_code: "EU", status: "picked", parcel_count: 1,
            to_address: { country: "FR", name: "Receiver" }, parcels: [{ client_weight: "3.2" }]
          }] } };
        }
      };
    }
  });

  const rows = await provider.listShipments({ startCreated: "2026-08-01 00:00:00", endCreated: "2026-08-01 23:59:59", pageSize: 100 });
  assert.equal(calls[0].url, "https://api.example.test/api/v5/shipment/list");
  assert.equal(calls[0].body.shipment.start_created, "2026-08-01 00:00:00");
  assert.equal(calls[0].body.shipment.end_created, "2026-08-01 23:59:59");
  assert.equal(calls[0].body.shipment.page_size, 100);
  assert.equal(rows[0].waybill_number, "MO10083353");
  assert.equal(rows[0].country, "FR");
});

test("uses the documented v5 detail and tracking endpoints with a Bearer token", async () => {
  const calls = [];
  const provider = createNewWisdomApiProvider({
    accessToken: "test-token",
    baseUrl: "https://api.example.test/api/v5",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const tracking = url.endsWith("/shipment/get_tracking");
      return {
        ok: true,
        async json() {
          return tracking
            ? { status: 1, data: { shipment: { traces: [{ info: "Arrived", time: 1720000000, location: "Paris" }] } } }
            : { status: 1, data: { shipment: {
              shipment_id: "MO10083353", service: "EU", parcel_count: 1, chargeable_weight: "12.3", charge_amount: "99.00",
              to_address: { name: "Receiver", country: "FR" }, parcels: [{ client_weight: "10.2" }]
            } } };
        }
      };
    }
  });

  const row = await provider.findByWaybill("MO10083353");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.example.test/api/v5/shipment/get_info");
  assert.equal(calls[0].options.headers.authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), { shipment: { shipment_id: "MO10083353", client_reference: "" } });
  assert.equal(calls[1].url, "https://api.example.test/api/v5/shipment/get_tracking");
  assert.equal(row.waybill_number, "MO10083353");
  assert.equal(row.charge_weight, "12.3");
  assert.equal(row.route_nodes[0].status, "Arrived");
});

test("returns no result when the documented detail response is empty", async () => {
  const provider = createNewWisdomApiProvider({
    accessToken: "test-token",
    fetchImpl: async () => ({ ok: true, async json() { return { status: 1, data: {} }; } })
  });

  assert.equal(await provider.findByWaybill("MO-MISSING"), null);
});

test("falls back from an internal shipment ID to a customer reference", async () => {
  const calls = [];
  const provider = createNewWisdomApiProvider({
    accessToken: "test-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      const isReferenceLookup = options.body.includes('"client_reference":"CLIENT-42"');
      const isTracking = url.endsWith("/shipment/get_tracking");
      return {
        ok: true,
        async json() {
          if (isTracking) return { status: 1, data: { shipment: { traces: [] } } };
          return isReferenceLookup
            ? { status: 1, data: { shipment: { shipment_id: "MO10083353", parcels: [] } } }
            : { status: 1, data: {} };
        }
      };
    }
  });

  const row = await provider.findByWaybill("CLIENT-42");
  assert.equal(row.waybill_number, "MO10083353");
  assert.deepEqual(calls[0].body, { shipment: { shipment_id: "CLIENT-42", client_reference: "" } });
  assert.deepEqual(calls[1].body, { shipment: { shipment_id: "", client_reference: "CLIENT-42" } });
  assert.equal(calls[2].body.shipment.shipment_id, "MO10083353");
});

test("resolves a logistics waybill through tracking before reading details", async () => {
  const calls = [];
  const provider = createNewWisdomApiProvider({
    accessToken: "test-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      const isTracking = url.endsWith("/shipment/get_tracking");
      const isResolvedDetail = options.body.includes('"shipment_id":"SHP-8"');
      return {
        ok: true,
        async json() {
          if (isTracking) return { status: 1, data: { shipment: { shipment_id: "SHP-8", traces: [] } } };
          return isResolvedDetail
            ? { status: 1, data: { shipment: { shipment_id: "SHP-8", parcels: [] } } }
            : { status: 1, data: {} };
        }
      };
    }
  });

  const row = await provider.findByWaybill("LOGISTICS-9");
  assert.equal(row.waybill_number, "SHP-8");
  assert.equal(calls[2].body.shipment.waybill_number, "LOGISTICS-9");
  assert.equal(calls[3].body.shipment.shipment_id, "SHP-8");
});

test("requires a dedicated API token", () => {
  assert.throws(() => createNewWisdomApiProvider({}), /access token/);
});
