const invoicePath = "/tms/aos/invoice?page=1&pageSize=30&activeTab=1&pay_time=0&tax_date=0";
const invoiceEndpoint = "/rest/tms/aos/invoice/lists";

function replaceTemplate(value, parameters) {
  if (Array.isArray(value)) return value.map((item) => replaceTemplate(item, parameters));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTemplate(item, parameters)]));
  if (typeof value !== "string") return value;
  if (value === "{{invoiceUserIds}}") return [...parameters.invoiceUserIds];
  if (value === "{{page}}") return parameters.page;
  if (value === "{{pageSize}}") return parameters.pageSize;
  return value
    .replaceAll("{{start}}", parameters.start)
    .replaceAll("{{end}}", parameters.end)
    .replaceAll("{{invoiceUserIdsCsv}}", parameters.invoiceUserIds.join(","));
}

function buildInvoiceSearchBody(template, parameters) {
  if (!template || typeof template !== "object" || Array.isArray(template)) throw new Error("invoice request template is required");
  const encoded = JSON.stringify(template);
  if (!encoded.includes("{{invoiceUserIds")) throw new Error("invoice request template must scope invoice user ids");
  if (!encoded.includes("{{page}}") || !encoded.includes("{{pageSize}}")) throw new Error("invoice request template must support pagination");
  return replaceTemplate(template, parameters);
}

function normalizeInvoice(row) {
  return {
    invoiceUserId: String(row?.user_id ?? ""),
    invoiceNumber: String(row?.number ?? ""),
    invoiceDate: String(row?.invoice_date ?? ""),
    currency: String(row?.currency ?? ""),
    totalAmount: String(row?.charge_amount ?? "0.00"),
    paidAmount: String(row?.paid_charge ?? "0.00"),
    remainingAmount: String(row?.remaining_charge ?? "0.00"),
    status: String(row?.status ?? ""),
    source: "New Wisdom invoice API"
  };
}

function createNewWisdomInvoiceProvider({ username, password, requestTemplate, baseUrl = "http://moyckj.nextsls.com", browserFactory, pageSize = 100, maxPages = 100 }) {
  if (!username || !password) throw new Error("New Wisdom read-only credentials are required");
  if (!browserFactory) throw new Error("browserFactory is required");

  return {
    async findByMonth({ start, end, invoiceUserIds }) {
      const browser = await browserFactory();
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.goto(`${baseUrl}${invoicePath}`, { waitUntil: "domcontentloaded" });
        const usernameInput = page.locator('input[name="username"]');
        const needsLogin = await usernameInput.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        if (needsLogin) {
          await usernameInput.fill(username);
          await page.locator('input[name="password"]').fill(password);
          await page.locator("button").filter({ hasText: /\u767b\u5f55/ }).click();
          await page.waitForURL(/\/tms\/aos\/invoice/);
        }
        const rows = [];
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
          const requestBody = buildInvoiceSearchBody(requestTemplate, {
            start,
            end,
            invoiceUserIds: invoiceUserIds.map(String),
            page: pageNumber,
            pageSize
          });
          const payload = await page.evaluate(async ({ endpoint, body }) => {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body)
            });
            if (!response.ok) throw new Error("New Wisdom invoice request failed");
            return response.json();
          }, { endpoint: invoiceEndpoint, body: requestBody });
          const pageRows = payload?.data?.components?.gridView?.table?.dataSource || [];
          rows.push(...pageRows);
          if (pageRows.length < pageSize) return rows.map(normalizeInvoice);
        }
        throw new Error("New Wisdom invoice result exceeds configured page limit");
      } finally {
        await context.close();
        await browser.close();
      }
    }
  };
}

module.exports = { buildInvoiceSearchBody, createNewWisdomInvoiceProvider, normalizeInvoice };
