const headers = ["运单号", "FBA号", "服务", "国家", "收件人", "件数", "实重", "材重", "收费重", "应收", "费用分支", "报关方式", "数据来源", "查询时间"];

function feeBranch(receivable) {
  return !receivable || receivable === "0.00" || receivable === "0.00CNY" ? "无费用" : "有费用";
}

function buildExportRows(shipments) {
  return [[...headers, "\u6765\u6e90\u5feb\u7167ID"], ...shipments.map((item) => [
    item.waybillNumber, item.fbaNumber, item.service, item.country, item.recipient, item.pieces,
    item.actualWeight, item.volumeWeight, item.chargeWeight, item.receivable, feeBranch(item.receivable),
    item.customsMode, item.source, item.queriedAt, item.sourceSnapshotId || ""
  ])];
}

function buildBatchExportRows(results) {
  return [[...headers, "\u6765\u6e90\u5feb\u7167ID", "\u67e5\u8be2\u72b6\u6001", "\u5931\u8d25\u539f\u56e0"], ...results.map((result) => {
    if (result.status === "found") {
      return [...buildExportRows([result.shipment])[1], "\u5df2\u627e\u5230", ""];
    }

    const failure = result.status === "not_found"
      ? ["\u672a\u627e\u5230", "\u672a\u627e\u5230\u8be5\u8fd0\u5355"]
      : ["\u6570\u636e\u6e90\u4e0d\u53ef\u7528", "\u65b0\u667a\u6167\u6570\u636e\u6e90\u6682\u65f6\u4e0d\u53ef\u7528"];
    return [result.waybillNumber || "", ...Array(headers.length).fill(""), ...failure];
  })];
}

function buildMonthlyBillingExportRows(result) {
  const headers = ["\u8d26\u5355\u6708\u4efd", "\u8d26\u5355\u53f7", "\u8d26\u5355\u65e5\u671f", "\u5e01\u79cd", "\u5e94\u6536", "\u5df2\u4ed8", "\u672a\u4ed8", "\u72b6\u6001", "\u6570\u636e\u6765\u6e90", "\u67e5\u8be2\u65f6\u95f4"];
  return [headers, ...(result?.items || []).map((item) => [
    result.month || "", item.invoiceNumber, item.invoiceDate, item.currency, item.totalAmount,
    item.paidAmount, item.remainingAmount, item.status, item.source, item.queriedAt
  ])];
}

module.exports = { buildExportRows, buildBatchExportRows, buildMonthlyBillingExportRows };
