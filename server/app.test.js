const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { createServer } = require("./app");

async function start(provider) {
  const server = createServer({ provider, staticRoot: __dirname + "/.." });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function request(server, body) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: "/api/shipments/lookup",
      method: "POST",
      headers: { "content-type": "application/json" }
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("serves a waybill lookup through the HTTP API", async (t) => {
  const server = await start({ async findByWaybill() { return { waybill_number: "MO10083334" }; } });
  t.after(() => server.close());

  const response = await request(server, { waybillNumber: "MO10083334" });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "found");
  assert.equal(response.body.shipment.waybillNumber, "MO10083334");
});

test("returns a useful status for invalid, missing, and unavailable lookups", async (t) => {
  const server = await start({
    async findByWaybill(value) {
      if (value === "BROKEN") throw new Error("unavailable");
      return null;
    }
  });
  t.after(() => server.close());

  assert.equal((await request(server, { waybillNumber: "" })).status, 400);
  assert.equal((await request(server, { waybillNumber: "NONE" })).status, 404);
  assert.equal((await request(server, { waybillNumber: "BROKEN" })).status, 502);
});
