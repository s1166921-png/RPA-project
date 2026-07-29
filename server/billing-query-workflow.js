function parseReceivable(value) {
  const raw = String(value || "").trim();
  const amountMatch = raw.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s*(?:CNY|USD|EUR|GBP)?\b)/i);
  const currencyMatch = raw.match(/(?:^|[\s\d])(CNY|USD|EUR|GBP)\b/i);
  const freightMatch = raw.match(/运费\s*\(([^)]+)\)/);
  return {
    raw,
    amount: amountMatch ? amountMatch[1] : "",
    currency: currencyMatch ? currencyMatch[1].toUpperCase() : "",
    freightRate: freightMatch ? freightMatch[1].trim() : ""
  };
}

function runBillingQueryWorkflow(results) {
  return {
    workflowId: "billing_query",
    name: "费用明细查询",
    readOnly: true,
    items: results.map((item) => {
      const shipment = item.shipment || {};
      const parsed = item.status === "found" ? parseReceivable(shipment.receivable) : parseReceivable("");
      return {
        waybillNumber: item.waybillNumber || shipment.waybillNumber || "",
        status: item.status,
        amount: parsed.amount,
        currency: parsed.currency,
        freightRate: parsed.freightRate,
        rawReceivable: parsed.raw,
        source: item.status === "found" ? shipment.source || "" : "",
        queriedAt: item.status === "found" ? shipment.queriedAt || "" : "",
        sourceSnapshotId: item.status === "found" ? shipment.sourceSnapshotId || "" : ""
      };
    })
  };
}

module.exports = { parseReceivable, runBillingQueryWorkflow };
