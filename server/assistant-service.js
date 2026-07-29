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
  if (interpretation.intent === "need_waybill") {
    return { ...interpretation, reply: "请提供一个或多个运单号，我再为你查询。" };
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

module.exports = { extractWaybillNumbers, handleAssistantMessage, interpretAssistantMessage };
