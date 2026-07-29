const form = document.querySelector("#lookupForm");
const input = document.querySelector("#waybillNumbers");
const result = document.querySelector("#lookupResult");
let currentBatch = [];

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

  const download = document.createElement("button");
  download.id = "downloadBatchExport";
  download.type = "button";
  download.textContent = "下载 Excel";
  download.addEventListener("click", downloadBatchExport);
  result.append(heading, list, download);
}

async function downloadBatchExport() {
  try {
    const response = await fetch("/api/exports/batch-waybills", {
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawInput = input.value.trim();
  if (!rawInput) return setMessage("请输入运单号。", "error");
  if (window.location.protocol === "file:") {
    return setMessage("请通过本地服务地址打开页面，例如 http://127.0.0.1:3000。", "error");
  }

  const count = typedEntryCount(rawInput);
  setMessage(`正在查询 ${count} 个单号...`);
  try {
    const response = await fetch("/api/shipments/batch-lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ waybillNumbers: [rawInput] })
    });
    const payload = await response.json();
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
