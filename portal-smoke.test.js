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
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.locator("#waybillNumber").fill("MO10083334");
    await page.locator("#lookupForm button").click();
    await expectResult(page, "MO10083334");
    await expectText(page, "#lookupResult", "新智慧运单接口");
    const download = page.waitForEvent("download");
    await page.locator("#downloadExport").click();
    assert.match((await download).suggestedFilename(), /waybill-MO10083334\.xlsx/);
    await page.locator("#waybillNumber").fill("");
    await page.locator("#lookupForm button").click();
    await expectText(page, "#lookupResult", "请输入运单号");

    const filePath = `file:///${path.resolve(__dirname, "index.html").replace(/\\/g, "/")}`;
    await page.goto(filePath);
    await page.locator("#waybillNumber").fill("MO10083334");
    await page.locator("#lookupForm button").click();
    await expectResult(page, "请通过本地服务地址打开页面");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
