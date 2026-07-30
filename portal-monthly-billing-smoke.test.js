const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");
const { createAuthService, hashPassword } = require("./server/auth-service");
const { createTenantMappingStore } = require("./server/tenant-mapping-store");
const { createSampleInvoiceProvider } = require("./server/providers/sample-invoice-provider");
const { createSqliteStores } = require("./server/sqlite-stores");

async function run() {
  const stores = createSqliteStores();
  const auth = createAuthService({
    secret: "monthly-billing-smoke-secret",
    users: [{ username: "customer", passwordHash: hashPassword("customer-pass"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] }]
  });
  const server = createServer({
    staticRoot: __dirname,
    auth,
    requireAuth: true,
    tenantMappings: createTenantMappingStore([{ tenantId: "tenant-a", customerCodes: ["CUST-A"], invoiceUserIds: ["101"] }]),
    exportTasks: stores.exportTasks,
    invoiceProvider: createSampleInvoiceProvider(),
    provider: { async findByWaybill() { return null; } }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.enableFullPortalMode());
    await page.locator("#loginUsername").fill("customer");
    await page.locator("#loginPassword").fill("customer-pass");
    await page.locator("#loginForm button").click();
    await page.locator("#monthlyBillingMonth").fill("2026-07");
    await page.locator("#monthlyBillingForm button").click();
    const item = page.locator('.monthly-billing-item[data-invoice="SAMPLE-202607-101"]');
    await item.waitFor({ timeout: 10_000 });
    assert.match(await item.innerText(), /826\.00/);
    assert.equal(await page.locator('.monthly-billing-item[data-invoice="SAMPLE-202607-202"]').count(), 0);
    await page.locator("#monthlyBillingResult button").click();
    const exportTask = page.locator('.export-task[data-status="completed"]');
    await exportTask.waitFor({ timeout: 10_000 });
    console.log(JSON.stringify({ monthlyBillingUserPath: "passed", tenantInvoiceOnly: "passed", asyncExportCompleted: "passed" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    stores.close();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
