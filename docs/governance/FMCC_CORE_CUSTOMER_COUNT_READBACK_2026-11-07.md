# Customer count readback — Command Core (2026-11-07)

## Confirmed defect
The Core API delegated every question to the cognitive planner, even simple "quantos clientes ativos temos hoje". The planner could select `subscription.active.count`, which is a different business concept. Its materialized table lacked a value despite current Kordena/IRON commercial snapshots being displayed in Sources. The existing Kordena summary capability also required explicit product scoping and there was no equivalent IRON core capability.

## Repair
A narrow deterministic read-only query path handles count questions about registered/active customers and academies before model planning. It queries the **same S2S commercial endpoints** used by Sources, with tenant/product/adapter checks, HTTPS allowlists, auth tokens and timeouts inherited from the connectors. For Kordena, `summary.customers` is **registered customers** only; it is never treated as active. For IRON, `summary.active_customers` is academies active. Other SaaS are marked unintegrated until their specific validated reader exists. It does not sum unique customers across products, conflate subscriptions with customers, invent zero counts or derive financial values.

## Limitations
This is not a company-wide identity-reconciled customer ledger. NFCore commercial is being worked on separately in PR #211; no unmerged changes were assumed. Other arbitrary questions still use the existing cognitive planner; no claim of universal accurate Core answers or of production validation is made. Live results require configured production S2S credentials. No secrets, financial mutations, database migrations or deploy changes.

## Tests
Question intent / negative subscription routing, per-product readback, missing vs zero, stale, invalid snapshot, tenant scopes, unknown sources, global partial answer and exact source evidence.
