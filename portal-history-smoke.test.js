const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");
const { createWorkflowRunStore } = require("./server/workflow-run-store");

async function run() {
  const server = createServer({
    staticRoot: __dirname,
    runStore: createWorkflowRunStore(),
    provider: { async findByWaybill(value) { return { waybill_number: value }; } }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.enableFullPortalMode());
    await page.locator("#historyButton").click();
    await page.waitForFunction(() => document.querySelector("#historyResult").innerText.includes("暂无查询记录"));
    await page.locator("#waybillNumbers").fill("MO-HISTORY-1");
    await page.locator("#lookupForm button").click();
    await page.locator('[data-waybill="MO-HISTORY-1"][data-status="found"]').waitFor();
    await page.locator("#historyButton").click();
    await page.locator(".history-item").waitFor();
    assert.match(await page.locator("#historyResult").innerText(), /waybill_lookup/);
    assert.doesNotMatch(await page.locator("#historyResult").innerText(), /MO-HISTORY-1/);
    console.log(JSON.stringify({ historyUserPath: "passed", sensitiveWaybillHidden: "passed" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
