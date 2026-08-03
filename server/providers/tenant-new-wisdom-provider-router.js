const { createNewWisdomApiProvider } = require("./new-wisdom-api-provider");

function createUnavailableProvider() {
  return {
    async findByWaybill() {
      throw new Error("No New Wisdom API credential is configured for this tenant");
    }
  };
}

function createTenantNewWisdomProviderRouter({ tokensByTenant = {}, baseUrl, fetchImpl }) {
  const providers = new Map();
  const tokens = new Map(
    Object.entries(tokensByTenant)
      .map(([tenantId, token]) => [String(tenantId).trim(), String(token || "").trim()])
      .filter(([tenantId, token]) => tenantId && token)
  );

  return {
    forTenant(tenantId) {
      const normalizedTenantId = String(tenantId || "").trim();
      const token = tokens.get(normalizedTenantId);
      if (!token) return createUnavailableProvider();
      if (!providers.has(normalizedTenantId)) {
        providers.set(normalizedTenantId, createNewWisdomApiProvider({ accessToken: token, baseUrl, fetchImpl }));
      }
      return providers.get(normalizedTenantId);
    },
    configuredTenantIds() {
      return [...tokens.keys()].sort();
    }
  };
}

function loadTenantApiTokens(value = "{}") {
  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("TENANT_NEW_WISDOM_TOKENS_JSON must be an object");
  }
  return parsed;
}

module.exports = { createTenantNewWisdomProviderRouter, loadTenantApiTokens };
