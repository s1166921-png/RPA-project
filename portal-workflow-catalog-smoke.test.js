const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");

async function run() {
  const server = createServer({
    staticRoot: __dirname,
    provider: { async findByWaybill() { return null; } }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.enableFullPortalMode());
    await page.locator(".workflow-definition").nth(4).waitFor();
    assert.equal(await page.locator(".workflow-definition").count(), 6);
    assert.match(await page.locator("#workflowCatalog").innerText(), /物流轨迹查询/);
    assert.match(await page.locator("#workflowCatalog").innerText(), /所需输入：waybillNumbers；输出：portal_result, xlsx_export/);
    console.log(JSON.stringify({ workflowCatalogUserPath: "passed", fixedWorkflows: 6 }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
