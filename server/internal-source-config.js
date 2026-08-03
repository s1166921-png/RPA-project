function resolveInternalSourceConfig(env = {}) {
  const mode = String(env.INTERNAL_QUERY_SOURCE || (env.LOOKUP_PROVIDER === "new-wisdom" ? "central-api" : "sample")).trim();
  if (!["sample", "central-api", "rpa"].includes(mode)) {
    throw new Error("INTERNAL_QUERY_SOURCE must be sample, central-api, or rpa");
  }
  if (mode === "central-api") {
    const accessToken = String(env.CENTRAL_NEW_WISDOM_API_TOKEN || env.NEXTSLS_API_TOKEN || "").trim();
    return {
      mode,
      enabled: Boolean(accessToken),
      accessToken,
      label: "新智慧公司级 API",
      reason: accessToken ? "ready" : "CENTRAL_NEW_WISDOM_API_TOKEN is not configured"
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
