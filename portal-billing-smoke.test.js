const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");

async function run() {
  const server = createServer({
    staticRoot: __dirname,
    provider: {
      async findByWaybill(waybillNumber) {
        return { waybill_number: waybillNumber, sell_charge_amount: "826.00CNY 运费 (7.60/KG)" };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#assistantMessage").fill("MO10083334 \u8d26\u5355\u8d39\u7528");
    await page.locator("#assistantForm button").click();
    const item = page.locator('.billing-item[data-waybill="MO10083334"]');
    await item.waitFor();
    assert.match(await item.innerText(), /826\.00/);
    assert.match(await item.innerText(), /7\.60\/KG/);
    console.log(JSON.stringify({ billingUserPath: "passed", sourceAmount: "present", freightRate: "present" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
