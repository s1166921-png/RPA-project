function normalizeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeMapping(tenantId, mapping) {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId) throw new Error("tenantId is required");
  return {
    tenantId: normalizedTenantId,
    customerCodes: normalizeStrings(mapping?.customerCodes),
    invoiceUserIds: normalizeStrings(mapping?.invoiceUserIds)
  };
}

function copy(mapping) {
  return mapping ? { ...mapping, customerCodes: [...mapping.customerCodes], invoiceUserIds: [...mapping.invoiceUserIds] } : null;
}

function createTenantMappingStore(initial = []) {
  const mappings = new Map();
  initial.forEach((mapping) => mappings.set(String(mapping.tenantId), normalizeMapping(mapping.tenantId, mapping)));
  return {
    get(tenantId) {
      return copy(mappings.get(String(tenantId)));
    },
    list() {
      return [...mappings.values()].map(copy).sort((a, b) => a.tenantId.localeCompare(b.tenantId));
    },
    upsert(tenantId, mapping) {
      const normalized = normalizeMapping(tenantId, mapping);
      mappings.set(normalized.tenantId, normalized);
      return copy(normalized);
    }
  };
}

function loadTenantMappings(value = "[]") {
  const mappings = JSON.parse(value);
  if (!Array.isArray(mappings)) throw new Error("TENANT_MAPPINGS_JSON must be an array");
  return mappings;
}

module.exports = { createTenantMappingStore, loadTenantMappings };
