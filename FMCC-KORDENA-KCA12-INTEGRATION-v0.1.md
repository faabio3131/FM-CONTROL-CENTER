# FMCC — Kordena Commercial Control Plane — KCA-12

Status: IN PROGRESS / NOT CERTIFIED.

Base: `main` @ `9632dd3871790a8b709fa5bc11211b9649b943fa`.

## Architectural reconciliation

The FM Control Center owns its Vertical Cognitive Core. Historical Kordena
cross-product FMCC Core artifacts are not restored.

KCA-12 integrates Kordena through governed HTTP contracts and the existing FMCC
Integration Fabric. FMCC must not read or write the Kordena database directly.

## Scope

- Kordena commercial source connector;
- health and pull synchronization through ConnectorRuntime;
- secret-by-reference;
- canonical facts/provenance;
- governed Kordena commercial read surface;
- owner/admin password reauthentication before commercial mutation;
- server-to-server command forwarding to Kordena canonical Commercial Platform;
- tenant isolation, RBAC and audit.

KCA-G12 remains open until exact-head tests/CI and cross-repository evidence are
green.


## Runtime contract

The Kordena connector is fail-closed unless all of these controls are present:

- `FMCC_KORDENA_CONTROL_TENANT_ID`: the single internal FMCC tenant allowed to
  consume or administer the Kordena commercial source;
- `FMCC_KORDENA_ALLOWED_ORIGINS`: comma-separated HTTPS origins accepted for
  Kordena server-to-server calls;
- `FMCC_KORDENA_CONTROL_PLANE_TOKEN`: dedicated secret value resolved only by
  the source reference `env:FMCC_KORDENA_CONTROL_PLANE_TOKEN`.

The Kordena runtime must receive the same secret value through its own
`FM_AI_FMCC_CONTROL_PLANE_TOKEN` configuration. The secret itself is never
stored in source configuration, browser state, repository files or audit
metadata.

## Security invariants

- a source owned by another FMCC tenant is denied;
- even a tenant-owned source is denied unless the current tenant equals the
  configured internal control tenant;
- insecure or non-allowlisted origins are denied before the service token is
  sent;
- unrelated environment secret references are denied;
- commercial writes require `commercial:write`, owner/admin role and fresh
  password reauthentication;
- publish operations require canonical preview/diff before the UI enables
  confirmation;
- Kordena remains the mutation authority: FMCC forwards commands to
  `AplicacaoCatalogoComercialV1` and never writes Kordena tables directly.
