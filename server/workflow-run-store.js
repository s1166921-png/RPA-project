function createWorkflowRunStore(options = {}) {
  const now = options.now || (() => Date.now());
  const maxEntries = Number(options.maxEntries || 200);
  const entries = [];

  return {
    record(run) {
      entries.push({
        workflowId: String(run.workflowId || "unknown"),
        tenantId: String(run.tenantId || "public"),
        status: String(run.status || "unknown"),
        durationMs: Number(run.durationMs || 0),
        inputCount: Number(run.inputCount || 0),
        createdAt: now()
      });
      while (entries.length > maxEntries) entries.shift();
    },
    list(tenantId) {
      return entries
        .filter((run) => !tenantId || run.tenantId === tenantId)
        .slice()
        .reverse();
    }
  };
}

module.exports = { createWorkflowRunStore };
