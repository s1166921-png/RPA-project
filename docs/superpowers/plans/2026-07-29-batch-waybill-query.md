# Batch Waybill Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a local portal user paste up to 50 waybill numbers, review per-waybill outcomes, and download one Excel file for the batch.

**Architecture:** Add a focused batch service that validates, normalizes, deduplicates, and sequentially invokes the existing read-only `lookupWaybill` function. Add batch lookup and batch export HTTP routes; the browser keeps the returned batch result in memory for a single download action. Existing single-waybill routes remain unchanged.

**Tech Stack:** Node.js built-in HTTP server, Playwright, Node test runner, existing `@oai/artifact-tool` workbook exporter, vanilla HTML/CSS/JavaScript.

## Global Constraints

- Input accepts newline, comma, and whitespace delimiters; it removes blanks and preserves first-occurrence order.
- A batch has at most 50 distinct waybill numbers.
- New Wisdom access remains read-only; do not add data mutation, label management, or source-system exports.
- The local prototype server must continue binding to `127.0.0.1` by default.
- Each development node requires a UI or caller-path test covering success and one relevant failure before the next node begins.

---

## File Structure

- Create `server/batch-lookup-service.js`: parse text or arrays and execute isolated per-waybill lookups.
- Create `server/batch-lookup-service.test.js`: unit coverage for parsing, de-duplication, limit rejection, and partial failure.
- Modify `server/app.js`: add batch lookup/export routes while preserving single lookup routes.
- Modify `server/app.test.js`: exercise batch HTTP success, validation, and XLSX response.
- Modify `server/export-service.js`: create stable export rows for successful and failed batch items.
- Modify `server/export-service.test.js`: assert status and failure columns for each outcome.
- Modify `index.html`, `script.js`, `styles.css`: replace the single text input with a batch text area and a compact result table.
- Modify `portal-smoke.test.js`: verify a user can paste a batch, see two successes, download Excel, and see a validation error.

## Interfaces

```js
// server/batch-lookup-service.js
function parseWaybillNumbers(input, maxItems = 50) {
  // returns { status: "valid", waybillNumbers: string[] }
  // or { status: "invalid_input" | "limit_exceeded", waybillNumbers: [] }
}

async function lookupWaybills(input, provider, now) {
  // returns { status: "completed", results: [{ waybillNumber, status, shipment?, failureReason? }] }
  // or { status: "invalid_input" | "limit_exceeded", results: [] }
}

// POST /api/shipments/batch-lookup
// request:  { waybillNumbers: string[] }
// response: { status: "completed", results: BatchResult[] }

// POST /api/exports/batch-waybills
// request:  { results: BatchResult[] }
// response: XLSX attachment
```

### Task 1: Batch Lookup Service

**Files:**
- Create: `server/batch-lookup-service.js`
- Create: `server/batch-lookup-service.test.js`

**Consumes:** `lookupWaybill(input, provider, now)` from `server/lookup-service.js`.

**Produces:** `parseWaybillNumbers(input, maxItems)` and `lookupWaybills(input, provider, now)`.

- [ ] **Step 1: Write failing tests for parsing and mixed results**

```js
test("parses a batch in first-occurrence order", () => {
  assert.deepEqual(parseWaybillNumbers("mo1, MO2\nMO1  MO3"), {
    status: "valid",
    waybillNumbers: ["MO1", "MO2", "MO3"]
  });
});

test("rejects a batch larger than fifty distinct numbers", () => {
  assert.equal(parseWaybillNumbers(Array.from({ length: 51 }, (_, index) => `MO${index}`)).status, "limit_exceeded");
});

test("completes remaining lookups when one item is unavailable", async () => {
  const result = await lookupWaybills(["MO1", "MO2"], provider);
  assert.deepEqual(result.results.map((item) => item.status), ["found", "source_unavailable"]);
});
```

- [ ] **Step 2: Run the batch service tests to verify they fail**

Run: `node --test server/batch-lookup-service.test.js`

Expected: FAIL because `batch-lookup-service.js` does not exist.

- [ ] **Step 3: Implement minimal parsing and sequential batch execution**

```js
function parseWaybillNumbers(input, maxItems = 50) {
  const source = Array.isArray(input) ? input.join("\n") : String(input || "");
  const waybillNumbers = [...new Set(source.split(/[\s,，]+/).map((item) => item.trim().toUpperCase()).filter(Boolean))];
  if (!waybillNumbers.length) return { status: "invalid_input", waybillNumbers: [] };
  if (waybillNumbers.length > maxItems) return { status: "limit_exceeded", waybillNumbers: [] };
  return { status: "valid", waybillNumbers };
}

async function lookupWaybills(input, provider, now) {
  const parsed = parseWaybillNumbers(input);
  if (parsed.status !== "valid") return { status: parsed.status, results: [] };
  const results = [];
  for (const waybillNumber of parsed.waybillNumbers) {
    const result = await lookupWaybill({ waybillNumber }, provider, now);
    results.push({ waybillNumber, ...result });
  }
  return { status: "completed", results };
}
```

- [ ] **Step 4: Run the batch service tests to verify they pass**

Run: `node --test server/batch-lookup-service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/batch-lookup-service.js server/batch-lookup-service.test.js
git commit -m "feat: add batch waybill lookup service"
```

### Task 2: Batch API and Excel Rows

**Files:**
- Modify: `server/app.js`
- Modify: `server/app.test.js`
- Modify: `server/export-service.js`
- Modify: `server/export-service.test.js`

**Consumes:** `lookupWaybills(input, provider)` and `createXlsxExport(rows)`.

