function maskWaybill(value) {
  const waybill = String(value || "").trim().toUpperCase();
  if (waybill.length <= 4) return "***";
  return `${waybill.slice(0, 2)}***${waybill.slice(-2)}`;
}

function createAuditedProvider(provider, options = {}) {
  const sink = typeof options.sink === "function" ? options.sink : () => {};
  const now = options.now || (() => Date.now());
  return {
    async findByWaybill(waybillNumber) {
      const started = now();
      const base = { action: "source_lookup", waybill: maskWaybill(waybillNumber) };
      try {
        const row = await provider.findByWaybill(waybillNumber);
        sink({ ...base, outcome: row ? "found" : "not_found", durationMs: now() - started });
        return row;
      } catch (error) {
        sink({ ...base, outcome: "error", durationMs: now() - started });
        throw error;
      }
    }
  };
}

module.exports = { createAuditedProvider, maskWaybill };
