const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");
const { createCachedProvider } = require("./server/provider-cache");

async function run() {
  let calls = 0;
  const provider = createCachedProvider({
    async findByWaybill(waybillNumber) {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { waybill_number: waybillNumber };
    }
  }, { ttlMs: 10_000 });
  const server = createServer({ provider, staticRoot: __dirname });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const address = server.address();
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.locator("#waybillNumbers").fill("MO1\nMO2\nMO3");
    const started = Date.now();
    await page.locator("#lookupForm button").click();
    await page.locator('[data-waybill="MO3"][data-status="found"]').waitFor();
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 280, `expected a fast parallel user query, took ${elapsed}ms`);

    await page.locator("#waybillNumbers").fill("MO1");
    await page.locator("#lookupForm button").click();
    await page.locator('[data-waybill="MO1"][data-status="found"]').waitFor();
    assert.equal(calls, 3, "second query should use the cached row");
    console.log(JSON.stringify({ performanceUserPath: "passed", parallelBatch: "passed", cacheHit: "passed" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
