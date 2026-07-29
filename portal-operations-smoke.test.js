const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");
const { createAuthService, hashPassword } = require("./server/auth-service");
const { createTenantMappingStore } = require("./server/tenant-mapping-store");

async function login(page, username, password) {
  await page.locator("#loginUsername").fill(username);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#loginForm button").click();
}

async function run() {
  const auth = createAuthService({
    secret: "operations-portal-secret",
    users: [
      { username: "admin", passwordHash: hashPassword("admin-pass"), tenantId: "operations", role: "admin", allowedCustomerCodes: [] },
      { username: "customer", passwordHash: hashPassword("customer-pass"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] }
    ]
  });
  const server = createServer({
    staticRoot: __dirname,
    auth,
    requireAuth: true,
    tenantMappings: createTenantMappingStore(),
    provider: { async findByWaybill() { return null; } }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const adminPage = await browser.newPage();
    await adminPage.goto(`http://127.0.0.1:${server.address().port}`);
    await login(adminPage, "admin", "admin-pass");
    await adminPage.locator("#operationsPanel").waitFor({ state: "visible", timeout: 10_000 });
    await adminPage.locator(".workflow-definition").nth(4).waitFor({ timeout: 10_000 });
    await adminPage.locator("#mappingTenantId").fill("tenant-a");
    await adminPage.locator("#mappingCustomerCodes").fill("CUST-A");
    await adminPage.locator("#mappingInvoiceUserIds").fill("101");
    await adminPage.locator("#tenantMappingForm button").click();
    await adminPage.waitForFunction(() => document.querySelector("#operationsResult").innerText.includes("tenant-a"), null, { timeout: 10_000 });

    const customerPage = await browser.newPage();
    await customerPage.goto(`http://127.0.0.1:${server.address().port}`);
    await login(customerPage, "customer", "customer-pass");
    await customerPage.waitForFunction(() => document.querySelector("#loginForm").hidden, null, { timeout: 10_000 });
    assert.equal(await customerPage.locator("#operationsPanel").evaluate((panel) => panel.hidden), true);
    console.log(JSON.stringify({ operationsAdminUserPath: "passed", mappingSaved: "passed", customerOperationsHidden: "passed" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
