function isNoFee(receivable) {
  const value = String(receivable || "").trim();
  return !value || value === "0.00" || value === "0.00CNY";
}

function extractFreightRate(receivable) {
  const match = String(receivable || "").match(/运费\s*\(([^)]+)\)/);
  return match ? match[1].trim() : "";
}

function field(value) {
  return value == null ? "" : String(value);
}

function buildMessage(shipment) {
  const waybill = field(shipment.waybillNumber);
  const fba = field(shipment.fbaNumber);
  const base = `运单号：${waybill}/${fba}；`;
  if (isNoFee(shipment.receivable)) {
    return `${base}\n服务：${field(shipment.service)}；\n收件人：${field(shipment.recipient)}；国家：${field(shipment.country)}；件数：${field(shipment.pieces)}；\n收费重：${field(shipment.chargeWeight)}KG；\n报关方式：${field(shipment.customsMode)}。\n请及时确认，有异议请联系物流客服哦，谢谢！`;
  }
  return `${base}\n服务：${field(shipment.service)}；\n国家：${field(shipment.country)}；收件人：${field(shipment.recipient)}；\n件数：${field(shipment.pieces)}；收费重：${field(shipment.chargeWeight)}KG；\n运费：${extractFreightRate(shipment.receivable)}；\n报关方式：${field(shipment.customsMode)}。\n如有任何问题请在2个小时内反馈，若无任何反馈，默认贵司确认以上所有数据和信息！出库后数据异常将不做更改。`;
}

function runBillingWeightWorkflow(results) {
  return {
    workflowId: "billing_weight_confirmation",
    name: "群发计费重确认",
    readOnly: true,
    items: results.map((item) => {
      const failed = item.status !== "found" || !item.shipment;
      return {
        waybillNumber: item.waybillNumber,
        status: item.status,
        branch: failed ? "unavailable" : isNoFee(item.shipment.receivable) ? "no_fee" : "with_fee",
        source: item.shipment?.source || "",
        queriedAt: item.shipment?.queriedAt || "",
        sourceSnapshotId: item.shipment?.sourceSnapshotId || "",
        message: failed ? "" : buildMessage(item.shipment)
      };
    })
  };
}

module.exports = { extractFreightRate, runBillingWeightWorkflow };
