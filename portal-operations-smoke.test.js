const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");
const { createAuthService, hashPassword } = require("./server/auth-service");
const { createSqliteStores } = require("./server/sqlite-stores");

async function login(page, username, password) {
  await page.locator("#loginUsername").fill(username);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#loginForm button").click();
}

async function run() {
  const stores = createSqliteStores();
  const auth = createAuthService({
    secret: "operations-portal-secret",
    users: [
      { username: "admin", passwordHash: hashPassword("admin-pass"), tenantId: "operations", role: "admin", allowedCustomerCodes: [] },
      { username: "customer", passwordHash: hashPassword("customer-pass"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] }
    ],
    userStore: stores.portalUsers
  });
  const server = createServer({
    staticRoot: __dirname,
    auth,
    requireAuth: true,
    runStore: stores.runStore,
    tenantMappings: stores.tenantMappings,
    portalUsers: stores.portalUsers,
    provider: { async findByWaybill() { return null; } }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const adminPage = await browser.newPage();
    await adminPage.goto(`http://127.0.0.1:${server.address().port}`);
    await adminPage.evaluate(() => window.enableFullPortalMode());
    await login(adminPage, "admin", "admin-pass");
    await adminPage.locator("#operationsPanel").waitFor({ state: "visible", timeout: 10_000 });
    await adminPage.locator(".workflow-definition").nth(4).waitFor({ timeout: 10_000 });
    await adminPage.locator("#mappingTenantId").fill("tenant-a");
    await adminPage.locator("#mappingCustomerCodes").fill("CUST-A");
    await adminPage.locator("#mappingInvoiceUserIds").fill("101");
    await adminPage.locator("#tenantMappingForm button").click();
    await adminPage.waitForFunction(() => document.querySelector("#operationsResult").innerText.includes("tenant-a"), null, { timeout: 10_000 });
    assert.match(await adminPage.locator("#operationsResult").innerText(), /not_configured/);
    await adminPage.locator("#portalUserUsername").fill("new-customer");
    await adminPage.locator("#portalUserPassword").fill("new-customer-pass");
    await adminPage.locator("#portalUserTenantId").fill("tenant-new");
    await adminPage.locator("#portalUserCustomerCodes").fill("CUST-NEW");
    await adminPage.locator("#portalUserForm button").click();
    await adminPage.waitForFunction(() => document.querySelector("#portalUserResult").innerText.includes("new-customer"), null, { timeout: 10_000 });

    const customerPage = await browser.newPage();
    await customerPage.goto(`http://127.0.0.1:${server.address().port}`);
    await login(customerPage, "customer", "customer-pass");
    await customerPage.waitForFunction(() => document.querySelector("#loginForm").hidden, null, { timeout: 10_000 });
    assert.equal(await customerPage.locator("#operationsPanel").evaluate((panel) => panel.hidden), true);
    const newCustomerPage = await browser.newPage();
    await newCustomerPage.goto(`http://127.0.0.1:${server.address().port}`);
    await login(newCustomerPage, "new-customer", "new-customer-pass");
    await newCustomerPage.waitForFunction(() => document.querySelector("#loginForm").hidden, null, { timeout: 10_000 });
    assert.equal(await newCustomerPage.locator("#operationsPanel").evaluate((panel) => panel.hidden), true);

    const disableCustomer = adminPage.getByRole("button", { name: "Disable new-customer" });
    assert.equal(await disableCustomer.count(), 1);
    await disableCustomer.click();
    await adminPage.waitForFunction(() => document.querySelector('[aria-label="Enable new-customer"]'), null, { timeout: 10_000 });

    const disabledCustomerPage = await browser.newPage();
    await disabledCustomerPage.goto(`http://127.0.0.1:${server.address().port}`);
    await login(disabledCustomerPage, "new-customer", "new-customer-pass");
    await disabledCustomerPage.waitForFunction(() => document.querySelector("#loginStatus").innerText.length > 0, null, { timeout: 10_000 });
    assert.equal(await disabledCustomerPage.locator("#loginForm").evaluate((form) => form.hidden), false);

    const newPassword = adminPage.locator('[aria-label="New password new-customer"]');
    const resetPassword = adminPage.getByRole("button", { name: "Reset password new-customer" });
    assert.equal(await newPassword.count(), 1);
    assert.equal(await resetPassword.count(), 1);
    await newPassword.fill("new-customer-password-2");
    await resetPassword.click();
    await adminPage.waitForFunction(() => document.querySelector('[aria-label="Enable new-customer"]'), null, { timeout: 10_000 });
    await adminPage.getByRole("button", { name: "Enable new-customer" }).click();

    const resetCustomerPage = await browser.newPage();
    await resetCustomerPage.goto(`http://127.0.0.1:${server.address().port}`);
    await login(resetCustomerPage, "new-customer", "new-customer-password-2");
    await resetCustomerPage.waitForFunction(() => document.querySelector("#loginForm").hidden, null, { timeout: 10_000 });
    console.log(JSON.stringify({ operationsAdminUserPath: "passed", mappingSaved: "passed", customerOperationsHidden: "passed", customerAccountDisabled: "passed", customerPasswordReset: "passed" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    stores.close();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
