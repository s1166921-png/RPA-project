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
const historyButton = document.querySelector("#historyButton");
const historyResult = document.querySelector("#historyResult");
const workflowCatalog = document.querySelector("#workflowCatalog");
const operationsPanel = document.querySelector("#operationsPanel");
const operationsRefresh = document.querySelector("#operationsRefresh");
const operationsResult = document.querySelector("#operationsResult");
const tenantMappingForm = document.querySelector("#tenantMappingForm");
const mappingTenantId = document.querySelector("#mappingTenantId");
const mappingCustomerCodes = document.querySelector("#mappingCustomerCodes");
const mappingInvoiceUserIds = document.querySelector("#mappingInvoiceUserIds");
const portalUserForm = document.querySelector("#portalUserForm");
const portalUserResult = document.querySelector("#portalUserResult");
const portalUserUsername = document.querySelector("#portalUserUsername");
const portalUserPassword = document.querySelector("#portalUserPassword");
const portalUserTenantId = document.querySelector("#portalUserTenantId");
const portalUserCustomerCodes = document.querySelector("#portalUserCustomerCodes");
const monthlyBillingForm = document.querySelector("#monthlyBillingForm");
const monthlyBillingMonth = document.querySelector("#monthlyBillingMonth");
const monthlyBillingResult = document.querySelector("#monthlyBillingResult");
const exportsRefresh = document.querySelector("#exportsRefresh");
const exportTasks = document.querySelector("#exportTasks");
let authToken = sessionStorage.getItem("portalAuthToken") || "";
let currentUser = null;

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);
  return fetch(url, { ...options, headers });
}

function showLoginRequired() {
  if (loginPanel) loginPanel.hidden = false;
  if (loginStatus) loginStatus.textContent = "请先登录后查询。";
}

function setOperationsVisible(user) {
  if (operationsPanel) operationsPanel.hidden = user?.role !== "admin";
}

async function loadCurrentUser() {
  if (!authToken) return null;
  const response = await apiFetch("/api/auth/me");
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.user;
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
      currentUser = await loadCurrentUser();
      setOperationsVisible(currentUser);
      loadWorkflowCatalog();
      loadExportTasks();
    }
  } catch {
    // Direct lookup mode can continue when the optional auth config is unavailable.
  }
}

initializeAuth();

async function loadWorkflowCatalog() {
  try {
    const response = await apiFetch("/api/workflows/definitions");
    if (!response.ok) return;
    const payload = await response.json();
    workflowCatalog.innerHTML = "";
    payload.workflows.forEach((workflow) => {
      const item = document.createElement("article");
      item.className = "workflow-definition";
      const title = document.createElement("strong");
      title.textContent = workflow.name;
      const description = document.createElement("p");
      description.textContent = workflow.description;
      const mode = document.createElement("small");
      mode.textContent = workflow.readOnly ? "只读工作流" : "需审批";
      item.append(title, description, mode);
      workflowCatalog.append(item);
    });
  } catch {
    workflowCatalog.textContent = "工作流目录暂时不可用。";
  }
}

loadWorkflowCatalog();

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
    currentUser = payload.user;
    sessionStorage.setItem("portalAuthToken", authToken);
    loginStatus.textContent = "登录成功，可查询所属客户数据。";
    loginForm.hidden = true;
    logoutButton.hidden = false;
    setOperationsVisible(currentUser);
    loadWorkflowCatalog();
    loadExportTasks();
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
  currentUser = null;
  setOperationsVisible(null);
  loginStatus.textContent = "已退出登录。";
});

function exportStatusLabel(status) {
  return { queued: "排队中", processing: "生成中", completed: "已完成", failed: "生成失败" }[status] || status;
}

function exportTypeLabel(type) {
  return { monthly_billing: "月度账单" }[type] || type;
}

async function downloadExportTask(id, filename) {
  try {
    const response = await apiFetch(`/api/exports/tasks/${encodeURIComponent(id)}/download`);
    if (!response.ok) throw new Error("export download failed");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "export.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    exportTasks.textContent = "导出文件暂时不可下载，请刷新后重试。";
  }
}

