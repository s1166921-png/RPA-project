const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { createServer } = require("./app");

async function start(provider) {
  const server = createServer({ provider, staticRoot: __dirname + "/.." });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function request(server, body, pathname = "/api/shipments/lookup") {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: pathname,
      method: "POST",
      headers: { "content-type": "application/json" }
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

async function download(server, body, pathname) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: pathname,
      method: "POST",
      headers: { "content-type": "application/json" }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        type: res.headers["content-type"],
        disposition: res.headers["content-disposition"],
        body: Buffer.concat(chunks)
      }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("runs a batch lookup and retains found and missing statuses", async (t) => {
  const server = await start({
    async findByWaybill(value) {
      return value === "MO10083334" ? { waybill_number: value } : null;
    }
  });
  t.after(() => server.close());

  const response = await request(server, { waybillNumbers: ["MO10083334", "MISSING-1"] }, "/api/shipments/batch-lookup");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "completed");
  assert.deepEqual(response.body.results.map((result) => result.status), ["found", "not_found"]);
});

test("runs the read-only billing weight confirmation workflow", async (t) => {
  const server = await start({
    async findByWaybill(value) {
      return { shipment_number: value, service: "测试服务", sell_charge_amount: "100.00CNY 运费 (7.60/KG)" };
    }
  });
  t.after(() => server.close());

  const response = await request(server, { waybillNumbers: ["MO10082215"] }, "/api/workflows/billing-weight-confirmation");
  assert.equal(response.status, 200);
  assert.equal(response.body.workflowId, "billing_weight_confirmation");
  assert.equal(response.body.readOnly, true);
  assert.equal(response.body.items[0].branch, "with_fee");
  assert.match(response.body.items[0].message, /运费：7.60\/KG/);
});

test("keeps later batch lookup results after a source failure", async (t) => {
  const server = await start({
    async findByWaybill(value) {
      if (value === "MO-BROKEN") throw new Error("unavailable");
      return { waybill_number: value };
    }
  });
  t.after(() => server.close());

  const response = await request(server, {
    waybillNumbers: ["MO-FIRST", "MO-BROKEN", "MO-LAST"]
  }, "/api/shipments/batch-lookup");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results.map((result) => result.status), ["found", "source_unavailable", "found"]);
  assert.deepEqual(response.body.results.map((result) => result.waybillNumber || result.shipment.waybillNumber), ["MO-FIRST", "MO-BROKEN", "MO-LAST"]);
});

test("rejects invalid batch lookup input", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());

  const response = await request(server, { waybillNumbers: [] }, "/api/shipments/batch-lookup");
  assert.equal(response.status, 400);
  assert.equal(response.body.status, "invalid_input");
});

test("rejects a batch lookup that exceeds the item limit", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());
  const waybillNumbers = Array.from({ length: 51 }, (_, index) => `MO${index}`);

  const response = await request(server, { waybillNumbers }, "/api/shipments/batch-lookup");
  assert.equal(response.status, 400);
  assert.equal(response.body.status, "limit_exceeded");
});

test("downloads one xlsx file for batch query results", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());

  const response = await download(server, {
    results: [
      { status: "found", shipment: { waybillNumber: "MO10083334", source: "New Wisdom", queriedAt: "2026-07-28T08:00:00.000Z" } },
      { status: "not_found", waybillNumber: "MISSING-1" }
    ]
  }, "/api/exports/batch-waybills");

  assert.equal(response.status, 200);
  assert.match(response.type, /spreadsheetml/);
  assert.match(response.disposition, /^attachment; filename="waybill-batch-\d+\.xlsx"$/);
  assert.equal(response.body.subarray(0, 2).toString(), "PK");
});

test("rejects an empty batch export", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());

  const response = await request(server, { results: [] }, "/api/exports/batch-waybills");
  assert.equal(response.status, 400);
  assert.equal(response.body.status, "invalid_input");
});

test("rejects a batch export larger than 50 results", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());
  const results = Array.from({ length: 51 }, (_, index) => ({
    status: "not_found",
    waybillNumber: `MO${index}`
  }));

  const response = await download(server, { results }, "/api/exports/batch-waybills");
  assert.equal(response.status, 400);
});

test("rejects a malformed batch export result", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());

  const response = await request(server, { results: [{}] }, "/api/exports/batch-waybills");
  assert.equal(response.status, 400);
  assert.equal(response.body.status, "invalid_input");
});

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

test("downloads a fixed xlsx export for a found waybill", async (t) => {
  const server = await start({ async findByWaybill() { return { waybill_number: "MO10083334" }; } });
  t.after(() => server.close());
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: address.port, path: "/api/exports/waybill", method: "POST", headers: { "content-type": "application/json" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify({ waybillNumber: "MO10083334" }));
  });
  assert.equal(response.status, 200);
  assert.match(response.type, /spreadsheetml/);
  assert.equal(response.body.subarray(0, 2).toString(), "PK");
});
