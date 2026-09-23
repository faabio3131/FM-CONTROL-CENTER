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
