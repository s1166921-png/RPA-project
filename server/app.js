const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { lookupWaybill } = require("./lookup-service");

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