async function retryExportTask(id) {
  try {
    const response = await apiFetch(`/api/exports/tasks/${encodeURIComponent(id)}/retry`, { method: "POST" });
    if (!response.ok) throw new Error("export retry failed");
    await loadExportTasks();
  } catch {
    exportTasks.textContent = "导出任务重试失败，请稍后再试。";
  }
}

function renderExportTasks(tasks) {
  exportTasks.innerHTML = "";
  if (!tasks.length) {
    exportTasks.textContent = "暂无导出任务。";
    return;
  }
  tasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = "export-task";
    item.dataset.status = task.status;
    const label = document.createElement("strong");
    label.textContent = `${exportTypeLabel(task.exportType)} · ${exportStatusLabel(task.status)}`;
    const detail = document.createElement("small");
    detail.textContent = new Date(task.updatedAt).toLocaleString();
    item.append(label, detail);
    if (task.status === "completed" && task.filename) {
      const download = document.createElement("button");
      download.type = "button";
      download.textContent = "下载";
      download.addEventListener("click", () => downloadExportTask(task.id, task.filename));
      item.append(download);
    }
    if (task.status === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试";
      retry.addEventListener("click", () => retryExportTask(task.id));
      item.append(retry);
    }
    exportTasks.append(item);
  });
}

async function loadExportTasks() {
  if (!authToken) return;
  try {
    const response = await apiFetch("/api/exports/tasks");
    if (!response.ok) return;
    const payload = await response.json();
    renderExportTasks(payload.tasks || []);
    if (payload.tasks?.some((task) => task.status === "queued" || task.status === "processing")) {
      window.setTimeout(loadExportTasks, 400);
    }
  } catch {
    exportTasks.textContent = "导出任务暂时不可用。";
  }
}

exportsRefresh?.addEventListener("click", loadExportTasks);

function parseCsv(value) {
  return value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

async function loadOperations() {
  operationsResult.textContent = "正在读取运营信息…";
  try {
    const [overviewResponse, mappingsResponse, readinessResponse, usersResponse] = await Promise.all([
      apiFetch("/api/operations/overview"),
      apiFetch("/api/operations/tenant-mappings"),
      apiFetch("/api/operations/source-readiness"),
      apiFetch("/api/operations/users")
    ]);
    if (!overviewResponse.ok || !mappingsResponse.ok || !readinessResponse.ok || !usersResponse.ok) throw new Error("operations request failed");
    const overview = await overviewResponse.json();
    const mappings = await mappingsResponse.json();
    const readiness = await readinessResponse.json();
    const users = await usersResponse.json();
    operationsResult.innerHTML = "";
    const summary = document.createElement("p");
    summary.textContent = `工作流：${overview.workflowCount}；租户映射：${overview.tenantMappingCount}；近期运行：${overview.recentRunCount}`;
    operationsResult.append(summary);
    const source = document.createElement("p");
    source.className = "operation-source-readiness";
    source.textContent = `月账单数据源：${readiness.invoiceMonthlyBilling.enabled ? "已就绪" : "未就绪"}（${readiness.invoiceMonthlyBilling.reason}）`;
    operationsResult.append(source);
    mappings.mappings.forEach((mapping) => {
      const item = document.createElement("article");
      item.className = "operation-mapping";
      item.textContent = `${mapping.tenantId} · 客户编码 ${mapping.customerCodes.join(", ") || "-"} · 账单用户 ID ${mapping.invoiceUserIds.join(", ") || "-"}`;
      operationsResult.append(item);
    });
    portalUserResult.innerHTML = "";
    users.users.forEach((user) => {
      const item = document.createElement("article");
      item.className = "portal-user-item";
      const detail = document.createElement("span");
      detail.textContent = `${user.username} · ${user.tenantId} · ${user.enabled ? "启用" : "停用"}`;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.textContent = user.enabled ? "停用" : "启用";
      toggle.setAttribute("aria-label", `${user.enabled ? "Disable" : "Enable"} ${user.username}`);
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        try {
          const response = await apiFetch(`/api/operations/users/${encodeURIComponent(user.username)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: !user.enabled })
          });
          if (!response.ok) throw new Error("portal user update failed");
          await loadOperations();
        } catch {
          portalUserResult.textContent = "客户账号状态更新失败，请稍后重试。";
        } finally {
          toggle.disabled = false;
        }
      });
      item.append(detail, toggle);
      portalUserResult.append(item);
    });
  } catch {
    operationsResult.textContent = "运营信息暂时不可用。";
  }
}

operationsRefresh?.addEventListener("click", loadOperations);

tenantMappingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const tenantId = mappingTenantId.value.trim();
  if (!tenantId) return;
  try {
    const response = await apiFetch(`/api/operations/tenant-mappings/${encodeURIComponent(tenantId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerCodes: parseCsv(mappingCustomerCodes.value),
        invoiceUserIds: parseCsv(mappingInvoiceUserIds.value)
      })
    });
    if (!response.ok) throw new Error("mapping save failed");
    await loadOperations();
  } catch {
    operationsResult.textContent = "映射保存失败。";
  }
});

portalUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await apiFetch("/api/operations/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: portalUserUsername.value.trim(),
        password: portalUserPassword.value,
        tenantId: portalUserTenantId.value.trim(),
        allowedCustomerCodes: parseCsv(portalUserCustomerCodes.value)
      })
    });
    if (!response.ok) throw new Error("portal user creation failed");
    portalUserPassword.value = "";
    await loadOperations();
  } catch {
    portalUserResult.textContent = "客户账号创建失败，请检查账号、密码和租户信息。";
  }
});

