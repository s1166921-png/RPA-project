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
    await page.locator(".workflow-definition").nth(3).waitFor();
    assert.equal(await page.locator(".workflow-definition").count(), 4);
    assert.match(await page.locator("#workflowCatalog").innerText(), /物流轨迹查询/);
    console.log(JSON.stringify({ workflowCatalogUserPath: "passed", fixedWorkflows: 4 }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
