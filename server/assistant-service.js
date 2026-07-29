const { parseWaybillNumbers } = require("./batch-lookup-service");

function extractWaybillNumbers(message) {
  const matches = String(message || "").match(/[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*/gi) || [];
  return parseWaybillNumbers(matches).waybillNumbers;
}

function interpretAssistantMessage(message) {
  const waybillNumbers = extractWaybillNumbers(message);
  if (!waybillNumbers.length) return { intent: "need_waybill", waybillNumbers: [] };
  const text = String(message || "");
  return {
    intent: /计费重|收费重|未发/.test(text) ? "billing_weight_confirmation" : "waybill_lookup",
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
  if (interpretation.intent === "need_waybill") {
    return { ...interpretation, reply: "请提供一个或多个运单号，我再为你查询。" };
  }
  if (interpretation.intent === "billing_weight_confirmation") {
    const workflow = await tools.billing(interpretation.waybillNumbers);
    return { ...interpretation, tool: "billingWeightConfirmation", ...workflow, reply: "已调用计费重确认工作流，内容以工作流返回结果为准。" };
  }
  const lookup = await tools.lookup(interpretation.waybillNumbers);
  return { ...interpretation, tool: "batchLookup", ...lookup, reply: lookupReply(lookup.results || []) };
}

module.exports = { extractWaybillNumbers, handleAssistantMessage, interpretAssistantMessage };
