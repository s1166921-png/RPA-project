const { DatabaseSync } = require("node:sqlite");

function parseJson(value) {
  try { return JSON.parse(value); } catch { return []; }
}

function normalizeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean))];
}

function createSqliteStores(options = {}) {
  const db = new DatabaseSync(options.filename || ":memory:");
  const now = options.now || (() => Date.now());
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_mappings (
      tenant_id TEXT PRIMARY KEY,
      customer_codes TEXT NOT NULL,
      invoice_user_ids TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      input_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const mappingFromRow = (row) => row && ({
    tenantId: row.tenant_id,
    customerCodes: normalizeStrings(parseJson(row.customer_codes)),
    invoiceUserIds: normalizeStrings(parseJson(row.invoice_user_ids))
  });
  const getMapping = db.prepare("SELECT * FROM tenant_mappings WHERE tenant_id = ?");
  const listMappings = db.prepare("SELECT * FROM tenant_mappings ORDER BY tenant_id");
  const saveMapping = db.prepare(`
    INSERT INTO tenant_mappings (tenant_id, customer_codes, invoice_user_ids, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      customer_codes = excluded.customer_codes,
      invoice_user_ids = excluded.invoice_user_ids,
      updated_at = excluded.updated_at
  `);
  const saveRun = db.prepare("INSERT INTO workflow_runs (workflow_id, tenant_id, status, duration_ms, input_count, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const listRunsForTenant = db.prepare("SELECT workflow_id, tenant_id, status, duration_ms, input_count, created_at FROM workflow_runs WHERE tenant_id = ? ORDER BY id DESC LIMIT ?");
  const listRuns = db.prepare("SELECT workflow_id, tenant_id, status, duration_ms, input_count, created_at FROM workflow_runs ORDER BY id DESC LIMIT ?");
  const maxEntries = Number(options.maxEntries || 200);

  return {
    tenantMappings: {
      get(tenantId) { return mappingFromRow(getMapping.get(String(tenantId))); },
      list() { return listMappings.all().map(mappingFromRow); },
      upsert(tenantId, mapping) {
        const normalizedTenantId = String(tenantId || "").trim();
        if (!normalizedTenantId) throw new Error("tenantId is required");
        const customerCodes = normalizeStrings(mapping?.customerCodes);
        const invoiceUserIds = normalizeStrings(mapping?.invoiceUserIds);
        saveMapping.run(normalizedTenantId, JSON.stringify(customerCodes), JSON.stringify(invoiceUserIds), now());
        return { tenantId: normalizedTenantId, customerCodes, invoiceUserIds };
      }
    },
    runStore: {
      record(run) {
        saveRun.run(String(run.workflowId || "unknown"), String(run.tenantId || "public"), String(run.status || "unknown"), Number(run.durationMs || 0), Number(run.inputCount || 0), now());
      },
      list(tenantId) {
        const rows = tenantId ? listRunsForTenant.all(String(tenantId), maxEntries) : listRuns.all(maxEntries);
        return rows.map((row) => ({
          workflowId: row.workflow_id,
          tenantId: row.tenant_id,
          status: row.status,
          durationMs: row.duration_ms,
          inputCount: row.input_count,
          createdAt: row.created_at
        }));
      }
    },
    close() { db.close(); }
  };
}

module.exports = { createSqliteStores };
