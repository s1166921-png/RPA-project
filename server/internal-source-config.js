function resolveInternalSourceConfig(env = {}) {
  const mode = String(env.INTERNAL_QUERY_SOURCE || (env.LOOKUP_PROVIDER === "new-wisdom" ? "central-api" : "sample")).trim();
  if (!["sample", "central-api", "rpa"].includes(mode)) {
    throw new Error("INTERNAL_QUERY_SOURCE must be sample, central-api, or rpa");
  }
  if (mode === "central-api") {
    const accessToken = String(env.CENTRAL_NEW_WISDOM_API_TOKEN || env.NEXTSLS_API_TOKEN || "").trim();
    const authenticationRequired = env.AUTH_REQUIRED === "true";
    const allowUnauthenticatedDemo = env.ALLOW_UNAUTHENTICATED_INTERNAL_QUERY === "true";
    const enabled = Boolean(accessToken) && (authenticationRequired || allowUnauthenticatedDemo);
    return {
      mode,
      enabled,
      accessToken: enabled ? accessToken : "",
      label: "新智慧公司级 API",
      reason: !accessToken
        ? "CENTRAL_NEW_WISDOM_API_TOKEN is not configured"
        : authenticationRequired || allowUnauthenticatedDemo
        ? "ready"
        : "AUTH_REQUIRED=true is required for the company API"
    };
  }
  if (mode === "rpa") {
    return {
      mode,
      enabled: false,
      accessToken: "",
      label: "新智慧只读 RPA",
      reason: "RPA workflow has not been configured"
    };
  }
  return { mode, enabled: true, accessToken: "", label: "演示数据", reason: "sample_mode" };
}

function createUnavailableProvider(reason) {
  return {
    async findByWaybill() {
      throw new Error(reason);
    }
  };
}

module.exports = { resolveInternalSourceConfig, createUnavailableProvider };
