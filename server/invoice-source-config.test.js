const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectInvoiceSourceConfig } = require("./invoice-source-config");

test("reports that production monthly billing is disabled without a verified request template", () => {
  assert.deepEqual(inspectInvoiceSourceConfig({ useNewWisdom: true, templateValue: "" }), {
    mode: "new_wisdom", enabled: false, reason: "invoice_template_required"
  });
});

test("accepts only a tenant-scoped paginated invoice request template", () => {
  assert.deepEqual(inspectInvoiceSourceConfig({
    useNewWisdom: true,
    templateValue: '{"date":["{{start}}","{{end}}"],"user":"{{invoiceUserIds}}","page":"{{page}}","pageSize":"{{pageSize}}"}'
  }), {
    mode: "new_wisdom", enabled: true, reason: "ready",
    requestTemplate: { date: ["{{start}}", "{{end}}"], user: "{{invoiceUserIds}}", page: "{{page}}", pageSize: "{{pageSize}}" }
  });
});