**Produces:** `POST /api/shipments/batch-lookup`, `POST /api/exports/batch-waybills`, and `buildBatchExportRows(results)`.

- [ ] **Step 1: Write failing HTTP and export tests**

```js
const response = await request(server, "POST", "/api/shipments/batch-lookup", {
  waybillNumbers: ["MO10083334", "MISSING-1"]
});
assert.equal(response.statusCode, 200);
assert.deepEqual(JSON.parse(response.body).results.map((item) => item.status), ["found", "not_found"]);

const rows = buildBatchExportRows([
  { waybillNumber: "MO10083334", status: "found", shipment },
  { waybillNumber: "MISSING-1", status: "not_found" }
]);
assert.deepEqual(rows[0].slice(-2), ["查询状态", "失败原因"]);
assert.deepEqual(rows[2].slice(-2), ["未找到", "未找到该运单"]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/app.test.js server/export-service.test.js`

Expected: FAIL because batch routes and `buildBatchExportRows` do not exist.

- [ ] **Step 3: Implement the batch HTTP routes and fixed failure rows**

```js
if (request.method === "POST" && request.url === "/api/shipments/batch-lookup") {
  const result = await lookupWaybills((await readJson(request)).waybillNumbers, provider);
  const status = result.status === "completed" ? 200 : 400;
  return sendJson(response, status, result);
}

function buildBatchExportRows(results) {
  return [headers, ...results.map((item) => {
    const shipment = item.shipment || {};
    return [...businessColumns(shipment, item.waybillNumber), statusLabel(item.status), item.failureReason || failureText(item.status)];
  })];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/app.test.js server/export-service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/app.js server/app.test.js server/export-service.js server/export-service.test.js
git commit -m "feat: add batch lookup API and export"
```

### Task 3: Batch Portal Interface

**Files:**
- Modify: `index.html`
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `portal-smoke.test.js`

**Consumes:** `POST /api/shipments/batch-lookup` and `POST /api/exports/batch-waybills`.

**Produces:** multi-line input, compact batch outcome list, and one batch Excel download action.

- [ ] **Step 1: Write a failing user-path test**

```js
await page.locator("#waybillNumbers").fill("MO10083334\nMISSING-1");
await page.locator("#lookupForm button").click();
await page.waitForSelector("[data-waybill='MO10083334'][data-status='found']");
await page.waitForSelector("[data-waybill='MISSING-1'][data-status='not_found']");
const download = page.waitForEvent("download");
await page.locator("#downloadBatchExport").click();
assert.match((await download).suggestedFilename(), /waybill-batch-.*\.xlsx/);
```

- [ ] **Step 2: Run the portal test to verify it fails**

Run: `node portal-smoke.test.js`

Expected: FAIL because the page has no `#waybillNumbers` element.

- [ ] **Step 3: Implement the smallest usable batch UI**

```html
<textarea id="waybillNumbers" rows="6" placeholder="每行一个单号，或用逗号分隔"></textarea>
<button type="submit">批量查询</button>
```

```js
const payload = await requestBatch(textarea.value);
currentBatch = payload.results;
renderBatchResults(currentBatch);
```

Render each result with `data-waybill` and `data-status`; only successful rows show business fields. Render `#downloadBatchExport` after a completed batch. Add responsive table/list CSS with no nested cards.

- [ ] **Step 4: Run the portal test to verify it passes**

Run: `node portal-smoke.test.js`

Expected: PASS, including mixed success/failure and batch download.

- [ ] **Step 5: Commit**

```bash
git add index.html script.js styles.css portal-smoke.test.js
git commit -m "feat: add batch waybill portal"
```

### Task 4: Real Read-Only User-Path Verification

**Files:**
- No source changes expected.

**Consumes:** Local loopback portal started with `LOOKUP_PROVIDER=new-wisdom` and the approved read-only credentials.

**Produces:** Verified browser-level evidence for a two-waybill batch and a relevant invalid-input state, without printing business details.

- [ ] **Step 1: Start a loopback-only service**

Run:

```powershell
$env:LOOKUP_PROVIDER='new-wisdom'
# Obtain NEXTSLS_USERNAME and NEXTSLS_PASSWORD from the approved local secret store.
$env:PORT='3000'
node server/server.js
```

Expected: logs `Waybill portal: http://127.0.0.1:3000`.

- [ ] **Step 2: Run browser-level success verification**

Use Playwright to paste `MO10068327` and `MO10084025`, wait until both rows are `found`, click the batch download, and assert an `.xlsx` filename. Log only pass/fail and waybill numbers.

- [ ] **Step 3: Run browser-level failure verification**

Use Playwright to paste 51 synthetic unique numbers and assert the page shows the 50-item validation error before any source query is issued.

- [ ] **Step 4: Run the complete automated suite**

Run:

```bash
node --test server/server-config.test.js server/batch-lookup-service.test.js server/lookup-service.test.js server/app.test.js server/export-service.test.js server/export-workbook.test.js server/providers/new-wisdom-provider.test.js
node portal-smoke.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit verification-safe documentation only if new documentation was added**

```bash
git status --short
```

Expected: no generated Excel files, screenshots, credentials, or customer source data are staged or committed.

## Self-Review

- Spec coverage: Tasks 1-3 implement input parsing, 50-item enforcement, per-item outcomes, fixed batch export rows, batch UI, and file-open validation. Task 4 covers the required real user-path success and failure checks.
- Placeholder scan: no TODO/TBD items. The verification command deliberately requires the approved local secret store rather than placing credentials in source control or the plan.
- Type consistency: the API consistently uses `waybillNumbers`, batch execution returns `results`, and export receives the same result objects.
