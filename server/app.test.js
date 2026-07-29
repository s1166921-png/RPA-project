const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { createServer } = require("./app");
const { createAuthService, hashPassword } = require("./auth-service");
const { createWorkflowRunStore } = require("./workflow-run-store");

async function start(provider, options = {}) {
  const server = createServer({ provider, staticRoot: __dirname + "/..", ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function request(server, body, pathname = "/api/shipments/lookup", extraHeaders = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: pathname,
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders }
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

function authForTests() {
  return createAuthService({
    secret: "test-secret",
    users: [{ username: "client-a", passwordHash: hashPassword("pass-a"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] }]
  });
}

async function download(server, body, pathname, extraHeaders = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: pathname,
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders }
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

async function get(server, pathname, extraHeaders = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: address.port, path: pathname, method: "GET", headers: extraHeaders }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("returns tenant-scoped workflow run history without waybill details", async (t) => {
  const runStore = createWorkflowRunStore();
  const server = await start({ async findByWaybill(value) { return { waybill_number: value }; } }, { runStore });
  t.after(() => server.close());
  await request(server, { waybillNumbers: ["MO1"] }, "/api/shipments/batch-lookup");
  const response = await get(server, "/api/workflow/runs");
  assert.equal(response.status, 200);
  assert.equal(response.body.runs[0].workflowId, "waybill_lookup");
  assert.equal(Object.hasOwn(response.body.runs[0], "waybillNumbers"), false);
});

test("serves the customer-safe workflow catalog", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());
  const response = await get(server, "/api/workflows/definitions");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.workflows.map((workflow) => workflow.workflowId), [
    "waybill_lookup", "shipment_tracking", "billing_query", "billing_weight_confirmation", "weight_validation"
  ]);
});

test("requires login and masks another tenant's shipment", async (t) => {
  const auth = authForTests();
  const server = await start({
    async findByWaybill(value) {
      return { waybill_number: value, customer_code: value === "MO-A" ? "CUST-A" : "CUST-B" };
    }
  }, { auth, requireAuth: true });
  t.after(() => server.close());

  const anonymous = await request(server, { waybillNumber: "MO-A" });
  assert.equal(anonymous.status, 401);
  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  assert.equal(login.status, 200);
  const headers = { authorization: `Bearer ${login.body.token}` };

  const own = await request(server, { waybillNumber: "MO-A" }, "/api/shipments/lookup", headers);
  assert.equal(own.status, 200);
  const other = await request(server, { waybillNumber: "MO-B" }, "/api/shipments/lookup", headers);
  assert.equal(other.status, 404);
  assert.equal(other.body.status, "not_found");

  const crossTenantExport = await download(server, {
    results: [{ status: "found", shipment: { waybillNumber: "MO-B", customerCode: "CUST-B" } }]
  }, "/api/exports/batch-waybills", headers);
  assert.equal(crossTenantExport.status, 404);
});

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

test("runs the read-only shipment tracking workflow", async (t) => {
  const server = await start({
    async findByWaybill(value) {
      return { shipment_number: value, status: "运输中", last_route: "已出库", route_nodes: [{ event_time: "2026-07-29", place: "仓库", description: "已出库" }] };
    }
  });
  t.after(() => server.close());
  const response = await request(server, { waybillNumbers: ["MO10082215"] }, "/api/workflows/shipment-tracking");
  assert.equal(response.status, 200);
  assert.equal(response.body.workflowId, "shipment_tracking");
  assert.equal(response.body.items[0].currentStatus, "运输中");
  assert.equal(response.body.items[0].routeNodes[0].location, "仓库");
});

test("runs the read-only billing query workflow", async (t) => {
  const server = await start({
    async findByWaybill(value) {
      return { shipment_number: value, sell_charge_amount: "826.00CNY 运费 (7.60/KG)" };
    }
  });
  t.after(() => server.close());
  const response = await request(server, { waybillNumbers: ["MO10082215"] }, "/api/workflows/billing-query");
  assert.equal(response.status, 200);
  assert.equal(response.body.workflowId, "billing_query");
  assert.equal(response.body.items[0].amount, "826.00");
  assert.equal(response.body.items[0].freightRate, "7.60/KG");
});

test("runs the read-only weight validation workflow", async (t) => {
  const server = await start({
    async findByWaybill(value) {
      return { shipment_number: value, actual_weight: "10", volume_weight: "12", charge_weight: "11" };
    }
  });
  t.after(() => server.close());
  const response = await request(server, { waybillNumbers: ["MO10082215"] }, "/api/workflows/weight-validation");
  assert.equal(response.status, 200);
  assert.equal(response.body.workflowId, "weight_validation");
  assert.equal(response.body.items[0].validationStatus, "anomaly");
});

test("runs the controlled assistant tool without inventing data", async (t) => {
  const server = await start({ async findByWaybill(value) { return { waybill_number: value, sell_charge_amount: "0.00CNY" }; } });
  t.after(() => server.close());
  const response = await request(server, { message: "帮我查 MO10083334" }, "/api/assistant/message");
  assert.equal(response.status, 200);
  assert.equal(response.body.tool, "batchLookup");
  assert.equal(response.body.results[0].status, "found");
  assert.match(response.body.reply, /查询完成/);
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

test("builds a batch export from server-side waybill lookups", async (t) => {
  let calls = 0;
  const server = await start({
    async findByWaybill(value) {
      calls += 1;
      return { waybill_number: value, service: "源数据服务", sell_charge_amount: "100.00CNY" };
    }
  });
  t.after(() => server.close());

  const response = await download(server, { waybillNumbers: ["MO-SERVER-1"] }, "/api/exports/batch-waybills");
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.match(response.disposition, /^attachment; filename="waybill-batch-/);
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
