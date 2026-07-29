# Implementation Status

## Completed V1 nodes

- Read-only New Wisdom shipment adapter using the verified list endpoint.
- Batch waybill lookup with normalization, de-duplication, mixed outcomes, bounded concurrency, and short cache.
- Billing-weight confirmation workflow with fee/no-fee branches. No WeCom send and no label mutation.
- Shipment tracking workflow with current status, last route, route nodes, source, and query time.
- Per-waybill billing query workflow sourced from the standardized receivable field.
- Weight validation workflow for actual, volume, and chargeable-weight consistency checks.
- AI assistant with deterministic intent routing to fixed tools. It does not invent business data.
- Optional customer login with signed short-lived token and customer-code tenant isolation.
- Server-side export re-query, so submitted client result objects cannot define exported business values.
- Tenant-scoped workflow history with privacy-safe summaries.
- Privacy-safe source audit events with masked waybills and no raw source errors.
- Admin-only tenant mapping and operations overview for source customer and invoice-user scoping.
- Local SQLite persistence for tenant mappings and workflow-run summaries across service restarts.
- Month-level billing workflow and fixed Excel export with mandatory tenant invoice-user mappings.
- Async export center with tenant-scoped task status, download, and retry for month-billing files.
- Admin-only production source readiness check that validates the invoice template without exposing credentials or template contents.
- Persistent portal customer accounts managed by administrators, with hashed passwords and tenant/customer-code scope.
- Admin-only customer account enable/disable controls; disabled accounts cannot obtain new sessions and existing tokens are rejected on their next API request.
- Persistent audit summaries for authentication, workflow execution, export actions, and administrator configuration, without passwords, waybill numbers, bill contents, or raw source payloads.
- Fixed workflow registry now records approved inputs, data sources, validation rules, output types, and read-only status for each customer-visible capability.
- Tenant-scoped source snapshot metadata IDs on successful waybill and monthly-billing queries/exports; customer output contains only the ID, source, and query time, never raw third-party payloads.

## Runtime modes

- Default development mode keeps direct read-only lookup for local prototyping.
- Set `AUTH_REQUIRED=true`, `AUTH_TOKEN_SECRET`, and `PORTAL_USERS_JSON` before customer deployment.
- Keep New Wisdom credentials in environment or a secret manager. Never put them in source, browser code, or logs.

## Deferred nodes

- Confirm and configure the exact New Wisdom customer-bill request template before enabling production month billing. The adapter refuses unscoped queries.
- Migration from local SQLite to a shared production relational database and a durable multi-process job worker.
- Human-approved enterprise WeChat send, add-label, and remove-label workflows.
- Email ingestion, information reconciliation, weighing validation, and other V2/V3 workflows.
