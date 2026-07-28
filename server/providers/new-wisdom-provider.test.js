const assert = require("node:assert/strict");
const test = require("node:test");

const { buildSearchBody, createNewWisdomProvider } = require("./new-wisdom-provider");

test("matches the successful UI search by placing the number in keywords", () => {
  const body = buildSearchBody("MO10067690");
  assert.equal(body.keywords, "MO10067690");
  assert.equal(body.waybill_number, "");
  assert.equal(body.isActiveTab, "ready");
});

test("uses the read-only shipment list endpoint and closes the browser", async () => {
  const calls = [];
  let closed = false;
  const page = {
    async goto(url) { calls.push(["goto", url]); },
    locator() { return { async count() { return 0; }, async waitFor() { throw new Error("not on login page"); } }; },
    async evaluate(fn, payload) {
      calls.push(["evaluate", payload]);
      return { data: { components: { gridView: { table: { dataSource: [{ waybill_number: "MO10083334" }] } } } } };
    }
  };
  const provider = createNewWisdomProvider({
    username: "readonly",
    password: "secret",
    baseUrl: "http://example.test",
    browserFactory: async () => ({
      async newContext() { return { async newPage() { return page; }, async close() { closed = true; } }; },
      async close() {}
    })
  });

  const row = await provider.findByWaybill("MO10083334");
  assert.equal(row.waybill_number, "MO10083334");
  assert.equal(closed, true);
  assert.equal(calls[1][1].endpoint, "/rest/tms/csos/shipment/lists");
  assert.equal(calls[1][1].body.keywords, "MO10083334");
});

test("waits for a delayed login form before deciding the session is authenticated", async () => {
  let usernameFilled = "";
  let passwordFilled = "";
  let loginClicked = false;
  let loginReady = false;
  const page = {
    async goto() {},
    locator(selector) {
      if (selector === 'input[name="username"]') {
        return {
          async waitFor() { loginReady = true; },
          async count() { return loginReady ? 1 : 0; },
          async fill(value) { usernameFilled = value; }
        };
      }
      if (selector === 'input[name="password"]') return { async fill(value) { passwordFilled = value; } };
      if (selector === "button") return { filter() { return { async click() { loginClicked = true; } }; } };
      return { async waitFor() {} };
    },
    async waitForURL() {},
    async evaluate() { return { data: { components: { gridView: { table: { dataSource: [] } } } } }; }
  };
  const provider = createNewWisdomProvider({
    username: "readonly",
    password: "secret",
    browserFactory: async () => ({ async newContext() { return { async newPage() { return page; }, async close() {} }; }, async close() {} })
  });

  await provider.findByWaybill("MO10067690");

  assert.equal(usernameFilled, "readonly");
  assert.equal(passwordFilled, "secret");
  assert.equal(loginClicked, true);
});
