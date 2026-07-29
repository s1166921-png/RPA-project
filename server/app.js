const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { lookupWaybill } = require("./lookup-service");
const { lookupWaybills, parseWaybillNumbers } = require("./batch-lookup-service");
const { buildExportRows, buildBatchExportRows } = require("./export-service");
const { createXlsxExport } = require("./export-workbook");
const { runBillingWeightWorkflow } = require("./billing-weight-workflow");
const { runShipmentTrackingWorkflow } = require("./shipment-tracking-workflow");
const { runBillingQueryWorkflow } = require("./billing-query-workflow");
const { listWorkflowDefinitions } = require("./workflow-definitions");
const { runWeightValidationWorkflow } = require("./weight-validation-workflow");
const { handleAssistantMessage } = require("./assistant-service");

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

function bearerToken(request) {
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function protectResult(result, user, auth) {
  if (!user || result.status !== "found" || auth.canAccess(user, result.shipment)) return result;
  return { status: "not_found", waybillNumber: result.shipment.waybillNumber };
}

function recordRun(runStore, user, workflowId, status, startedAt, inputCount) {
  runStore?.record({
    workflowId,
    tenantId: user?.tenantId || "public",
    status,
    durationMs: Date.now() - startedAt,
    inputCount
  });
}

function createServer({ provider, staticRoot, auth = null, requireAuth = false, runStore = null, tenantMappings = null }) {
  return http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/auth/login") {
      try {
        if (!auth) return sendJson(response, 503, { status: "auth_unavailable" });
        const body = await readJson(request);
        const result = auth.login(body.username, body.password);
        return result
          ? sendJson(response, 200, { status: "authenticated", ...result })
          : sendJson(response, 401, { status: "invalid_credentials" });
      } catch {
        return sendJson(response, 400, { status: "invalid_input" });
      }
    }

    if (request.method === "GET" && request.url === "/api/auth/config") {
      return sendJson(response, 200, { enabled: requireAuth });
    }

    let user = null;
    if (requireAuth && request.url.startsWith("/api/")) {
      user = auth?.verify(bearerToken(request));
      if (!user) return sendJson(response, 401, { status: "authentication_required" });
    }

    if (request.method === "GET" && request.url === "/api/workflow/runs") {
      return sendJson(response, 200, { status: "ok", runs: runStore?.list(user?.tenantId || "public") || [] });
    }

    if (request.method === "GET" && request.url === "/api/auth/me") {
      return user
        ? sendJson(response, 200, { status: "authenticated", user: auth.publicUser(user) })
        : sendJson(response, 401, { status: "authentication_required" });
    }

    if (request.method === "GET" && request.url === "/api/workflows/definitions") {
      return sendJson(response, 200, { status: "ok", workflows: listWorkflowDefinitions() });
    }

    if (request.url.startsWith("/api/operations/") && !auth?.isAdmin(user)) {
      return sendJson(response, 403, { status: "forbidden" });
    }

    if (request.method === "GET" && request.url === "/api/operations/overview") {
      return sendJson(response, 200, {
        status: "ok",
        tenantMappingCount: tenantMappings?.list().length || 0,
        workflowCount: listWorkflowDefinitions().length,
        recentRunCount: runStore?.list().length || 0
      });
    }

    if (request.method === "GET" && request.url === "/api/operations/tenant-mappings") {
      return sendJson(response, 200, { status: "ok", mappings: tenantMappings?.list() || [] });
    }

    const mappingMatch = request.url.match(/^\/api\/operations\/tenant-mappings\/([^/?]+)$/);
    if (request.method === "PUT" && mappingMatch) {
      try {
        if (!tenantMappings) return sendJson(response, 503, { status: "configuration_unavailable" });
        const mapping = tenantMappings.upsert(decodeURIComponent(mappingMatch[1]), await readJson(request));
        return sendJson(response, 200, { status: "saved", mapping });
      } catch {
        return sendJson(response, 400, { status: "invalid_input" });
      }
    }

    if (request.method === "POST" && request.url === "/api/shipments/lookup") {
      try {
        const result = protectResult(await lookupWaybill(await readJson(request), provider), user, auth);
        const status = { found: 200, invalid_input: 400, not_found: 404, source_unavailable: 502 }[result.status];
        return sendJson(response, status, result);
      } catch {
        return sendJson(response, 400, { status: "invalid_input" });
      }
    }

    if (request.method === "POST" && request.url === "/api/shipments/batch-lookup") {
      const startedAt = Date.now();
      try {
        const body = await readJson(request);
        const parsed = parseWaybillNumbers(body.waybillNumbers);
        const result = await lookupWaybills(body.waybillNumbers, provider);
        if (result.status !== "completed") {
          recordRun(runStore, user, "waybill_lookup", result.status, startedAt, 0);
          return sendJson(response, 400, result);
        }
        recordRun(runStore, user, "waybill_lookup", result.status, startedAt, parsed.waybillNumbers.length);
        return sendJson(response, 200, {
          status: result.status,
          results: addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers)
        });
      } catch {
        return sendJson(response, 400, { status: "invalid_input", results: [] });
      }
    }

    if (request.method === "POST" && request.url === "/api/workflows/billing-weight-confirmation") {
      const startedAt = Date.now();
      try {
        const body = await readJson(request);
        const parsed = parseWaybillNumbers(body.waybillNumbers);
        const result = await lookupWaybills(body.waybillNumbers, provider);
        if (result.status !== "completed") {
          recordRun(runStore, user, "billing_weight_confirmation", result.status, startedAt, 0);
          return sendJson(response, 400, result);
        }
        recordRun(runStore, user, "billing_weight_confirmation", "completed", startedAt, parsed.waybillNumbers.length);
        return sendJson(response, 200, runBillingWeightWorkflow(addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers)));
      } catch {
        return sendJson(response, 400, { status: "invalid_input", items: [] });
      }
    }

    if (request.method === "POST" && request.url === "/api/workflows/shipment-tracking") {
      const startedAt = Date.now();
      try {
        const body = await readJson(request);
        const parsed = parseWaybillNumbers(body.waybillNumbers);
        const result = await lookupWaybills(body.waybillNumbers, provider);
        if (result.status !== "completed") {
          recordRun(runStore, user, "shipment_tracking", result.status, startedAt, 0);
          return sendJson(response, 400, result);
        }
        recordRun(runStore, user, "shipment_tracking", "completed", startedAt, parsed.waybillNumbers.length);
        const protectedResults = addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers);
        return sendJson(response, 200, runShipmentTrackingWorkflow(protectedResults));
      } catch {
        return sendJson(response, 400, { status: "invalid_input", items: [] });
      }
    }

    if (request.method === "POST" && request.url === "/api/workflows/billing-query") {
      const startedAt = Date.now();
      try {
        const body = await readJson(request);
        const parsed = parseWaybillNumbers(body.waybillNumbers);
        const result = await lookupWaybills(body.waybillNumbers, provider);
        if (result.status !== "completed") {
          recordRun(runStore, user, "billing_query", result.status, startedAt, 0);
          return sendJson(response, 400, result);
        }
        recordRun(runStore, user, "billing_query", "completed", startedAt, parsed.waybillNumbers.length);
        const protectedResults = addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers);
        return sendJson(response, 200, runBillingQueryWorkflow(protectedResults));
      } catch {
        return sendJson(response, 400, { status: "invalid_input", items: [] });
      }
    }

    if (request.method === "POST" && request.url === "/api/workflows/weight-validation") {
      const startedAt = Date.now();
      try {
        const body = await readJson(request);
        const parsed = parseWaybillNumbers(body.waybillNumbers);
        const result = await lookupWaybills(body.waybillNumbers, provider);
        if (result.status !== "completed") {
          recordRun(runStore, user, "weight_validation", result.status, startedAt, 0);
          return sendJson(response, 400, result);
        }
        recordRun(runStore, user, "weight_validation", "completed", startedAt, parsed.waybillNumbers.length);
        const protectedResults = addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers);
        return sendJson(response, 200, runWeightValidationWorkflow(protectedResults));
      } catch {
        return sendJson(response, 400, { status: "invalid_input", items: [] });
      }
    }

    if (request.method === "POST" && request.url === "/api/assistant/message") {
      const startedAt = Date.now();
      try {
        const body = await readJson(request);
        const assistant = await handleAssistantMessage(body.message, {
          lookup: async (waybillNumbers) => {
            const parsed = parseWaybillNumbers(waybillNumbers);
            const result = await lookupWaybills(waybillNumbers, provider);
            return result.status === "completed"
              ? { ...result, results: addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers) }
              : result;
          },
          billing: async (waybillNumbers) => {
            const parsed = parseWaybillNumbers(waybillNumbers);
            const result = await lookupWaybills(waybillNumbers, provider);
            if (result.status !== "completed") return result;
            return runBillingWeightWorkflow(addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers));
          },
          tracking: async (waybillNumbers) => {
            const parsed = parseWaybillNumbers(waybillNumbers);
            const result = await lookupWaybills(waybillNumbers, provider);
            if (result.status !== "completed") return result;
            return runShipmentTrackingWorkflow(addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers));
          },
          billingQuery: async (waybillNumbers) => {
            const parsed = parseWaybillNumbers(waybillNumbers);
            const result = await lookupWaybills(waybillNumbers, provider);
            if (result.status !== "completed") return result;
            return runBillingQueryWorkflow(addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers));
          },
          weightValidation: async (waybillNumbers) => {
            const parsed = parseWaybillNumbers(waybillNumbers);
            const result = await lookupWaybills(waybillNumbers, provider);
            if (result.status !== "completed") return result;
            return runWeightValidationWorkflow(addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers));
          }
        });
        recordRun(runStore, user, assistant.tool || "assistant", "completed", startedAt, assistant.waybillNumbers?.length || 0);
        return sendJson(response, 200, assistant);
      } catch {
        return sendJson(response, 400, { status: "invalid_input", reply: "暂时无法处理这个请求，请稍后重试。" });
      }
    }

    if (request.method === "POST" && request.url === "/api/exports/waybill") {
      try {
        const result = protectResult(await lookupWaybill(await readJson(request), provider), user, auth);
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
      if (Array.isArray(body.waybillNumbers) || typeof body.waybillNumbers === "string") {
        const parsed = parseWaybillNumbers(body.waybillNumbers);
        const result = await lookupWaybills(body.waybillNumbers, provider);
        if (result.status !== "completed") return sendJson(response, 400, result);
        body.results = addRequestedWaybillNumbers(result.results.map((item) => protectResult(item, user, auth)), parsed.waybillNumbers);
      } else if (requireAuth) {
        return sendJson(response, 404, { status: "not_found" });
      }
      if (!Array.isArray(body.results) || body.results.length === 0 || body.results.length > MAX_BATCH_RESULTS || !body.results.every(isValidBatchExportResult)) {
        return sendJson(response, 400, { status: "invalid_input" });
      }
      if (requireAuth && body.results.some((item) => item.status === "found" && !auth.canAccess(user, item.shipment))) {
        return sendJson(response, 404, { status: "not_found" });
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
