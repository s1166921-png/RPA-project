const state = {
  user: null,
  workflowRuns: [],
  snapshots: []
};

const users = [
  {
    username: "yangzhicheng",
    password: "123789",
    tenantId: "tenant-moyc",
    customerName: "茂源仓储客户",
    allowedUsers: ["YC3446", "YC8018", "YC3680"]
  },
  {
    username: "demo-huaqiao",
    password: "demo123",
    tenantId: "tenant-huaqiao",
    customerName: "华桥物流客户",
    allowedUsers: ["YC9001"]
  }
];

const waybills = [
  {
    tenantId: "tenant-moyc",
    waybillNo: "MO10083334",
    fbaNo: "FBA15M2B6V3B",
    userCode: "YC8018",
    service: "欧洲空运包税-普货",
    recipient: "Amazon.com.XCD2",
    country: "法国",
    postcode: "59220",
    pieces: 1,
    actualWeight: "15.37",
    volumeWeight: "15.35",
    chargeWeight: "21.00",
    customsMode: "买单报关",
    receivable: "826.00CNY\n745.50CNY 运费 (35.50/KG)\n21.00CNY 纺织品附加费 (1.00/KG)\n100.00CNY 一票一件附加费 (100.00/票)\n-10.50CNY 优惠费用减免 (-0.50/KG)\n-30.00CNY 优惠减免 (-30.00/票)",
    labels: ["云仓出货", "已发交货单", "未发计费重"],
    source: "新智慧运单页面",
    snapshotId: "SNAP-NW-20260724-001"
  },
  {
    tenantId: "tenant-moyc",
    waybillNo: "MO10083402",
    fbaNo: "FBA19JTTZJWQ",
    userCode: "YC3446",
    service: "美森CLX正班-快递派",
    recipient: "Amazon-HGR6",
    country: "美国",
    postcode: "21740-7301",
    pieces: 2,
    actualWeight: "37.70",
    volumeWeight: "29.21",
    chargeWeight: "38.00",
    customsMode: "普通报关",
    receivable: "0.00",
    labels: ["已发交货单", "已提货", "广州交货", "未发计费重"],
    source: "新智慧运单页面",
    snapshotId: "SNAP-NW-20260724-002"
  },
  {
    tenantId: "tenant-huaqiao",
    waybillNo: "HQ-90001",
    fbaNo: "FBA-HQ-001",
    userCode: "YC9001",
    service: "美东普船海卡-包税",
    recipient: "Amazon-TEB9",
    country: "美国",
    postcode: "07001",
    pieces: 3,
    actualWeight: "50.00",
    volumeWeight: "48.00",
    chargeWeight: "50.00",
    customsMode: "普通报关",
    receivable: "0.00",
    labels: ["未发计费重"],
    source: "新智慧运单页面",
    snapshotId: "SNAP-HQ-20260724-001"
  }
];

const shipments = [
  {
    tenantId: "tenant-moyc",
    trackingNo: "MOY-10001",
    status: "派送中",
    source: "缓存快照",
    snapshotId: "SNAP-TRACK-001",
    nodes: ["深圳仓库已出库", "香港转运中心已扫描", "洛杉矶口岸清关完成", "末端派送中"]
  }
];

const workflowDefinitions = [
  {
    workflow_id: "billing_weight_notify",
    name: "群发计费重确认",
    required_inputs: ["tenant_id"],
    data_sources: ["新智慧运单页面", "导出模板", "缓存快照"],
    field_mapping: ["运单号", "FBA号", "服务", "收件人", "国家", "件数", "收费重", "报关方式", "应收"],
    validation_rules: ["tenant_id 必须匹配", "labels 必须包含未发计费重", "应收 0.00 走无费用模板", "应收有明细走有费用模板"]
  },
  {
    workflow_id: "track_shipment",
    name: "物流轨迹查询",
    required_inputs: ["tracking_no"],
    data_sources: ["缓存快照"],
    field_mapping: ["当前状态", "轨迹节点", "数据来源"],
    validation_rules: ["tenant_id 必须匹配", "无结果时不能编造轨迹"]
  }
];

