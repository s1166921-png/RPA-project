const assert = require("node:assert/strict");
const test = require("node:test");
const { createSampleInvoiceProvider } = require("./sample-invoice-provider");

test("returns only requested invoice user records for a month", async () => {
  const provider = createSampleInvoiceProvider();
  const invoices = await provider.findByMonth({ month: "2026-07", invoiceUserIds: ["101"] });

  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].invoiceUserId, "101");
  assert.equal(invoices[0].invoiceNumber, "SAMPLE-202607-101");
});
