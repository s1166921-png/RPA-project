const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveInternalSourceConfig } = require("./internal-source-config");

test("uses the company API token for internal customer-service queries", () => {
  const source = resolveInternalSourceConfig({ INTERNAL_QUERY_SOURCE: "central-api", AUTH_REQUIRED: "true", CENTRAL_NEW_WISDOM_API_TOKEN: "secret" });
  assert.deepEqual(source, {
    mode: "central-api", enabled: true, accessToken: "secret", label: "新智慧公司级 API", reason: "ready"
  });
});

test("keeps RPA unavailable until an approved workflow is configured", () => {
  const source = resolveInternalSourceConfig({ INTERNAL_QUERY_SOURCE: "rpa" });
  assert.equal(source.enabled, false);
  assert.match(source.reason, /workflow/);
});

test("keeps the existing New Wisdom provider configuration compatible", () => {
  const source = resolveInternalSourceConfig({ LOOKUP_PROVIDER: "new-wisdom", AUTH_REQUIRED: "true", NEXTSLS_API_TOKEN: "legacy-secret" });
  assert.equal(source.mode, "central-api");
  assert.equal(source.accessToken, "legacy-secret");
});

test("does not enable a company-wide API without internal authentication", () => {
  const source = resolveInternalSourceConfig({ INTERNAL_QUERY_SOURCE: "central-api", CENTRAL_NEW_WISDOM_API_TOKEN: "secret" });
  assert.equal(source.enabled, false);
  assert.match(source.reason, /AUTH_REQUIRED/);
});

test("rejects unknown internal source modes", () => {
  assert.throws(() => resolveInternalSourceConfig({ INTERNAL_QUERY_SOURCE: "anything" }), /must be/);
});
