# Workflow Authoring

New customer-facing capabilities must be added as fixed workflow definitions, not free-form AI actions.

Each workflow definition requires:

- `workflowId`: stable internal identifier.
- `requiredInputs`: the minimum fields needed before source access.
- `dataSources`: approved source adapters or cache layers only.
- `validationRules`: tenant scope and business-field checks.
- `outputTypes`: fixed portal, text, or export outputs.
- `readOnly`: must remain `true` until a separately approved write workflow exists.

To productize a new Word workflow document:

1. Extract every read-only query step, required field, decision branch, and fixed output.
2. Implement the source adapter and normalization behind a server-side permission check.
3. Add validation and output tests using safe fixture data.
4. Register the workflow definition and deterministic assistant intent.
5. Run customer success and failure paths before enabling it in the portal.

Enterprise WeChat sends, label addition, and label removal are write actions. They require a separate approval workflow and are not registered as customer-facing workflows.
