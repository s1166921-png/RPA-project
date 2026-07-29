const assert = require("node:assert/strict");
const test = require("node:test");
const { createAuthService, hashPassword } = require("./auth-service");

function makeAuth() {
  return createAuthService({
    secret: "test-secret",
    ttlMs: 60_000,
    users: [{
      username: "client-a",
      passwordHash: hashPassword("pass-a"),
      tenantId: "tenant-a",
      allowedCustomerCodes: ["CUST-A"]
    }]
  });
}

test("logs in and returns a token without password data", () => {
  const auth = makeAuth();
  const result = auth.login("client-a", "pass-a");
  assert.equal(result.user.tenantId, "tenant-a");
  assert.deepEqual(result.user.allowedCustomerCodes, ["CUST-A"]);
  assert.ok(result.token);
  assert.equal(Object.hasOwn(result.user, "passwordHash"), false);
  assert.deepEqual(auth.verify(result.token).username, "client-a");
});

test("rejects an invalid password", () => {
  const auth = makeAuth();
  assert.equal(auth.login("client-a", "wrong"), null);
});

test("checks shipment customer scope from the verified identity", () => {
  const auth = makeAuth();
  const token = auth.login("client-a", "pass-a").token;
  const user = auth.verify(token);
  assert.equal(auth.canAccess(user, { customerCode: "CUST-A" }), true);
  assert.equal(auth.canAccess(user, { customerCode: "CUST-B" }), false);
  assert.equal(auth.canAccess(user, { customerCode: "" }), false);
});

test("recognizes an explicitly configured administrator", () => {
  const auth = createAuthService({
    secret: "test-secret",
    users: [{ username: "admin", passwordHash: hashPassword("admin-pass"), tenantId: "operations", role: "admin", allowedCustomerCodes: [] }]
  });
  assert.equal(auth.isAdmin(auth.verify(auth.login("admin", "admin-pass").token)), true);
});
