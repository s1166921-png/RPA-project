const form = document.querySelector("#lookupForm");
const input = document.querySelector("#waybillNumber");
const result = document.querySelector("#lookupResult");
let currentWaybill = "";

function setMessage(message, className = "") {
  result.innerHTML = "";
  const paragraph = document.createElement("p");
  paragraph.className = className;
  paragraph.textContent = message;
  result.append(paragraph);
}

function addField(container, label, value) {
  const item = document.createElement("div");
  const key = document.createElement("span");
  const text = document.createElement("strong");
  key.textContent = label;
  text.textContent = value || "-";
  item.append(key, text);
  container.append(item);
}

function renderShipment(shipment) {
  result.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "result-heading";
  const title = document.createElement("h2");
  title.textContent = shipment.waybillNumber;
  const source = document.createElement("p");
  source.textContent = `数据来源：${shipment.source} | 查询时间：${new Date(shipment.queriedAt).toLocaleString("zh-CN", { hour12: false })}`;
  heading.append(title, source);
  const grid = document.createElement("div");
  grid.className = "result-grid";
  [["FBA号", shipment.fbaNumber], ["服务", shipment.service], ["国家", shipment.country], ["收件人", shipment.recipient], ["件数", shipment.pieces], ["实重", shipment.actualWeight], ["材重", shipment.volumeWeight], ["收费重", shipment.chargeWeight], ["应收", shipment.receivable], ["报关方式", shipment.customsMode], ["最后路由", shipment.lastRoute]].forEach(([label, value]) => addField(grid, label, value));
  const download = document.createElement("button");
  download.id = "downloadExport";
  download.type = "button";
  download.textContent = "下载 Excel";
  download.addEventListener("click", downloadExport);
  result.append(heading, grid, download);
}

async function downloadExport() {
  try {
    const response = await fetch("/api/exports/waybill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ waybillNumber: currentWaybill }) });
    if (!response.ok) return setMessage("导出失败，请稍后重试。", "error");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `waybill-${currentWaybill}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    setMessage("导出失败，请稍后重试。", "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  currentWaybill = input.value.trim().toUpperCase();
  if (!currentWaybill) return setMessage("请输入运单号。", "error");
  if (window.location.protocol === "file:") {
    return setMessage("请通过本地服务地址打开页面，例如 http://127.0.0.1:3000。", "error");
  }
  setMessage("正在查询...");
  try {
    const response = await fetch("/api/shipments/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ waybillNumber: currentWaybill }) });
    const payload = await response.json();
    if (payload.status === "found") return renderShipment(payload.shipment);
    if (payload.status === "not_found") return setMessage("未找到该运单，请核对单号后再试。", "error");
    if (payload.status === "source_unavailable") return setMessage("新智慧数据源暂时不可用，请稍后重试。", "error");
    setMessage("查询失败，请稍后重试。", "error");
  } catch { setMessage("查询失败，请稍后重试。", "error"); }
});