function requireUser() {
  if (!state.user) throw new Error("请先登录");
  return state.user;
}

function login(username, password) {
  const user = users.find((item) => item.username === username && item.password === password);
  if (!user) throw new Error("账号或密码错误");
  state.user = { ...user };
  state.workflowRuns = [];
  state.snapshots = [];
  return state.user;
}

function extractFreightRate(receivable) {
  const match = receivable.match(/运费 \(([^)]+)\)/);
  return match ? match[1] : "";
}

function buildBillingWeightMessage(item) {
  const base = `运单号：${item.waybillNo}/${item.fbaNo}/；\n服务：${item.service}；`;
  if (item.receivable === "0.00") {
    return {
      branch: "billing_weight_notify_no_fee",
      title: "数据无费用",
      message: `${base}\n收件人：${item.recipient}；国家：${item.country}${item.postcode}；件数：${item.pieces}；\n收费重：${item.chargeWeight}KG；\n报关方式：${item.customsMode}。\n请及时确认，有异议请联系物流客服哦，谢谢！`
    };
  }
  return {
    branch: "billing_weight_notify_with_fee",
    title: "数据有费用",
    message: `${base}\n国家：${item.country}；收件人：${item.recipient}；\n件数：${item.pieces}；收费重：${item.chargeWeight}KG；\n运费：${extractFreightRate(item.receivable)}；\n报关方式：${item.customsMode}。\n如有任何问题请在2个小时内反馈，若无任何反馈，默认贵司确认以上所有数据和信息！出库后数据异常将不做更改。`
  };
}

function recordRun(workflowId, status, summary, snapshotIds) {
  const run = {
    id: `RUN-${Date.now()}-${state.workflowRuns.length + 1}`,
    table: "workflow_runs",
    workflowId,
    status,
    summary,
    snapshotIds,
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false })
  };
  state.workflowRuns.unshift(run);
  return run;
}

function runBillingWeightWorkflow() {
  const user = requireUser();
  const rows = waybills.filter((item) => item.tenantId === user.tenantId && item.labels.includes("未发计费重"));
  const cards = rows.map((item) => ({ ...buildBillingWeightMessage(item), source: item.source, snapshotId: item.snapshotId }));
  state.snapshots.unshift(...rows.map((item) => ({ table: "source_snapshots", id: item.snapshotId, source: item.source, waybillNo: item.waybillNo })));
  recordRun("billing_weight_notify", "success", `生成 ${cards.length} 条计费重确认内容`, rows.map((item) => item.snapshotId));
  return {
    workflowName: "群发计费重确认",
    source: "新智慧运单页面",
    cards,
    definitions: workflowDefinitions[0]
  };
}

function runTrackingWorkflow(keyword) {
  const user = requireUser();
  const normalized = keyword.trim().toUpperCase();
  const item = shipments.find((shipment) => shipment.tenantId === user.tenantId && shipment.trackingNo === normalized);
  if (!item) {
    recordRun("track_shipment", "denied_or_empty", "未找到该客户权限范围内的数据", []);
    return { error: "未找到该客户权限范围内的数据" };
  }
  state.snapshots.unshift({ table: "source_snapshots", id: item.snapshotId, source: item.source, trackingNo: item.trackingNo });
  recordRun("track_shipment", "success", `${item.trackingNo} ${item.status}`, [item.snapshotId]);
  return { workflowName: "物流轨迹查询", shipment: item };
}

function matchAndRunWorkflow(query) {
  const text = query.trim();
  const tracking = text.match(/[A-Z]{2,}-?\d{4,}/i);
  if (text.includes("计费重") || text.includes("未发")) {
    return { matched: "已匹配工作流：群发计费重确认", result: runBillingWeightWorkflow() };
  }
  if (tracking) {
    return { matched: "已匹配工作流：物流轨迹查询", result: runTrackingWorkflow(tracking[0].toUpperCase()) };
  }
  recordRun("unknown", "need_more_input", "缺少可匹配工作流的关键词", []);
  return { matched: "需要补充信息", result: { error: "请提供单号，或说明要查计费重、物流、账单。" } };
}

