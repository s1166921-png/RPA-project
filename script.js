const form = document.querySelector("#lookupForm");
const input = document.querySelector("#waybillNumbers");
const result = document.querySelector("#lookupResult");
const assistantForm = document.querySelector("#assistantForm");
const assistantMessage = document.querySelector("#assistantMessage");
const assistantResult = document.querySelector("#assistantResult");
const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#loginForm");
const loginUsername = document.querySelector("#loginUsername");
const loginPassword = document.querySelector("#loginPassword");
const loginStatus = document.querySelector("#loginStatus");
const logoutButton = document.querySelector("#logoutButton");
let currentBatch = [];
let currentInput = "";
let authToken = sessionStorage.getItem("portalAuthToken") || "";

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);
  return fetch(url, { ...options, headers });
}

function showLoginRequired() {
  if (loginPanel) loginPanel.hidden = false;
  if (loginStatus) loginStatus.textContent = "请先登录后查询。";
}

async function initializeAuth() {
  try {
    const response = await fetch("/api/auth/config");
    const config = await response.json();
    if (!config.enabled || !loginPanel) return;
    loginPanel.hidden = false;
    if (authToken) {
      loginStatus.textContent = "已登录，可查询所属客户数据。";
      logoutButton.hidden = false;
      loginForm.hidden = true;
    }
  } catch {
    // Direct lookup mode can continue when the optional auth config is unavailable.
  }
}

initializeAuth();

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "正在登录…";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: loginUsername.value, password: loginPassword.value })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error("invalid credentials");
    authToken = payload.token;
    sessionStorage.setItem("portalAuthToken", authToken);
    loginStatus.textContent = "登录成功，可查询所属客户数据。";
    loginForm.hidden = true;
    logoutButton.hidden = false;
    loginPassword.value = "";
  } catch {
    loginStatus.textContent = "账号或密码不正确，请重试。";
  }
});

logoutButton?.addEventListener("click", () => {
  authToken = "";
  sessionStorage.removeItem("portalAuthToken");
  loginForm.hidden = false;
  logoutButton.hidden = true;
  loginStatus.textContent = "已退出登录。";
});

function setMessage(message, className = "") {
  result.innerHTML = "";
  const paragraph = document.createElement("p");
  paragraph.className = className;
  paragraph.textContent = message;
  result.append(paragraph);
}

function typedEntryCount(value) {
  return value.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean).length;
}

function displayStatus(status) {
  return {
    found: "已找到",
    not_found: "未找到",
    source_unavailable: "数据源暂不可用"
  }[status] || "查询失败";
}

function displayReason(status) {
  return {
    not_found: "未找到该运单，请核对单号后重试。",
    source_unavailable: "新智慧数据源暂时不可用，请稍后重试。"
  }[status] || "查询未完成，请稍后重试。";
}

function addSummary(item, shipment) {
  const summary = document.createElement("p");
  summary.className = "batch-summary";
  const fields = [shipment.service, shipment.country, shipment.chargeWeight && `收费重 ${shipment.chargeWeight}`].filter(Boolean);
  summary.textContent = fields.join(" · ") || "已获取运单数据";
  item.append(summary);
}

function renderBatch(batch) {
  result.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "result-heading";
  const title = document.createElement("h2");
  title.textContent = `查询完成，共 ${batch.length} 条`;
  heading.append(title);

  const list = document.createElement("div");
  list.className = "batch-list";
  batch.forEach((entry) => {
    const waybillNumber = entry.waybillNumber || entry.shipment?.waybillNumber || "-";
    const item = document.createElement("article");
    item.className = "batch-item";
    item.dataset.waybill = waybillNumber;
    item.dataset.status = entry.status;

    const row = document.createElement("div");
    row.className = "batch-item-main";
    const number = document.createElement("strong");
    number.textContent = waybillNumber;
    const status = document.createElement("span");
    status.className = `status status-${entry.status}`;
    status.textContent = displayStatus(entry.status);
    row.append(number, status);
    item.append(row);

    if (entry.status === "found") {
      addSummary(item, entry.shipment);
    } else {
      const reason = document.createElement("p");
      reason.className = "batch-reason";
      reason.textContent = displayReason(entry.status);
      item.append(reason);
    }
    list.append(item);
  });

  const workflow = document.createElement("button");
  workflow.id = "billingWeightWorkflow";
  workflow.type = "button";
  workflow.textContent = "生成计费重确认";
  workflow.addEventListener("click", runBillingWeightWorkflow);

  const download = document.createElement("button");
  download.id = "downloadBatchExport";
  download.type = "button";
  download.textContent = "下载 Excel";
  download.addEventListener("click", downloadBatchExport);
  result.append(heading, list, workflow, download);
}