historyButton?.addEventListener("click", async () => {
  historyResult.textContent = "正在读取查询记录…";
  try {
    const response = await apiFetch("/api/workflow/runs");
    if (response.status === 401) return showLoginRequired();
    if (!response.ok) throw new Error("history request failed");
    const payload = await response.json();
    historyResult.innerHTML = "";
    if (!payload.runs.length) {
      historyResult.textContent = "暂无查询记录。";
      return;
    }
    payload.runs.forEach((run) => {
      const item = document.createElement("article");
      item.className = "history-item";
      item.textContent = `${run.workflowId} · ${run.status} · ${run.inputCount} 个单号 · ${run.durationMs}ms`;
      historyResult.append(item);
    });
  } catch {
    historyResult.textContent = "查询记录暂时不可用，请稍后重试。";
  }
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
      body: JSON.stringify({ waybillNumbers: currentInput })
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

  if (payload.workflowId === "monthly_billing_query") {
    if (payload.status === "completed") {
      monthlyBillingMonth.value = payload.month || "";
      renderMonthlyBilling(payload);
      const summary = document.createElement("p");
      summary.textContent = `${payload.month} 账单已查询完成，共 ${payload.items?.length || 0} 条。`;
      assistantResult.append(summary);
    } else {
      const error = document.createElement("p");
      error.textContent = billingRequestMessage(payload.status);
      assistantResult.append(error);
    }
    return;
  }

  if (payload.workflowId === "billing_query" && Array.isArray(payload.items)) {
    const panel = document.createElement("section");
    panel.className = "workflow-message billing-message";
    const heading = document.createElement("h3");
    heading.textContent = `${payload.name}（只读结果）`;
    panel.append(heading);
    payload.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "workflow-message-item billing-item";
      card.dataset.waybill = item.waybillNumber;
      const title = document.createElement("strong");
      title.textContent = `${item.waybillNumber} · ${displayStatus(item.status)}`;
      card.append(title);
      if (item.status === "found") {
        const details = document.createElement("p");
        details.textContent = `应收：${item.amount} ${item.currency}；运费单价：${item.freightRate || ""}`;
        card.append(details);
        const raw = document.createElement("small");
        raw.textContent = `来源字段：${item.rawReceivable}；来源：${item.source}；查询时间：${item.queriedAt}；快照：${item.sourceSnapshotId || "-"}`;
        card.append(raw);
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

  if (payload.workflowId === "weight_validation" && Array.isArray(payload.items)) {
    const panel = document.createElement("section");
    panel.className = "workflow-message weight-validation-message";
    const heading = document.createElement("h3");
    heading.textContent = `${payload.name}（只读结果）`;
    panel.append(heading);
    payload.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "workflow-message-item weight-validation-item";
      card.dataset.waybill = item.waybillNumber;
      const title = document.createElement("strong");
      title.textContent = `${item.waybillNumber} · ${item.validationStatus}`;
      const details = document.createElement("p");
      details.textContent = item.status === "found"
        ? `实重：${item.actualWeight}KG；材重：${item.volumeWeight}KG；收费重：${item.chargeWeight}KG`
        : displayReason(item.status);
      card.append(title, details);
      panel.append(card);
    });
    assistantResult.append(panel);
    return;
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
        source.textContent = `来源：${item.source}；查询时间：${item.queriedAt}；快照：${item.sourceSnapshotId || "-"}`;
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

function billingRequestMessage(status) {
  return {
    configuration_required: "当前账户尚未配置账单查询范围，请联系运营人员。",
    source_unavailable: "账单数据源暂时不可用，请稍后再试。",
    invalid_input: "请输入正确的账单月份。"
  }[status] || "账单查询失败，请稍后再试。";
}

function renderMonthlyBilling(payload) {
  monthlyBillingResult.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "monthly-billing-heading";
  const title = document.createElement("h3");
  title.textContent = `${payload.month} 账单`;
  heading.append(title);

  const totals = document.createElement("div");
  totals.className = "monthly-billing-totals";
  (payload.totals || []).forEach((total) => {
    const totalItem = document.createElement("p");
    totalItem.textContent = `${total.currency}: 应收 ${total.totalAmount}，已付 ${total.paidAmount}，未付 ${total.remainingAmount}`;
    totals.append(totalItem);
  });
  heading.append(totals);

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "下载账单 Excel";
  exportButton.addEventListener("click", () => createMonthlyExportTask(payload.month));
  heading.append(exportButton);
  monthlyBillingResult.append(heading);

  if (!payload.items?.length) {
    const empty = document.createElement("p");
    empty.className = "input-hint";
    empty.textContent = "该月份暂无账单。";
    monthlyBillingResult.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "monthly-billing-list";
  payload.items.forEach((invoice) => {
    const item = document.createElement("article");
    item.className = "monthly-billing-item";
    item.dataset.invoice = invoice.invoiceNumber;
    const title = document.createElement("strong");
    title.textContent = invoice.invoiceNumber || "-";
    const details = document.createElement("p");
    details.textContent = `${invoice.invoiceDate || "-"} · ${invoice.currency || "-"} · 应收 ${invoice.totalAmount} · 未付 ${invoice.remainingAmount}`;
    const source = document.createElement("small");
    source.textContent = `状态：${invoice.status || "-"}；来源：${invoice.source || "-"}；查询时间：${invoice.queriedAt}；快照：${invoice.sourceSnapshotId || "-"}`;
    item.append(title, details, source);
    list.append(item);
  });
  monthlyBillingResult.append(list);
}

async function createMonthlyExportTask(month) {
  try {
    const response = await apiFetch("/api/exports/tasks/monthly-billing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month })
    });
    if (response.status === 401) return showLoginRequired();
    if (!response.ok) {
      const payload = await response.json();
      monthlyBillingResult.textContent = billingRequestMessage(payload.status);
      return;
    }
    await loadExportTasks();
  } catch {
    monthlyBillingResult.textContent = "账单导出任务创建失败，请稍后再试。";
  }
}

monthlyBillingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const month = monthlyBillingMonth.value;
  if (!month) return;
  monthlyBillingResult.textContent = "正在查询账单…";
  try {
    const response = await apiFetch("/api/workflows/monthly-billing-query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month })
    });
    if (response.status === 401) return showLoginRequired();
    const payload = await response.json();
    if (!response.ok) {
      monthlyBillingResult.textContent = billingRequestMessage(payload.status);
      return;
    }
    renderMonthlyBilling(payload);
  } catch {
    monthlyBillingResult.textContent = "账单查询失败，请稍后再试。";
  }
});

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
