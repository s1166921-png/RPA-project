const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { lookupWaybill } = require("./lookup-service");
const { lookupWaybills, parseWaybillNumbers } = require("./batch-lookup-service");
const { buildExportRows, buildBatchExportRows } = require("./export-service");
const { createXlsxExport } = require("./export-workbook");

const MAX_BATCH_RESULTS = 50;

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("invalid json")); }
    });
    request.on("error", reject);
  });
}

function addRequestedWaybillNumbers(results, waybillNumbers) {
  return results.map((result, index) => result.status === "found"
    ? result
    : { ...result, waybillNumber: waybillNumbers[index] });
}

function isValidBatchExportResult(result) {
  if (!result || typeof result !== "object") return false;
  if (result.status === "found") return Boolean(result.shipment && result.shipment.waybillNumber);
  return ["not_found", "source_unavailable"].includes(result.status) && Boolean(result.waybillNumber);
}

function createServer({ provider, staticRoot }) {
  return http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/shipments/lookup") {
      try {
        const result = await lookupWaybill(await readJson(request), provider);
        const status = { found: 200, invalid_input: 400, not_found: 404, source_unavailable: 502 }[result.status];
        return sendJson(response, status, result);
      } catch {
        return sendJson(response, 400, { status: "invalid_input" });
      }
    }

    if (request.method === "POST" && request.url === "/api/shipments/batch-lookup") {
      try {
        const body = await readJson(request);
        const parsed = parseWaybillNumbers(body.waybillNumbers);
        const result = await lookupWaybills(body.waybillNumbers, provider);
        if (result.status !== "completed") return sendJson(response, 400, result);
        return sendJson(response, 200, {
          status: result.status,
          results: addRequestedWaybillNumbers(result.results, parsed.waybillNumbers)
        });
      } catch {
        return sendJson(response, 400, { status: "invalid_input", results: [] });
      }
    }

    if (request.method === "POST" && request.url === "/api/exports/waybill") {
      try {
        const result = await lookupWaybill(await readJson(request), provider);
        if (result.status !== "found") {
          const status = { invalid_input: 400, not_found: 404, source_unavailable: 502 }[result.status];
          return sendJson(response, status, result);
        }
        const file = await createXlsxExport(buildExportRows([result.shipment]));
        response.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="waybill-${result.shipment.waybillNumber}.xlsx"`,
          "cache-control": "no-store"
        });
        return response.end(file);
      } catch {
        return sendJson(response, 502, { status: "source_unavailable" });
      }
    }

    if (request.method === "POST" && request.url === "/api/exports/batch-waybills") {
      let body;
      try {
        body = await readJson(request);
      } catch {
        return sendJson(response, 400, { status: "invalid_input" });
      }
      if (!Array.isArray(body.results) || body.results.length === 0 || body.results.length > MAX_BATCH_RESULTS || !body.results.every(isValidBatchExportResult)) {
        return sendJson(response, 400, { status: "invalid_input" });
      }
      try {
        const file = await createXlsxExport(buildBatchExportRows(body.results));
        response.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="waybill-batch-${Date.now()}.xlsx"`,
          "cache-control": "no-store"
        });
        return response.end(file);
      } catch {
        return sendJson(response, 502, { status: "source_unavailable" });
      }
    }

    const pathname = request.url === "/" ? "/index.html" : request.url;
    const file = path.resolve(staticRoot, `.${pathname}`);
    if (!file.startsWith(path.resolve(staticRoot)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404);
      return response.end("Not found");
    }
    response.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8" });
    fs.createReadStream(file).pipe(response);
  });
}

module.exports = { createServer };
