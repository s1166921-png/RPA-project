const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");

async function run() {
  const server = createServer({
    staticRoot: __dirname,
    provider: {
      async findByWaybill(waybillNumber) {
        return { waybill_number: waybillNumber, actual_weight: "10", volume_weight: "12", charge_weight: "11" };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.enableFullPortalMode());
    await page.locator("#assistantMessage").fill("MO10083334 \u8ba1\u91cd\u6821\u9a8c");
    await page.locator("#assistantForm button").click();
    const item = page.locator('.weight-validation-item[data-waybill="MO10083334"]');
    await item.waitFor();
    assert.match(await item.innerText(), /anomaly/);
    console.log(JSON.stringify({ weightValidationUserPath: "passed", anomaly: "reported" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
