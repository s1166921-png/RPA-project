const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("./server/app");

async function layout(page) {
  return page.evaluate(() => {
    const lookup = document.querySelector(".lookup-panel").getBoundingClientRect();
    const catalog = document.querySelector(".workflow-catalog").getBoundingClientRect();
    return {
      lookupTop: lookup.top,
      catalogTop: catalog.top,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      lookupRight: lookup.right
    };
  });
}

async function run() {
  const server = createServer({
    staticRoot: __dirname,
    provider: { async findByWaybill() { return null; } }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const desktop = await layout(page);
    assert.ok(desktop.lookupTop < desktop.catalogTop);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await layout(page);
    assert.ok(mobile.lookupTop < mobile.catalogTop);
    assert.ok(mobile.documentWidth <= mobile.viewportWidth);
    assert.ok(mobile.lookupRight <= mobile.viewportWidth);
    console.log(JSON.stringify({ portalLayoutUserPath: "passed", lookupFirstViewport: "passed", mobileOverflow: "none" }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
