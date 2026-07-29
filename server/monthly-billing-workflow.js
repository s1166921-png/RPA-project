function parseBillingMonth(value) {
  const month = String(value || "").trim();
  const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) throw new Error("month must use YYYY-MM");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    month,
    start: `${month}-01 00:00:00`,
    end: `${month}-${String(lastDay).padStart(2, "0")} 23:59:59`
  };
}

function toCents(value) {
  const match = String(value ?? "0").trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 100 + Number((match[3] || "").padEnd(2, "0")));
}

function fromCents(cents) {
  const prefix = cents < 0 ? "-" : "";
  const amount = Math.abs(cents);
  return `${prefix}${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

function totalsFor(invoices) {
  const totals = new Map();
  invoices.forEach((invoice) => {
    const currency = String(invoice.currency || "").trim() || "UNKNOWN";
    const total = totals.get(currency) || { currency, totalAmount: 0, paidAmount: 0, remainingAmount: 0 };
    total.totalAmount += toCents(invoice.totalAmount);
    total.paidAmount += toCents(invoice.paidAmount);
    total.remainingAmount += toCents(invoice.remainingAmount);
    totals.set(currency, total);
  });
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map((total) => ({
    currency: total.currency,
    totalAmount: fromCents(total.totalAmount),
    paidAmount: fromCents(total.paidAmount),
    remainingAmount: fromCents(total.remainingAmount)
  }));
}

function clientInvoice(invoice, queriedAt) {
  return {
    invoiceNumber: String(invoice.invoiceNumber || ""),
    invoiceDate: String(invoice.invoiceDate || ""),
    currency: String(invoice.currency || ""),
    totalAmount: String(invoice.totalAmount || "0.00"),
    paidAmount: String(invoice.paidAmount || "0.00"),
    remainingAmount: String(invoice.remainingAmount || "0.00"),
    status: String(invoice.status || ""),
    source: String(invoice.source || ""),
    queriedAt
  };
}

function runMonthlyBillingWorkflow({ month, invoices, queriedAt = new Date().toISOString() }) {
  const range = parseBillingMonth(month);
  const items = (Array.isArray(invoices) ? invoices : []).map((invoice) => clientInvoice(invoice, queriedAt));
  return {
    status: "completed",
    workflowId: "monthly_billing_query",
    name: "\u6708\u5ea6\u8d26\u5355\u67e5\u8be2",
    month: range.month,
    sourceRange: { start: range.start, end: range.end },
    items,
    totals: totalsFor(items),
    queriedAt
  };
}

module.exports = { parseBillingMonth, runMonthlyBillingWorkflow, totalsFor };
