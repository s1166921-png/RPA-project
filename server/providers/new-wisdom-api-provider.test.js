const assert = require("node:assert/strict");
const test = require("node:test");

const { createNewWisdomApiProvider } = require("./new-wisdom-api-provider");

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

test("requires a dedicated API token", () => {
  assert.throws(() => createNewWisdomApiProvider({}), /access token/);
});