async function runBillingWeightWorkflow() {
  try {
    const response = await apiFetch("/api/workflows/billing-weight-confirmation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ waybillNumbers: [currentInput] })
    });
    if (!response.ok) return setMessage("计费重确认生成失败，请稍后重试。", "error");
    const payload = await response.json();
    const panel = document.createElement("section");
    panel.className = "workflow-message";
    const heading = document.createElement("h3");
    heading.textContent = `${payload.name}（只读结果）`;
    panel.append(heading);
    payload.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "workflow-message-item";
      const title = document.createElement("strong");
      title.textContent = `${item.waybillNumber} · ${item.branch}`;
      const message = document.createElement("pre");
      message.textContent = item.message || displayReason(item.status);
      card.append(title, message);
      panel.append(card);
    });
    result.append(panel);
  } catch {
    setMessage("计费重确认生成失败，请稍后重试。", "error");
  }
}

async function downloadBatchExport() {
  try {
    const response = await apiFetch("/api/exports/batch-waybills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ results: currentBatch })
    });
    if (!response.ok) return setMessage("批量导出失败，请稍后重试。", "error");
    const url = URL.createObjectURL(await response.blob());
    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="?([^";]+)/)?.[1] || "waybill-batch.xlsx";
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    setMessage("批量导出失败，请稍后重试。", "error");
  }
}

function renderAssistantResult(payload) {
  assistantResult.innerHTML = "";
  const reply = document.createElement("p");
  reply.textContent = payload.reply || "已完成查询。";
  assistantResult.append(reply);

  if (Array.isArray(payload.results)) {
    currentInput = (payload.waybillNumbers || []).join("\n");
    currentBatch = payload.results;
    renderBatch(currentBatch);
  }

  if (payload.workflowId === "shipment_tracking" && Array.isArray(payload.items)) {
    const panel = document.createElement("section");
    panel.className = "workflow-message tracking-message";
    const heading = document.createElement("h3");
    heading.textContent = `${payload.name}（只读结果）`;
    panel.append(heading);
    payload.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "workflow-message-item tracking-item";
      card.dataset.waybill = item.waybillNumber;
      const title = document.createElement("strong");
      title.textContent = `${item.waybillNumber} · ${displayStatus(item.status)}`;
      card.append(title);
      if (item.status === "found") {
        const summary = document.createElement("p");
        summary.textContent = `当前状态：${item.currentStatus || ""}；最后轨迹：${item.lastRoute || ""}`;
        card.append(summary);
        if (item.routeNodes.length) {
          const nodes = document.createElement("ol");
          nodes.className = "tracking-nodes";
          item.routeNodes.forEach((node) => {
            const entry = document.createElement("li");
            entry.textContent = [node.time, node.location, node.status].filter(Boolean).join(" · ");
            nodes.append(entry);
          });
          card.append(nodes);
        }
        const source = document.createElement("small");
        source.textContent = `来源：${item.source}；查询时间：${item.queriedAt}`;
        card.append(source);
      } else {
        const reason = document.createElement("p");
        reason.className = "batch-reason";
        reason.textContent = displayReason(item.status);
        card.append(reason);
      }
      panel.append(card);
    });
    assistantResult.append(panel);
    return;
  }

  if (Array.isArray(payload.items)) {
    const panel = document.createElement("section");
    panel.className = "workflow-message";
    const heading = document.createElement("h3");
    heading.textContent = `${payload.name}（只读结果）`;
    panel.append(heading);
    payload.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "workflow-message-item";
      const title = document.createElement("strong");
      title.textContent = `${item.waybillNumber} · ${item.branch}`;
      const message = document.createElement("pre");
      message.textContent = item.message || displayReason(item.status);
      card.append(title, message);
      panel.append(card);
    });
    assistantResult.append(panel);
  }
}

assistantForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = assistantMessage.value.trim();
  if (!message) {
    assistantResult.textContent = "请描述要查询的内容。";
    return;
  }
  assistantResult.textContent = "正在理解你的需求并调用只读工作流…";
  try {
    const response = await apiFetch("/api/assistant/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message })
    });
    const payload = await response.json();
    if (response.status === 401) return showLoginRequired();
    if (!response.ok) throw new Error("assistant request failed");
    renderAssistantResult(payload);
  } catch {
    assistantResult.textContent = "助手暂时不可用，请稍后重试。";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawInput = input.value.trim();
  if (!rawInput) return setMessage("请输入运单号。", "error");
  if (window.location.protocol === "file:") {
    return setMessage("请通过本地服务地址打开页面，例如 http://127.0.0.1:3000。", "error");
  }

  const count = typedEntryCount(rawInput);
  currentInput = rawInput;
  setMessage(`正在查询 ${count} 个单号...`);
  try {
    const response = await apiFetch("/api/shipments/batch-lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ waybillNumbers: [rawInput] })
    });
    const payload = await response.json();
    if (response.status === 401) return showLoginRequired();
    if (payload.status === "completed") {
      currentBatch = payload.results;
      return renderBatch(currentBatch);
    }
    if (payload.status === "limit_exceeded") return setMessage("单次最多查询 50 个不同单号。", "error");
    setMessage("查询失败，请检查输入后重试。", "error");
  } catch {
    setMessage("查询失败，请稍后重试。", "error");
  }
});
