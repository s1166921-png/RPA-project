const DEFINITIONS = [
  {
    workflowId: "waybill_lookup",
    name: "批量运单查询",
    description: "查询标准化运单字段并支持 Excel 导出。",
    requiredInputs: ["waybillNumbers"],
    dataSources: ["new_wisdom_shipment", "short_cache"],
    validationRules: ["waybill_required", "tenant_customer_scope", "max_50_items"],
    outputTypes: ["portal_result", "xlsx_export"],
    readOnly: true
  },
  {
    workflowId: "shipment_tracking",
    name: "物流轨迹查询",
    description: "查询当前状态、最后轨迹和来源节点。",
    requiredInputs: ["waybillNumbers"],
    dataSources: ["new_wisdom_shipment", "short_cache"],
    validationRules: ["waybill_required", "tenant_customer_scope"],
    outputTypes: ["portal_result"],
    readOnly: true
  },
  {
    workflowId: "billing_query",
    name: "费用明细查询",
    description: "按运单查询应收金额、币种和费用单价。",
    requiredInputs: ["waybillNumbers"],
    dataSources: ["new_wisdom_shipment", "short_cache"],
    validationRules: ["waybill_required", "tenant_customer_scope", "source_amount_only"],
    outputTypes: ["portal_result"],
    readOnly: true
  },
  {
    workflowId: "monthly_billing_query",
    name: "\u6708\u5ea6\u8d26\u5355\u67e5\u8be2",
    description: "\u6309\u6708\u4efd\u67e5\u8be2\u5df2\u914d\u7f6e\u79df\u6237\u7684\u8d26\u5355\u6c47\u603b\u548c\u660e\u7ec6\u3002",
    requiredInputs: ["month"],
    dataSources: ["new_wisdom_invoice", "tenant_invoice_mapping"],
    validationRules: ["calendar_month_required", "tenant_invoice_scope", "paginated_source_request"],
    outputTypes: ["portal_result", "xlsx_export", "async_export"],
    readOnly: true
  },
  {
    workflowId: "billing_weight_confirmation",
    name: "计费重确认",
    description: "按费用分支生成客户确认内容，不发送消息。",
    requiredInputs: ["waybillNumbers"],
    dataSources: ["new_wisdom_shipment", "short_cache"],
    validationRules: ["waybill_required", "tenant_customer_scope", "fee_branch_required"],
    outputTypes: ["portal_result", "confirmation_text"],
    readOnly: true
  },
  {
    workflowId: "weight_validation",
    name: "货物计重校验",
    description: "校验实重、材重和收费重的基础关系。",
    requiredInputs: ["waybillNumbers"],
    dataSources: ["new_wisdom_shipment", "short_cache"],
    validationRules: ["waybill_required", "tenant_customer_scope", "weight_relation_check"],
    outputTypes: ["portal_result"],
    readOnly: true
  }
];

function listWorkflowDefinitions() {
  return DEFINITIONS.map((definition) => ({
    ...definition,
    requiredInputs: [...definition.requiredInputs],
    dataSources: [...definition.dataSources],
    validationRules: [...definition.validationRules],
    outputTypes: [...definition.outputTypes]
  }));
}

function getWorkflowDefinition(workflowId) {
  const definition = DEFINITIONS.find((item) => item.workflowId === workflowId);
  return definition ? {
    ...definition,
    requiredInputs: [...definition.requiredInputs],
    dataSources: [...definition.dataSources],
    validationRules: [...definition.validationRules],
    outputTypes: [...definition.outputTypes]
  } : null;
}

module.exports = { getWorkflowDefinition, listWorkflowDefinitions };
