const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const path = require("node:path");
const { createServer } = require("./server/app");
const { createSampleProvider } = require("./server/providers/sample-provider");

async function expectText(page, selector, text) {
  assert.match(await page.locator(selector).innerText(), new RegExp(text));
}

async function expectResult(page, text) {
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector).innerText.includes(expected),
    { selector: "#lookupResult", expected: text }
  );
}

async function run() {
  const server = createServer({ provider: createSampleProvider(), staticRoot: __dirname });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  let batchLookupRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/shipments/batch-lookup")) batchLookupRequests += 1;
  });
  await page.route("**/api/shipments/batch-lookup", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.continue();
  });
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate(() => window.enableFullPortalMode());
    await page.locator("#waybillNumbers").fill("MO10083334\nMISSING-1");
    await page.locator("#lookupForm button").click();
    await expectText(page, "#lookupResult", "\u6b63\u5728\u67e5\u8be2 2 \u4e2a\u5355\u53f7");
    await page.locator('[data-waybill="MO10083334"][data-status="found"]').waitFor();
    await page.locator('[data-waybill="MISSING-1"][data-status="not_found"]').waitFor();
    assert.equal(batchLookupRequests, 1);
    assert.deepEqual(await page.locator(".batch-item").evaluateAll((items) => items.map((item) => item.dataset.waybill)), ["MO10083334", "MISSING-1"]);
    await page.locator("#billingWeightWorkflow").click();
    await page.locator(".workflow-message").waitFor();
    await expectText(page, "#lookupResult", "计费重确认");
    const download = page.waitForEvent("download");
    await page.locator("#downloadBatchExport").click();
    assert.match((await download).suggestedFilename(), /waybill-batch-\d+\.xlsx/);

    await page.locator("#assistantMessage").fill("帮我查 MO10083334");
    await page.locator("#assistantForm button").click();
    await page.waitForFunction(() => document.querySelector("#assistantResult").innerText.includes("查询完成"));
    assert.equal(await page.locator('[data-waybill="MO10083334"]').count(), 1);

    await page.locator("#assistantMessage").fill("帮我查物流");
    await page.locator("#assistantForm button").click();
    await page.waitForFunction(() => document.querySelector("#assistantResult").innerText.includes("请提供一个或多个运单号"));

    await page.locator("#assistantMessage").fill("MO10083334 \u7269\u6d41\u8f68\u8ff9");
    await page.locator("#assistantForm button").click();
    await page.locator('.tracking-item[data-waybill="MO10083334"]').waitFor();

    await page.locator("#waybillNumbers").fill("");
    await page.locator("#lookupForm button").click();
    await expectText(page, "#lookupResult", "\u8bf7\u8f93\u5165\u8fd0\u5355\u53f7");

    const filePath = `file:///${path.resolve(__dirname, "index.html").replace(/\\/g, "/")}`;
    await page.goto(filePath);
    await page.locator("#waybillNumbers").fill("MO10083334");
    await page.locator("#lookupForm button").click();
    await expectResult(page, "\u8bf7\u901a\u8fc7\u672c\u5730\u670d\u52a1\u5730\u5740\u6253\u5f00\u9875\u9762");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
