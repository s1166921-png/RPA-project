# Direct Waybill API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simple no-login page that looks up one waybill through a protected server API and renders structured source data.

**Architecture:** A Node HTTP server serves the static page and `POST /api/shipments/lookup`. A lookup service validates input and delegates to a provider. The default provider uses deterministic sample data; an optional New Wisdom provider performs a read-only lookup only when explicitly enabled by server environment variables.

**Tech Stack:** Node.js built-in `http` and `fs`, Playwright, browser JavaScript, Node test runner.

## Global Constraints

- Never place New Wisdom credentials, cookies, raw responses, or client data in browser code, Git, fixtures, or logs.
- Default provider is local sample data; production lookup is enabled only by server environment variables.
- New Wisdom integration is read-only: no export, messaging, label mutation, or shipment modification.
- Return `404` for no result and `502` for provider failures; never invent shipment status, weight, or fees.

---

### Task 1: Add lookup domain and contract tests

**Files:**
- Create: `server/lookup-service.js`
- Create: `server/providers/sample-provider.js`
- Create: `server/lookup-service.test.js`

**Interfaces:** `lookupWaybill(input, provider, now)` and provider method `findByWaybill(waybillNumber)`.

- [ ] Write failing tests for found, blank, missing, and provider-error outcomes.

```js
const result = await lookupWaybill({ waybillNumber: 'MO10083334' }, provider, fixedNow);
assert.equal(result.status, 'found');
assert.equal(result.shipment.waybillNumber, 'MO10083334');
```

- [ ] Run `node --test server/lookup-service.test.js` and verify it fails because the module is absent.
- [ ] Implement the minimal validation, provider delegation, standardization, and sample provider.
- [ ] Run `node --test server/lookup-service.test.js` and verify it passes.
- [ ] Commit `feat: add waybill lookup service`.

### Task 2: Expose the HTTP API and test its boundaries

**Files:**
- Create: `server/app.js`
- Create: `server/server.js`
- Create: `server/app.test.js`

**Interfaces:** `createServer({ provider, staticRoot })` serves `POST /api/shipments/lookup`.

- [ ] Write failing API tests for 200 found, 400 blank, 404 missing, and 502 source failure.

```js
const response = await request(server, 'POST', '/api/shipments/lookup', { waybillNumber: 'MO10083334' });
assert.equal(response.status, 200);
assert.equal(response.body.status, 'found');
```

- [ ] Run `node --test server/app.test.js` and verify it fails because the module is absent.
- [ ] Implement built-in Node JSON routing and static serving with no-store API responses.
- [ ] Run `node --test server/app.test.js` and verify it passes.
- [ ] Commit `feat: expose waybill lookup API`.

### Task 3: Add an optional read-only New Wisdom provider

**Files:**
- Create: `server/providers/new-wisdom-provider.js`
- Create: `server/providers/new-wisdom-provider.test.js`
- Create: `.env.example`
- Modify: `server/server.js`

**Interfaces:** `createNewWisdomProvider({ username, password, baseUrl, browserFactory })` reads only `waybill_number` through the verified list endpoint.

- [ ] Write a failing provider test with a fake browser context; assert it posts only to `/rest/tms/csos/shipment/lists` and closes the context.
- [ ] Run `node --test server/providers/new-wisdom-provider.test.js` and verify it fails because the provider is absent.
- [ ] Implement isolated read-only Playwright lookup, enabled only by `LOOKUP_PROVIDER=new-wisdom` plus `NEXTSLS_USERNAME` and `NEXTSLS_PASSWORD`.
- [ ] Run `node --test server/providers/new-wisdom-provider.test.js` and verify it passes.
- [ ] Commit `feat: add read-only new wisdom provider`.

### Task 4: Replace the demo login flow with direct lookup UI

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `script.js`
- Modify: `portal-smoke.test.js`

**Interfaces:** Browser calls `POST /api/shipments/lookup`; result states are found, invalid input, missing, and source unavailable.

- [ ] Write a failing browser test for an entered waybill and for blank and unknown numbers.

```js
await page.locator('#waybillNumber').fill('MO10083334');
await page.locator('#lookupForm button').click();
await expectText(page, '#lookupResult', 'MO10083334');
```

- [ ] Run `node portal-smoke.test.js` and verify it fails because the direct lookup form does not exist.
- [ ] Implement one input, one query action, compact structured result, source label, query time, and safe `textContent` rendering.
- [ ] Run `node portal-smoke.test.js` and verify it passes.
- [ ] Commit `feat: add direct waybill lookup page`.

### Task 5: Final verification and documentation

**Files:**
- Create: `README.md`
- Modify: `docs/direct-waybill-api-design.md`

- [ ] Document `node server/server.js`, sample default behavior, required live-provider variables, and the read-only restriction.
- [ ] Run `node --test server/*.test.js server/providers/*.test.js` and `node portal-smoke.test.js`.
- [ ] Commit `docs: document direct waybill lookup`.
