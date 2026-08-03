const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { createServer } = require("./app");
const { createAuthService, hashPassword } = require("./auth-service");
const { createWorkflowRunStore } = require("./workflow-run-store");
const { createTenantMappingStore } = require("./tenant-mapping-store");
const { createSqliteStores } = require("./sqlite-stores");
const { createRequestRateLimiter } = require("./request-rate-limiter");

async function start(provider, options = {}) {
  const server = createServer({ provider, staticRoot: __dirname + "/..", ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function request(server, body, pathname = "/api/shipments/lookup", extraHeaders = {}, method = "POST") {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: pathname,
      method,
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

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for condition");
}

async function downloadGet(server, pathname, extraHeaders = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: address.port, path: pathname, method: "GET", headers: extraHeaders }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body: Buffer.concat(chunks) }));
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

test("exposes a credential-free liveness health check", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());
  const response = await get(server, "/api/health");
  assert.deepEqual(response, { status: 200, body: { status: "ok" } });
});

test("uses the logged-in tenant's provider rather than a shared provider", async (t) => {
  const calls = [];
  const router = {
    forTenant(tenantId) {
      return {
        async findByWaybill(waybillNumber) {
          calls.push(tenantId);
          return { waybill_number: waybillNumber, customer_code: "CUST-A" };
        }
      };
    }
  };
  const auth = authForTests();
  const server = await start(router, { auth, requireAuth: true });
  t.after(() => server.close());
  const login = auth.login("client-a", "pass-a");
  const response = await request(server, { waybillNumber: "MO-TENANT" }, "/api/shipments/lookup", { authorization: `Bearer ${login.token}` });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["tenant-a"]);
});

