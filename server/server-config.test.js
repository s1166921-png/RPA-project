const assert = require("node:assert/strict");
const test = require("node:test");

const { getListenOptions } = require("./server-config");

test("binds the local prototype server to loopback by default", () => {
  assert.deepEqual(getListenOptions({}), { port: 3000, host: "127.0.0.1" });
});

test("allows an explicit port and host for a deployed environment", () => {
  assert.deepEqual(getListenOptions({ PORT: "3015", HOST: "0.0.0.0" }), { port: 3015, host: "0.0.0.0" });
});
