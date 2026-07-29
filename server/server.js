const path = require("node:path");
const { createServer } = require("./app");
const { createSampleProvider } = require("./providers/sample-provider");
const { createNewWisdomProvider } = require("./providers/new-wisdom-provider");
const { createCachedProvider } = require("./provider-cache");
const { createAuthService, loadUsers } = require("./auth-service");
const { createAuditedProvider } = require("./audit-log");
const { createWorkflowRunStore } = require("./workflow-run-store");
const { createTenantMappingStore, loadTenantMappings } = require("./tenant-mapping-store");
const { getListenOptions } = require("./server-config");

const { port, host } = getListenOptions();
const useNewWisdom = process.env.LOOKUP_PROVIDER === "new-wisdom";
const requireAuth = process.env.AUTH_REQUIRED === "true";
const sourceProvider = useNewWisdom
  ? createNewWisdomProvider({
      username: process.env.NEXTSLS_USERNAME,
      password: process.env.NEXTSLS_PASSWORD,
      browserFactory: async () => (await require("playwright")).chromium.launch({ headless: true })
    })
  : createSampleProvider();
const auditedProvider = createAuditedProvider(sourceProvider, {
  sink: process.env.AUDIT_LOG === "console" ? (event) => console.log(JSON.stringify(event)) : undefined
});
const provider = createCachedProvider(auditedProvider, {
  ttlMs: Number(process.env.LOOKUP_CACHE_TTL_MS || 30_000),
  maxEntries: Number(process.env.LOOKUP_CACHE_MAX_ENTRIES || 1_000)
});
const runStore = createWorkflowRunStore();
const tenantMappings = createTenantMappingStore(loadTenantMappings(process.env.TENANT_MAPPINGS_JSON || "[]"));
const auth = requireAuth
  ? createAuthService({
      secret: process.env.AUTH_TOKEN_SECRET,
      users: loadUsers(process.env.PORTAL_USERS_JSON || "[]")
    })
  : null;
const server = createServer({ provider, auth, requireAuth, runStore, tenantMappings, staticRoot: path.resolve(__dirname, "..") });
server.listen(port, host, () => console.log(`Waybill portal: http://${host}:${port}`));
