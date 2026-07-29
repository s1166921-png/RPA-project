const { buildInvoiceSearchBody } = require("./providers/new-wisdom-invoice-provider");

function inspectInvoiceSourceConfig({ useNewWisdom, templateValue }) {
  if (!useNewWisdom) return { mode: "sample", enabled: true, reason: "sample_mode" };
  if (!templateValue) return { mode: "new_wisdom", enabled: false, reason: "invoice_template_required" };
  try {
    const requestTemplate = JSON.parse(templateValue);
    buildInvoiceSearchBody(requestTemplate, {
      start: "2026-01-01 00:00:00",
      end: "2026-01-31 23:59:59",
      invoiceUserIds: ["verification-only"],
      page: 1,
      pageSize: 100
    });
    return { mode: "new_wisdom", enabled: true, reason: "ready", requestTemplate };
  } catch {
    return { mode: "new_wisdom", enabled: false, reason: "invalid_invoice_template" };
  }
}

module.exports = { inspectInvoiceSourceConfig };