test("serves the customer-safe workflow catalog", async (t) => {
  const server = await start({ async findByWaybill() { return null; } });
  t.after(() => server.close());
  const response = await get(server, "/api/workflows/definitions");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.workflows.map((workflow) => workflow.workflowId), [
    "waybill_lookup", "shipment_tracking", "billing_query", "monthly_billing_query", "billing_weight_confirmation", "weight_validation"
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

test("allows only an administrator to manage local tenant mappings", async (t) => {
  const stores = createSqliteStores();
  const auth = createAuthService({
    secret: "operations-secret",
    users: [
      { username: "admin", passwordHash: hashPassword("admin-pass"), tenantId: "operations", role: "admin", allowedCustomerCodes: [] },
      { username: "customer", passwordHash: hashPassword("customer-pass"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] }
    ],
    userStore: stores.portalUsers
  });
  const server = await start({ async findByWaybill() { return null; } }, {
    auth,
    requireAuth: true,
    tenantMappings: createTenantMappingStore(),
    sourceReadiness: { mode: "new_wisdom", enabled: false, reason: "invoice_template_required" },
    portalUsers: stores.portalUsers
  });
  t.after(() => { server.close(); stores.close(); });

  const adminLogin = await request(server, { username: "admin", password: "admin-pass" }, "/api/auth/login");
  const adminHeaders = { authorization: `Bearer ${adminLogin.body.token}` };
  const saved = await request(server, { customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }, "/api/operations/tenant-mappings/tenant-a", adminHeaders, "PUT");
  assert.equal(saved.status, 200);
  const mappings = await get(server, "/api/operations/tenant-mappings", adminHeaders);
  assert.deepEqual(mappings.body.mappings, [{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }]);
  const readiness = await get(server, "/api/operations/source-readiness", adminHeaders);
  assert.deepEqual(readiness.body, { status: "ok", invoiceMonthlyBilling: { mode: "new_wisdom", enabled: false, reason: "invoice_template_required" } });
  const createdUser = await request(server, {
    username: "client-new", password: "client-password", tenantId: "tenant-new", allowedCustomerCodes: ["CUST-NEW"]
  }, "/api/operations/users", adminHeaders);
  assert.equal(createdUser.status, 201);
  assert.equal(Object.hasOwn(createdUser.body.user, "passwordHash"), false);
  const portalUsers = await get(server, "/api/operations/users", adminHeaders);
  assert.deepEqual(portalUsers.body.users, [{ username: "client-new", tenantId: "tenant-new", role: "customer", allowedCustomerCodes: ["CUST-NEW"], enabled: true }]);
  const customerLogin = await request(server, { username: "client-new", password: "client-password" }, "/api/auth/login");
  assert.equal(customerLogin.status, 200);

  const disabled = await request(server, { enabled: false }, "/api/operations/users/client-new", adminHeaders, "PATCH");
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.user.enabled, false);
  const disabledLogin = await request(server, { username: "client-new", password: "client-password" }, "/api/auth/login");
  assert.equal(disabledLogin.status, 401);

  const reset = await request(server, { enabled: true, password: "replacement-password" }, "/api/operations/users/client-new", adminHeaders, "PATCH");
  assert.equal(reset.status, 200);
  const oldPasswordLogin = await request(server, { username: "client-new", password: "client-password" }, "/api/auth/login");
  assert.equal(oldPasswordLogin.status, 401);
  const resetPasswordLogin = await request(server, { username: "client-new", password: "replacement-password" }, "/api/auth/login");
  assert.equal(resetPasswordLogin.status, 200);

  const existingCustomerLogin = await request(server, { username: "customer", password: "customer-pass" }, "/api/auth/login");
  const denied = await get(server, "/api/operations/tenant-mappings", { authorization: `Bearer ${existingCustomerLogin.body.token}` });
  assert.equal(denied.status, 403);
  const customerPatch = await request(server, { enabled: false }, "/api/operations/users/client-new", { authorization: `Bearer ${existingCustomerLogin.body.token}` }, "PATCH");
  assert.equal(customerPatch.status, 403);
});

test("keeps audit logs free of business payloads and admin-only", async (t) => {
  const stores = createSqliteStores({ filename: ":memory:" });
  const auth = createAuthService({
    secret: "audit-secret",
    users: [
      { username: "admin", passwordHash: hashPassword("admin-pass"), tenantId: "operations", role: "admin", allowedCustomerCodes: [] },
      { username: "customer", passwordHash: hashPassword("customer-pass"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] }
    ]
  });
  const server = await start({ async findByWaybill(value) { return { waybill_number: value, customer_code: "CUST-A" }; } }, {
    auth, requireAuth: true, runStore: stores.runStore, auditLogs: stores.auditLogs
  });
  t.after(() => { server.close(); stores.close(); });

  const customerLogin = await request(server, { username: "customer", password: "customer-pass" }, "/api/auth/login");
  const customerHeaders = { authorization: `Bearer ${customerLogin.body.token}` };
  await request(server, { waybillNumbers: ["MO-SENSITIVE-1"] }, "/api/shipments/batch-lookup", customerHeaders);
  const customerLogs = await get(server, "/api/operations/audit-logs", customerHeaders);
  assert.equal(customerLogs.status, 403);

  const adminLogin = await request(server, { username: "admin", password: "admin-pass" }, "/api/auth/login");
  const logs = await get(server, "/api/operations/audit-logs", { authorization: `Bearer ${adminLogin.body.token}` });
  assert.equal(logs.status, 200);
  assert.ok(logs.body.logs.some((log) => log.action === "workflow:waybill_lookup" && log.actorUsername === "customer"));
  assert.equal(JSON.stringify(logs.body.logs).includes("MO-SENSITIVE-1"), false);
});

test("queries only mapped monthly invoices and omits source user identifiers", async (t) => {
  const auth = authForTests();
  const invoiceProvider = {
    async findByMonth() {
      return [
        { invoiceUserId: "101", invoiceNumber: "INV-A", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "12.00", paidAmount: "2.00", remainingAmount: "10.00", status: "unpaid", source: "test" },
        { invoiceUserId: "202", invoiceNumber: "INV-B", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "99.00", paidAmount: "0.00", remainingAmount: "99.00", status: "unpaid", source: "test" }
      ];
    }
  };
  const server = await start({ async findByWaybill() { return null; } }, {
    auth,
    requireAuth: true,
    invoiceProvider,
    tenantMappings: createTenantMappingStore([{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }])
  });
  t.after(() => server.close());

  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  const response = await request(server, { month: "2026-07" }, "/api/workflows/monthly-billing-query", { authorization: `Bearer ${login.body.token}` });

  assert.equal(response.status, 200);
  assert.equal(response.body.workflowId, "monthly_billing_query");
  assert.deepEqual(response.body.items.map((item) => item.invoiceNumber), ["INV-A"]);
  assert.equal(Object.hasOwn(response.body.items[0], "invoiceUserId"), false);
  assert.deepEqual(response.body.totals, [{ currency: "CNY", totalAmount: "12.00", paidAmount: "2.00", remainingAmount: "10.00" }]);
});

test("adds one tenant-scoped source snapshot to a monthly billing query", async (t) => {
  const stores = createSqliteStores({ filename: ":memory:", newId: () => "monthly-snapshot" });
  const auth = authForTests();
  const server = await start({ async findByWaybill() { return null; } }, {
    auth,
    requireAuth: true,
    sourceSnapshots: stores.sourceSnapshots,
    invoiceProvider: {
      async findByMonth() {
        return [{ invoiceUserId: "101", invoiceNumber: "INV-A", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "12.00", paidAmount: "2.00", remainingAmount: "10.00", status: "unpaid", source: "test invoice source" }];
      }
    },
    tenantMappings: createTenantMappingStore([{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }])
  });
  t.after(() => { server.close(); stores.close(); });

  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  const response = await request(server, { month: "2026-07" }, "/api/workflows/monthly-billing-query", { authorization: `Bearer ${login.body.token}` });
  assert.equal(response.status, 200);
  assert.equal(response.body.items[0].sourceSnapshotId, "monthly-snapshot");
  assert.deepEqual(stores.sourceSnapshots.list("tenant-a"), [{
    id: "monthly-snapshot", source: "test invoice source", queryType: "monthly_billing_query", queriedAt: stores.sourceSnapshots.list("tenant-a")[0].queriedAt
  }]);
});

test("exports only the authenticated tenant's monthly bill", async (t) => {
  const auth = authForTests();
  const server = await start({ async findByWaybill() { return null; } }, {
    auth,
    requireAuth: true,
    invoiceProvider: {
      async findByMonth() {
        return [
          { invoiceUserId: "101", invoiceNumber: "INV-A", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "12.00", paidAmount: "2.00", remainingAmount: "10.00", status: "unpaid", source: "test" },
          { invoiceUserId: "202", invoiceNumber: "INV-B", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "99.00", paidAmount: "0.00", remainingAmount: "99.00", status: "unpaid", source: "test" }
        ];
      }
    },
    tenantMappings: createTenantMappingStore([{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }])
  });
  t.after(() => server.close());

  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  const response = await download(server, { month: "2026-07" }, "/api/exports/monthly-billing", { authorization: `Bearer ${login.body.token}` });

  assert.equal(response.status, 200);
  assert.equal(response.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(response.disposition, /monthly-billing-2026-07\.xlsx/);
  assert.equal(response.body.subarray(0, 2).toString(), "PK");
});

test("creates a tenant-scoped monthly export task and later downloads its file", async (t) => {
  const stores = createSqliteStores();
  const auth = authForTests();
  const server = await start({ async findByWaybill() { return null; } }, {
    auth,
    requireAuth: true,
    exportTasks: stores.exportTasks,
    invoiceProvider: {
      async findByMonth() {
        return [{ invoiceUserId: "101", invoiceNumber: "INV-A", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "12.00", paidAmount: "2.00", remainingAmount: "10.00", status: "unpaid", source: "test" }];
      }
    },
    tenantMappings: createTenantMappingStore([{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }])
  });
  t.after(() => { server.close(); stores.close(); });

  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  const headers = { authorization: `Bearer ${login.body.token}` };
  const created = await request(server, { month: "2026-07" }, "/api/exports/tasks/monthly-billing", headers);
  assert.equal(created.status, 202);
  assert.equal(created.body.task.status, "queued");

  const completed = await waitFor(async () => {
    const listed = await get(server, "/api/exports/tasks", headers);
    return listed.body.tasks.find((task) => task.id === created.body.task.id && task.status === "completed");
  });
  const downloaded = await downloadGet(server, `/api/exports/tasks/${completed.id}/download`, headers);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(downloaded.body.subarray(0, 2).toString(), "PK");
});

test("retries a failed monthly export task without changing its tenant scope", async (t) => {
  const stores = createSqliteStores();
  const auth = authForTests();
  let sourceAvailable = false;
  const server = await start({ async findByWaybill() { return null; } }, {
    auth,
    requireAuth: true,
    exportTasks: stores.exportTasks,
    invoiceProvider: {
      async findByMonth() {
        if (!sourceAvailable) throw new Error("temporary source failure");
        return [{ invoiceUserId: "101", invoiceNumber: "INV-A", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "12.00", paidAmount: "2.00", remainingAmount: "10.00", status: "unpaid", source: "test" }];
      }
    },
    tenantMappings: createTenantMappingStore([{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }])
  });
  t.after(() => { server.close(); stores.close(); });

  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  const headers = { authorization: `Bearer ${login.body.token}` };
  const created = await request(server, { month: "2026-07" }, "/api/exports/tasks/monthly-billing", headers);
  const failed = await waitFor(async () => {
    const listed = await get(server, "/api/exports/tasks", headers);
    return listed.body.tasks.find((task) => task.id === created.body.task.id && task.status === "failed");
  });

  sourceAvailable = true;
  const retried = await request(server, {}, `/api/exports/tasks/${failed.id}/retry`, headers);
  assert.equal(retried.status, 202);
  const completed = await waitFor(async () => {
    const listed = await get(server, "/api/exports/tasks", headers);
    return listed.body.tasks.find((task) => task.id === failed.id && task.status === "completed");
  });
  assert.equal(completed.exportType, "monthly_billing");
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

test("rate limits costly requests per authenticated tenant identity", async (t) => {
  const auth = createAuthService({
    secret: "rate-limit-secret",
    users: [
      { username: "client-a", passwordHash: hashPassword("pass-a"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] },
      { username: "client-b", passwordHash: hashPassword("pass-b"), tenantId: "tenant-b", allowedCustomerCodes: ["CUST-B"] }
    ]
  });
  const limiter = createRequestRateLimiter({ maxRequests: 1, windowMs: 60_000 });
  const server = await start({ async findByWaybill(value) { return { waybill_number: value, customer_code: value === "MO-B" ? "CUST-B" : "CUST-A" }; } }, {
    auth, requireAuth: true, rateLimiter: limiter
  });
  t.after(() => server.close());

  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  const headers = { authorization: `Bearer ${login.body.token}` };
  const first = await request(server, { waybillNumbers: ["MO-A"] }, "/api/shipments/batch-lookup", headers);
  assert.equal(first.status, 200);
  const limited = await request(server, { waybillNumbers: ["MO-A"] }, "/api/shipments/batch-lookup", headers);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.status, "rate_limited");
  const otherLogin = await request(server, { username: "client-b", password: "pass-b" }, "/api/auth/login");
  const other = await request(server, { waybillNumbers: ["MO-B"] }, "/api/shipments/batch-lookup", { authorization: `Bearer ${otherLogin.body.token}` });
  assert.equal(other.status, 200);
});

test("adds tenant-scoped source snapshot IDs only to authorized found results", async (t) => {
  const stores = createSqliteStores({ filename: ":memory:", newId: () => "snapshot-a" });
  const auth = authForTests();
  const server = await start({
    async findByWaybill(value) {
      return { waybill_number: value, customer_code: value === "MO-A" ? "CUST-A" : "CUST-B" };
    }
  }, { auth, requireAuth: true, sourceSnapshots: stores.sourceSnapshots });
  t.after(() => { server.close(); stores.close(); });

  const login = await request(server, { username: "client-a", password: "pass-a" }, "/api/auth/login");
  const headers = { authorization: `Bearer ${login.body.token}` };
  const response = await request(server, { waybillNumbers: ["MO-A", "MO-B"] }, "/api/shipments/batch-lookup", headers);
  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].shipment.sourceSnapshotId, "snapshot-a");
  assert.equal(response.body.results[1].status, "not_found");
  assert.equal(Object.hasOwn(response.body.results[1], "sourceSnapshotId"), false);
  assert.deepEqual(stores.sourceSnapshots.list("tenant-a").map(({ source, queryType }) => ({ source, queryType })), [{
    source: "新智慧运单接口", queryType: "waybill_lookup"
  }]);
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
