const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");
const { createAuthService, hashPassword } = require("./server/auth-service");

async function run() {
  const auth = createAuthService({
    secret: "portal-test-secret",
    users: [{ username: "client-a", passwordHash: hashPassword("pass-a"), tenantId: "tenant-a", allowedCustomerCodes: ["CUST-A"] }]
  });
  const server = createServer({
    auth,
    requireAuth: true,
    staticRoot: __dirname,
    provider: {
      async findByWaybill(waybillNumber) {
        return { waybill_number: waybillNumber, customer_code: waybillNumber === "MO-A" ? "CUST-A" : "CUST-B" };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#loginPanel").waitFor();
    await page.locator("#loginUsername").fill("client-a");
    await page.locator("#loginPassword").fill("wrong");
    await page.locator("#loginForm button").click();
    await page.waitForFunction(() => document.querySelector("#loginStatus").innerText.includes("账号或密码不正确"));

    await page.locator("#loginPassword").fill("pass-a");
    await page.locator("#loginForm button").click();
    await page.waitForFunction(() => document.querySelector("#loginStatus").innerText.includes("登录成功"));

    await page.locator("#waybillNumbers").fill("MO-A");
    await page.locator("#lookupForm button").click();
    await page.locator('[data-waybill="MO-A"][data-status="found"]').waitFor();

    await page.locator("#waybillNumbers").fill("MO-B");
    await page.locator("#lookupForm button").click();
    await page.locator('[data-waybill="MO-B"][data-status="not_found"]').waitFor();
    console.log(JSON.stringify({ authUserPath: "passed", wrongPassword: "passed", ownTenant: "found", otherTenant: "masked" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
