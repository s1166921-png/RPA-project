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

## Runtime modes

- Default development mode keeps direct read-only lookup for local prototyping.
- Set `AUTH_REQUIRED=true`, `AUTH_TOKEN_SECRET`, and `PORTAL_USERS_JSON` before customer deployment.
- Keep New Wisdom credentials in environment or a secret manager. Never put them in source, browser code, or logs.

## Deferred nodes

- Month-level bill workflow using the verified customer-bill endpoint and configured invoice-user mappings.
- Operations console for customer mappings, sync retries, and export task management.
- Human-approved enterprise WeChat send, add-label, and remove-label workflows.
- Email ingestion, information reconciliation, weighing validation, and other V2/V3 workflows.
