const { parseWaybillNumbers } = require("./batch-lookup-service");

function extractWaybillNumbers(message) {
  const matches = String(message || "").match(/[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*/gi) || [];
  return parseWaybillNumbers(matches).waybillNumbers;
}

function extractBillingMonth(message) {
  const match = String(message || "").match(/\b(\d{4})-(0[1-9]|1[0-2])\b/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function isMonthlyBillingRequest(message) {
  return /\u6708\u8d26\u5355|\u6708\u5ea6\u8d26\u5355|\u8d26\u5355.*\u6708\u4efd|\u6309\u6708.*\u8d26\u5355/.test(String(message || ""));
}

function interpretAssistantMessage(message) {
  const monthlyBilling = isMonthlyBillingRequest(message);
  const month = extractBillingMonth(message);
  if (monthlyBilling) return month
    ? { intent: "monthly_billing_query", month, waybillNumbers: [] }
    : { intent: "need_month", waybillNumbers: [] };
  const waybillNumbers = extractWaybillNumbers(message);
  if (!waybillNumbers.length) return { intent: "need_waybill", waybillNumbers: [] };
  const text = String(message || "");
  return {
    intent: /计费重|收费重|未发/.test(text)
      ? "billing_weight_confirmation"
      : /物流|轨迹|状态/.test(text) ? "shipment_tracking"
        : /账单|费用|应收|收费明细/.test(text) ? "billing_query"
          : /重量|材重|实重|计重/.test(text) ? "weight_validation" : "waybill_lookup",
    waybillNumbers
  };
}

function lookupReply(results) {
  const found = results.filter((item) => item.status === "found").length;
  const missing = results.filter((item) => item.status === "not_found").length;
  const unavailable = results.filter((item) => item.status === "source_unavailable").length;
  return `查询完成：找到 ${found} 个，未找到 ${missing} 个，数据源不可用 ${unavailable} 个。具体字段以系统查询结果为准。`;
}

async function handleAssistantMessage(message, tools) {
  const interpretation = interpretAssistantMessage(message);
  if (interpretation.intent === "need_month") {
    return { ...interpretation, reply: "\u8bf7\u63d0\u4f9b\u8d26\u5355\u6708\u4efd\uff0c\u4f8b\u5982 2026-07\u3002" };
  }
  if (interpretation.intent === "need_waybill") {
    return { ...interpretation, reply: "请提供一个或多个运单号，我再为你查询。" };
  }
  if (interpretation.intent === "monthly_billing_query") {
    const billing = await tools.monthlyBilling(interpretation.month);
    return {
      ...interpretation,
      tool: "monthlyBillingQuery",
      ...billing,
      reply: "\u5df2\u8c03\u7528\u6708\u5ea6\u8d26\u5355\u67e5\u8be2\u5de5\u4f5c\u6d41\uff0c\u91d1\u989d\u4ee5\u7cfb\u7edf\u67e5\u8be2\u7ed3\u679c\u4e3a\u51c6\u3002"
    };
  }
  if (interpretation.intent === "billing_weight_confirmation") {
    const workflow = await tools.billing(interpretation.waybillNumbers);
    return { ...interpretation, tool: "billingWeightConfirmation", ...workflow, reply: "已调用计费重确认工作流，内容以工作流返回结果为准。" };
  }
  if (interpretation.intent === "shipment_tracking") {
    const tracking = await tools.tracking(interpretation.waybillNumbers);
    return {
      ...interpretation,
      tool: "shipmentTracking",
      ...tracking,
      reply: "已调用物流轨迹工作流，状态和节点以系统查询结果为准。"
    };
  }
  if (interpretation.intent === "billing_query") {
    const billing = await tools.billingQuery(interpretation.waybillNumbers);
    return {
      ...interpretation,
      tool: "billingQuery",
      ...billing,
      reply: "已调用费用明细工作流，金额和费用字段以系统查询结果为准。"
    };
  }
  if (interpretation.intent === "weight_validation") {
    const validation = await tools.weightValidation(interpretation.waybillNumbers);
    return {
      ...interpretation,
      tool: "weightValidation",
      ...validation,
      reply: "已调用货物计重校验工作流，重量和校验状态以系统查询结果为准。"
    };
  }
  const lookup = await tools.lookup(interpretation.waybillNumbers);
  return { ...interpretation, tool: "batchLookup", ...lookup, reply: lookupReply(lookup.results || []) };
}

module.exports = { extractBillingMonth, extractWaybillNumbers, handleAssistantMessage, interpretAssistantMessage };
