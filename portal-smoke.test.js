const { chromium } = require("playwright");
const path = require("path");

async function expectText(page, selector, text) {
  const content = await page.locator(selector).innerText();
  if (!content.includes(text)) {
    throw new Error(`Expected ${selector} to include "${text}", got "${content}"`);
  }
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  const filePath = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/");
  await page.goto(filePath);

  await page.locator("#loginForm button").click();
  await expectText(page, "#customerName", "茂源仓储客户");
  await expectText(page, "#tenantLabel", "tenant-moyc");
  await expectText(page, "#heroTitle", "今天想查什么？");

  await page.locator("#quickBillingWeight").click();
  await expectText(page, "#workflowResult", "计费重确认");
  await expectText(page, "#workflowResult", "MO10083334/FBA15M2B6V3B");
  await expectText(page, "#workflowResult", "MO10083402/FBA19JTTZJWQ");
  await expectText(page, "#workflowResult", "来源：新智慧运单页面");

  await page.locator("#smartQuery").fill("帮我查未发计费重");
  await page.locator("#smartQueryForm button").click();
  await expectText(page, "#workflowResult", "已匹配工作流：群发计费重确认");

  await page.locator("#smartQuery").fill("我要查 HQ-90001");
  await page.locator("#smartQueryForm button").click();
  await expectText(page, "#workflowResult", "未找到该客户权限范围内的数据");

  await page.locator("#smartQuery").fill("查 MOY-10001 物流");
  await page.locator("#smartQueryForm button").click();
  await expectText(page, "#workflowResult", "派送中");
  await expectText(page, "#workflowResult", "洛杉矶口岸清关完成");

  await page.locator('[data-view="history"]').click();
  await expectText(page, "#runHistory", "workflow_runs");
  await expectText(page, "#runHistory", "source_snapshots");

  await page.locator('[data-view="security"]').click();
  await expectText(page, "#securityPanel", "客户不能直接传 customer_id");
  await expectText(page, "#securityPanel", "AI 只能调用受权限保护的工作流工具");

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
