const assert = require("node:assert/strict");
const test = require("node:test");
const { buildInvoiceSearchBody, normalizeInvoice } = require("./new-wisdom-invoice-provider");

test("builds an invoice request only from the configured tenant range", () => {
  const body = buildInvoiceSearchBody({
    page: "{{page}}",
    pageSize: "{{pageSize}}",
    date_range: ["{{start}}", "{{end}}"],
    user_ids: "{{invoiceUserIds}}"
  }, { start: "2026-07-01 00:00:00", end: "2026-07-31 23:59:59", invoiceUserIds: ["101", "102"], page: 2, pageSize: 100 });

  assert.deepEqual(body, {
    page: 2,
    pageSize: 100,
    date_range: ["2026-07-01 00:00:00", "2026-07-31 23:59:59"],
    user_ids: ["101", "102"]
  });
});

test("normalizes a New Wisdom invoice without exposing raw fields", () => {
  assert.deepEqual(normalizeInvoice({
    user_id: 101, number: "INV-001", invoice_date: "2026-07-02", currency: "CNY",
    charge_amount: "12.00", paid_charge: "2.00", remaining_charge: "10.00", status: "unpaid"
  }), {
    invoiceUserId: "101", invoiceNumber: "INV-001", invoiceDate: "2026-07-02", currency: "CNY",
    totalAmount: "12.00", paidAmount: "2.00", remainingAmount: "10.00", status: "unpaid", source: "New Wisdom invoice API"
  });
});
