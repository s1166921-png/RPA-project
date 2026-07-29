const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("./app");
const { createSampleProvider } = require("./providers/sample-provider");
const { createSampleInvoiceProvider } = require("./providers/sample-invoice-provider");
const { createNewWisdomInvoiceProvider } = require("./providers/new-wisdom-invoice-provider");
const { createNewWisdomProvider } = require("./providers/new-wisdom-provider");
const { createCachedProvider } = require("./provider-cache");
const { createAuthService, loadUsers } = require("./auth-service");
const { createAuditedProvider } = require("./audit-log");
const { loadTenantMappings } = require("./tenant-mapping-store");
const { createSqliteStores } = require("./sqlite-stores");
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
const invoiceRequestTemplate = process.env.NEW_WISDOM_INVOICE_REQUEST_TEMPLATE
  ? JSON.parse(process.env.NEW_WISDOM_INVOICE_REQUEST_TEMPLATE)
  : null;
const invoiceProvider = useNewWisdom && invoiceRequestTemplate
  ? createNewWisdomInvoiceProvider({
      username: process.env.NEXTSLS_USERNAME,
      password: process.env.NEXTSLS_PASSWORD,
      requestTemplate: invoiceRequestTemplate,
      browserFactory: async () => (await require("playwright")).chromium.launch({ headless: true })
    })
  : useNewWisdom ? null : createSampleInvoiceProvider();
const databasePath = process.env.PORTAL_DB_PATH || path.resolve(__dirname, "..", "data", "portal.sqlite");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const stores = createSqliteStores({ filename: databasePath });
loadTenantMappings(process.env.TENANT_MAPPINGS_JSON || "[]").forEach((mapping) => {
  if (!stores.tenantMappings.get(mapping.tenantId)) {
    stores.tenantMappings.upsert(mapping.tenantId, mapping);
  }
});
const { runStore, tenantMappings } = stores;
const auth = requireAuth
  ? createAuthService({
      secret: process.env.AUTH_TOKEN_SECRET,
      users: loadUsers(process.env.PORTAL_USERS_JSON || "[]")
    })
  : null;
const server = createServer({ provider, invoiceProvider, auth, requireAuth, runStore, tenantMappings, staticRoot: path.resolve(__dirname, "..") });
server.once("close", () => stores.close());
server.listen(port, host, () => console.log(`Waybill portal: http://${host}:${port}`));
