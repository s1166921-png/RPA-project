# Deployment Checklist

## Required production settings

- Run with `AUTH_REQUIRED=true` and a long, unique `AUTH_TOKEN_SECRET` from the secret manager.
- Set `PORTAL_DB_PATH` to durable storage. Back up the SQLite file before upgrades.
- Create customer accounts through the administrator portal; never store cleartext customer passwords in source or environment files.
- For the internal service/operations query tool, set `INTERNAL_QUERY_SOURCE=central-api` and supply `CENTRAL_NEW_WISDOM_API_TOKEN` through the deployment secret manager. This must be an authorized company-level Bearer API key that can read the intended customer shipments; do not use a browser password.
- Set `INTERNAL_QUERY_SOURCE=rpa` only after a separately approved, read-only New Wisdom browser workflow has been implemented. Until then, the system returns a clear data-source-unavailable status rather than attempting browser automation.
- For customer self-service with tenant isolation, set `AUTH_REQUIRED=true` and provide `TENANT_NEW_WISDOM_TOKENS_JSON` through the secret manager, for example `{"tenant-a":"<customer-a-key>"}`. The map is server-only; do not commit it or expose it to the browser. A logged-in tenant with no mapped Key is denied access to the New Wisdom source rather than falling back to another customer's Key.
- Optionally set `NEXTSLS_API_BASE_URL` when New Wisdom provides a non-production API environment. The default is `https://moyckj.nextsls.com/api/v5`.
- Set customer-code and invoice-user mappings before allowing customer access.
- Keep `PORTAL_REQUEST_LIMIT` and `PORTAL_REQUEST_WINDOW_MS` configured for the upstream platform capacity.

## Readiness checks

- `GET /api/health` must return `{ "status": "ok" }`.
- An administrator must confirm the source readiness status before offering monthly billing.
- The New Wisdom monthly-billing request template must be verified with a tenant-scoped, paginated read-only test before `NEW_WISDOM_INVOICE_REQUEST_TEMPLATE` is set.
- Test one authorized customer query and one cross-tenant query before rollout.

## Write-action boundary

This deployment supports only read-only source access. Enterprise WeChat sending, add-label, and remove-label actions are intentionally excluded. They require a separately approved workflow, explicit operator confirmation, and an audit trail before implementation.
