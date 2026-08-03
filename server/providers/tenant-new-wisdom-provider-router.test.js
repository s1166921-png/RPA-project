const assert = require("node:assert/strict");
const test = require("node:test");
const { createTenantNewWisdomProviderRouter, loadTenantApiTokens } = require("./tenant-new-wisdom-provider-router");

test("selects only the credential configured for the requested tenant", async () => {
  const authorizations = [];
  const router = createTenantNewWisdomProviderRouter({
    tokensByTenant: { "tenant-a": "token-a", "tenant-b": "token-b" },
    baseUrl: "https://api.example.test/api/v5",
    fetchImpl: async (_url, options) => {
      authorizations.push(options.headers.authorization);
      return { ok: true, async json() { return { status: 1, data: {} }; } };
    }
  });

  await router.forTenant("tenant-a").findByWaybill("MO-1");
  await router.forTenant("tenant-b").findByWaybill("MO-2");
  assert.deepEqual(authorizations, ["Bearer token-a", "Bearer token-a", "Bearer token-a", "Bearer token-b", "Bearer token-b", "Bearer token-b"]);
  await assert.rejects(router.forTenant("tenant-c").findByWaybill("MO-3"), /credential/);
  assert.deepEqual(router.configuredTenantIds(), ["tenant-a", "tenant-b"]);
});

test("loads a tenant token map only from an object", () => {
  assert.deepEqual(loadTenantApiTokens('{"tenant-a":"token-a"}'), { "tenant-a": "token-a" });
  assert.throws(() => loadTenantApiTokens("[]"), /must be an object/);
});
