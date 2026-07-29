const assert = require("node:assert/strict");
const test = require("node:test");
const { parseBillingMonth, runMonthlyBillingWorkflow } = require("./monthly-billing-workflow");

test("builds a customer-safe monthly bill with exact currency totals", () => {
  const result = runMonthlyBillingWorkflow({
    month: "2026-07",
    invoices: [
      { invoiceNumber: "INV-001", invoiceDate: "2026-07-03", currency: "CNY", totalAmount: "12.30", paidAmount: "2.30", remainingAmount: "10.00", status: "unpaid", source: "sample" },
      { invoiceNumber: "INV-002", invoiceDate: "2026-07-06", currency: "CNY", totalAmount: "0.70", paidAmount: "0.70", remainingAmount: "0.00", status: "paid", source: "sample" }
    ],
    queriedAt: "2026-07-29T00:00:00.000Z"
  });

  assert.equal(result.workflowId, "monthly_billing_query");
  assert.equal(result.month, "2026-07");
  assert.deepEqual(result.totals, [{ currency: "CNY", totalAmount: "13.00", paidAmount: "3.00", remainingAmount: "10.00" }]);
  assert.equal(result.items[0].invoiceUserId, undefined);
  assert.equal(result.items[0].queriedAt, "2026-07-29T00:00:00.000Z");
});

test("accepts only a calendar month input", () => {
  assert.deepEqual(parseBillingMonth("2026-07"), { month: "2026-07", start: "2026-07-01 00:00:00", end: "2026-07-31 23:59:59" });
  assert.throws(() => parseBillingMonth("2026-7"), /month/);
});
