const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");

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
    CREATE TABLE IF NOT EXISTS export_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      export_type TEXT NOT NULL,
      status TEXT NOT NULL,
      request_json TEXT NOT NULL,
      filename TEXT,
      file BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL,
      allowed_customer_codes TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      source TEXT NOT NULL,
      query_type TEXT NOT NULL,
      queried_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
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
  const createExportTask = db.prepare("INSERT INTO export_tasks (id, tenant_id, export_type, status, request_json, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?, ?)");
  const completeExportTask = db.prepare("UPDATE export_tasks SET status = 'completed', filename = ?, file = ?, updated_at = ? WHERE id = ? AND status IN ('queued', 'processing')");
  const failExportTask = db.prepare("UPDATE export_tasks SET status = 'failed', updated_at = ? WHERE id = ? AND status IN ('queued', 'processing')");
  const retryExportTask = db.prepare("UPDATE export_tasks SET status = 'queued', filename = NULL, file = NULL, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'failed'");
  const listExportTasks = db.prepare("SELECT id, tenant_id, export_type, status, filename, created_at, updated_at FROM export_tasks WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?");
  const getExportTask = db.prepare("SELECT id, tenant_id, export_type, status, request_json, filename, created_at, updated_at FROM export_tasks WHERE tenant_id = ? AND id = ?");
  const downloadExportTask = db.prepare("SELECT filename, file FROM export_tasks WHERE tenant_id = ? AND id = ? AND status = 'completed'");
  const getPortalUser = db.prepare("SELECT * FROM portal_users WHERE username = ?");
  const listPortalUsers = db.prepare("SELECT username, tenant_id, role, allowed_customer_codes, enabled FROM portal_users ORDER BY username");
  const savePortalUser = db.prepare(`
    INSERT INTO portal_users (username, password_hash, tenant_id, role, allowed_customer_codes, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      tenant_id = excluded.tenant_id,
      role = excluded.role,
      allowed_customer_codes = excluded.allowed_customer_codes,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `);
  const createSourceSnapshot = db.prepare("INSERT INTO source_snapshots (id, tenant_id, source, query_type, queried_at) VALUES (?, ?, ?, ?, ?)");
  const listSourceSnapshots = db.prepare("SELECT id, source, query_type, queried_at FROM source_snapshots WHERE tenant_id = ? ORDER BY queried_at DESC LIMIT ?");
  const createAuditLog = db.prepare("INSERT INTO audit_logs (tenant_id, actor_username, action, outcome, created_at) VALUES (?, ?, ?, ?, ?)");
  const listAuditLogs = db.prepare("SELECT tenant_id, actor_username, action, outcome, created_at FROM audit_logs ORDER BY id DESC LIMIT ?");
  const maxEntries = Number(options.maxEntries || 200);
  const newId = options.newId || crypto.randomUUID;

  const publicExportTask = (row) => row && ({
    id: row.id,
    tenantId: row.tenant_id,
    exportType: row.export_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.filename ? { filename: row.filename } : {})
  });
  const userFromRow = (row, includePasswordHash = false) => row && ({
    username: row.username,
    ...(includePasswordHash ? { passwordHash: row.password_hash } : {}),
    tenantId: row.tenant_id,
    role: row.role === "admin" ? "admin" : "customer",
    allowedCustomerCodes: normalizeStrings(parseJson(row.allowed_customer_codes)),
    enabled: Boolean(row.enabled)
  });

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
    exportTasks: {
      create({ tenantId, exportType, request = {} }) {
        const id = String(newId());
        const normalizedTenantId = String(tenantId || "").trim();
        const normalizedExportType = String(exportType || "").trim();
        if (!normalizedTenantId || !normalizedExportType) throw new Error("tenantId and exportType are required");
        const timestamp = now();
        createExportTask.run(id, normalizedTenantId, normalizedExportType, JSON.stringify(request), timestamp, timestamp);
        return { id, tenantId: normalizedTenantId, exportType: normalizedExportType, status: "queued", createdAt: timestamp, updatedAt: timestamp };
      },
      complete(id, { filename, file }) {
        completeExportTask.run(String(filename || "export.xlsx"), Buffer.from(file || []), now(), String(id));
      },
      fail(id) {
        failExportTask.run(now(), String(id));
      },
      retry(tenantId, id) {
        const result = retryExportTask.run(now(), String(tenantId), String(id));
        if (!result.changes) return null;
        const row = getExportTask.get(String(tenantId), String(id));
        return row ? { task: publicExportTask(row), request: parseJson(row.request_json) } : null;
      },
      list(tenantId) {
        return listExportTasks.all(String(tenantId), maxEntries).map(publicExportTask);
      },
      download(tenantId, id) {
        const row = downloadExportTask.get(String(tenantId), String(id));
        return row ? { filename: row.filename, file: Buffer.from(row.file) } : null;
      }
    },
    portalUsers: {
      get(username) {
        return userFromRow(getPortalUser.get(String(username)), true);
      },
      list() {
        return listPortalUsers.all().map((row) => userFromRow(row));
      },
      upsert(user) {
        const username = String(user?.username || "").trim();
        const passwordHash = String(user?.passwordHash || "").trim();
        const tenantId = String(user?.tenantId || "").trim();
        if (!username || !passwordHash || !tenantId) throw new Error("username, passwordHash, and tenantId are required");
        const role = user.role === "admin" ? "admin" : "customer";
        const allowedCustomerCodes = normalizeStrings(user.allowedCustomerCodes);
        const enabled = user.enabled !== false;
        savePortalUser.run(username, passwordHash, tenantId, role, JSON.stringify(allowedCustomerCodes), enabled ? 1 : 0, now());
        return { username, passwordHash, tenantId, role, allowedCustomerCodes, enabled };
      }
    },
    sourceSnapshots: {
      create({ tenantId, source, queryType }) {
        const id = String(newId());
        const normalizedTenantId = String(tenantId || "public").trim() || "public";
        const queriedAt = now();
        createSourceSnapshot.run(id, normalizedTenantId, String(source || "unknown"), String(queryType || "unknown"), queriedAt);
        return { id, source: String(source || "unknown"), queryType: String(queryType || "unknown"), queriedAt };
      },
      list(tenantId) {
        return listSourceSnapshots.all(String(tenantId || "public"), maxEntries).map((row) => ({
          id: row.id,
          source: row.source,
          queryType: row.query_type,
          queriedAt: row.queried_at
        }));
      }
    },
    auditLogs: {
      record(entry) {
        createAuditLog.run(
          String(entry?.tenantId || "public"),
          String(entry?.actorUsername || "anonymous"),
          String(entry?.action || "unknown"),
          String(entry?.outcome || "unknown"),
          now()
        );
      },
      list() {
        return listAuditLogs.all(maxEntries).map((row) => ({
          tenantId: row.tenant_id,
          actorUsername: row.actor_username,
          action: row.action,
          outcome: row.outcome,
          createdAt: row.created_at
        }));
      }
    },
    close() { db.close(); }
  };
}

module.exports = { createSqliteStores };
