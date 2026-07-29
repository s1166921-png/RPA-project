const DEFINITIONS = [
  {
    workflowId: "waybill_lookup",
    name: "批量运单查询",
    description: "查询标准化运单字段并支持 Excel 导出。",
    requiredInputs: ["waybillNumbers"],
    readOnly: true
  },
  {
    workflowId: "shipment_tracking",
    name: "物流轨迹查询",
    description: "查询当前状态、最后轨迹和来源节点。",
    requiredInputs: ["waybillNumbers"],
    readOnly: true
  },
  {
    workflowId: "billing_query",
    name: "费用明细查询",
    description: "按运单查询应收金额、币种和费用单价。",
    requiredInputs: ["waybillNumbers"],
    readOnly: true
  },
  {
    workflowId: "billing_weight_confirmation",
    name: "计费重确认",
    description: "按费用分支生成客户确认内容，不发送消息。",
    requiredInputs: ["waybillNumbers"],
    readOnly: true
  }
];

function listWorkflowDefinitions() {
  return DEFINITIONS.map((definition) => ({ ...definition, requiredInputs: [...definition.requiredInputs] }));
}

function getWorkflowDefinition(workflowId) {
  const definition = DEFINITIONS.find((item) => item.workflowId === workflowId);
  return definition ? { ...definition, requiredInputs: [...definition.requiredInputs] } : null;
}

module.exports = { getWorkflowDefinition, listWorkflowDefinitions };
