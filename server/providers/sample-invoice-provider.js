const invoices = [
  {
    invoiceUserId: "101",
    invoiceNumber: "SAMPLE-202607-101",
    invoiceDate: "2026-07-02",
    currency: "CNY",
    totalAmount: "826.00",
    paidAmount: "0.00",
    remainingAmount: "826.00",
    status: "unpaid",
    source: "Sample billing source"
  },
  {
    invoiceUserId: "202",
    invoiceNumber: "SAMPLE-202607-202",
    invoiceDate: "2026-07-05",
    currency: "CNY",
    totalAmount: "120.00",
    paidAmount: "120.00",
    remainingAmount: "0.00",
    status: "paid",
    source: "Sample billing source"
  }
];

function createSampleInvoiceProvider() {
  return {
    async findByMonth({ month, invoiceUserIds = [] }) {
      const requested = new Set(invoiceUserIds.map(String));
      return invoices
        .filter((invoice) => invoice.invoiceDate.startsWith(month) && requested.has(invoice.invoiceUserId))
        .map((invoice) => ({ ...invoice }));
    }
  };
}

module.exports = { createSampleInvoiceProvider };