function renderApp() {
  document.querySelector("#loginView").classList.add("hidden");
  document.querySelector("#portalView").classList.remove("hidden");
  document.querySelector("#customerName").textContent = state.user.customerName;
  document.querySelector("#tenantLabel").textContent = state.user.tenantId;
  renderHistory();
}

function renderWorkflowResult(payload) {
  const box = document.querySelector("#workflowResult");
  if (payload.result?.error) {
    box.innerHTML = `<p class="error">${payload.matched || ""} ${payload.result.error}</p>`;
    renderHistory();
    return;
  }
  if (payload.result?.cards) {
    const cards = payload.result.cards
      .map(
        (card) => `
          <article class="message-card">
            <span class="source">来源：${card.source} / 快照：${card.snapshotId}</span>
            <h3>${card.title}</h3>
            <pre>${card.message}</pre>
          </article>
        `
      )
      .join("");
    box.innerHTML = `
      <div class="workflow-summary">
        <div class="stat"><span>${payload.matched || "计费重确认"}</span><strong>${payload.result.workflowName}</strong></div>
        <div class="stat"><span>数据来源</span><strong>来源：${payload.result.source}</strong></div>
        <div class="stat"><span>分支</span><strong>有费用 / 无费用</strong></div>
      </div>
      <div class="result-grid">${cards}</div>
    `;
    renderHistory();
    return;
  }
  const shipment = payload.result.shipment;
  box.innerHTML = `
    <div class="workflow-summary">
      <div class="stat"><span>${payload.matched}</span><strong>${shipment.trackingNo}</strong></div>
      <div class="stat"><span>当前状态</span><strong>${shipment.status}</strong></div>
      <div class="stat"><span>来源</span><strong>${shipment.source}</strong></div>
    </div>
    <div class="message-card"><h3>轨迹节点</h3><pre>${shipment.nodes.join("\n")}</pre></div>
  `;
  renderHistory();
}

function renderHistory() {
  const box = document.querySelector("#runHistory");
  if (!box) return;
  if (!state.workflowRuns.length) {
    box.innerHTML = "<p class=\"empty\">暂无运行记录。运行任意工作流后，这里会展示 workflow_runs、source_snapshots 和 audit_logs 的效果。</p>";
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>表</th><th>工作流</th><th>状态</th><th>摘要</th><th>来源快照</th></tr></thead>
      <tbody>
        ${state.workflowRuns
          .map((run) => `<tr><td>${run.table}</td><td>${run.workflowId}</td><td>${run.status}</td><td>${run.summary}</td><td>source_snapshots: ${run.snapshotIds.join(", ")}</td></tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    login(document.querySelector("#username").value, document.querySelector("#password").value);
    renderApp();
  } catch (error) {
    document.querySelector("#loginHint").innerHTML = `<span class="error">${error.message}</span>`;
  }
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.view}`).classList.add("active");
    renderHistory();
  });
});

document.querySelector("#quickBillingWeight").addEventListener("click", () => {
  renderWorkflowResult({ matched: "已匹配工作流：群发计费重确认", result: runBillingWeightWorkflow() });
});

document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#smartQuery").value = button.dataset.query;
    renderWorkflowResult(matchAndRunWorkflow(button.dataset.query));
  });
});

document.querySelector("#smartQueryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  renderWorkflowResult(matchAndRunWorkflow(document.querySelector("#smartQuery").value));
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  state.user = null;
  document.querySelector("#portalView").classList.add("hidden");
  document.querySelector("#loginView").classList.remove("hidden");
});

window.__workflowPortal = {
  login,
  matchAndRunWorkflow,
  runBillingWeightWorkflow,
  runTrackingWorkflow,
  state
};
