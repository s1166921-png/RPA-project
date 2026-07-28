const headers = ["运单号", "FBA号", "服务", "国家", "收件人", "件数", "实重", "材重", "收费重", "应收", "费用分支", "报关方式", "数据来源", "查询时间"];

function feeBranch(receivable) {
  return !receivable || receivable === "0.00" || receivable === "0.00CNY" ? "无费用" : "有费用";
}

function buildExportRows(shipments) {
  return [headers, ...shipments.map((item) => [
    item.waybillNumber, item.fbaNumber, item.service, item.country, item.recipient, item.pieces,
    item.actualWeight, item.volumeWeight, item.chargeWeight, item.receivable, feeBranch(item.receivable),
    item.customsMode, item.source, item.queriedAt
  ])];
}

module.exports = { buildExportRows };
