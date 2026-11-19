import type { ProductRepository } from "@/domain/products/contracts";
import type { SourceDefinition, SourceRepository } from "@/domain/integration/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import { sourceMatchesAdapter, profileForSourceType } from "@/application/integration/saas-adapter-profiles";
import {
  IRON_COMMERCIAL_SOURCE_TYPE,
  IronCommercialConnector,
  type IronCommercialSnapshot,
} from "@/infrastructure/integration/iron-commercial-connector";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SOURCE_ROWS = 10000;
const PAGE_SIZE = 50;
type Obj = Record<string, unknown>;

export interface IronTrialAcademy {
  gymId: string;
  academyName: string;
  registeredAt: string;
  startedAt: string;
  endsAt: string;
  trialStatus: "active" | "expired";
  subscriptionStatus: "ACTIVE" | "SUSPENDED" | "CANCELED";
  planCode: string;
}
export type IronTrialPortfolio =
  | { state: "not_applicable" }
  | { state: "unavailable" }
  | {
      state: "ready";
      sourceAuthority: "IRON_CANONICAL";
      asOf: string;
      sourceId: string;
      total: number;
      registeredAcademies: number;
      activeTrialCount: number;
      expiredTrialCount: number;
      page: number;
      pages: number;
      academies: IronTrialAcademy[];
    };

function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("iron.trial_source_invalid");
  return value as Obj;
}
function entries(value: unknown): Obj[] {
  if (!Array.isArray(value) || value.length > MAX_SOURCE_ROWS) throw Error("iron.trial_source_invalid");
  return value.map(object);
}
function text(value: unknown, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw Error("iron.trial_source_invalid");
  return value;
}
function id(value: unknown): string {
  const result = text(value, 36);
  if (!UUID.test(result)) throw Error("iron.trial_source_invalid");
  return result;
}
function date(value: unknown): string {
  const v = text(value, 48);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v))) throw Error("iron.trial_source_invalid");
  return v;
}

/** Project, do not persist: the IRON's tenant/trial/subscription remain authoritative. */
export function projectIronTrialPortfolio(snapshot: unknown, sourceId: string, page = 1): Extract<IronTrialPortfolio, { state: "ready" }> {
  const raw = object(snapshot);
  if (raw.schema_version !== "iron.fmcc.commercial.v1" || raw.product_code !== "IRON_FIT_CORE") throw Error("iron.trial_source_invalid");
  const coverage = object(raw.coverage);
  if (coverage.tenant !== "IRON_CANONICAL" || coverage.trial !== "IRON_CANONICAL") throw Error("iron.trial_source_invalid");
  const asOf = date(raw.as_of);
  const customers = new Map<string, { name: string; registeredAt: string }>();
  for (const item of entries(raw.customers)) {
    const gymId = id(item.tenant_id);
    if (customers.has(gymId) || typeof item.active !== "boolean") throw Error("iron.trial_source_invalid");
    customers.set(gymId, { name: text(item.name), registeredAt: date(item.created_at) });
  }
  const subscriptions = new Map<string, { gymId: string; status: IronTrialAcademy["subscriptionStatus"]; planCode: string }>();
  for (const item of entries(raw.subscriptions)) {
    const subId = id(item.external_id);
    if (subscriptions.has(subId) || !["ACTIVE", "SUSPENDED", "CANCELED"].includes(String(item.status))) throw Error("iron.trial_source_invalid");
    subscriptions.set(subId, {
      gymId: id(item.tenant_id),
      status: item.status as IronTrialAcademy["subscriptionStatus"],
      planCode: text(item.plan_code, 64),
    });
  }
  const seen = new Set<string>();
  const academies: IronTrialAcademy[] = entries(raw.trials).map((item) => {
    const trialId = text(item.external_id);
    const gymId = id(item.tenant_id);
    const trialStatus = item.status;
    const customer = customers.get(gymId);
    const subscription = subscriptions.get(id(item.subscription_id));
    if (seen.has(trialId) || !customer || !subscription || subscription.gymId !== gymId ||
        (trialStatus !== "active" && trialStatus !== "expired")) throw Error("iron.trial_source_invalid");
    seen.add(trialId);
    const startedAt = date(item.started_at);
    const endsAt = date(item.ends_at);
    if (Date.parse(endsAt) <= Date.parse(startedAt)) throw Error("iron.trial_source_invalid");
    return {
      gymId, academyName: customer.name, registeredAt: customer.registeredAt,
      startedAt, endsAt, trialStatus, subscriptionStatus: subscription.status, planCode: subscription.planCode,
    };
  });
  academies.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.gymId.localeCompare(b.gymId));
  const pages = Math.max(1, Math.ceil(academies.length / PAGE_SIZE));
  const selectedPage = Math.min(Number.isSafeInteger(page) && page > 0 ? page : 1, pages);
  return {
    state: "ready", sourceAuthority: "IRON_CANONICAL", asOf, sourceId,
    total: academies.length,
    registeredAcademies: customers.size,
    activeTrialCount: academies.filter(a => a.trialStatus === "active").length,
    expiredTrialCount: academies.filter(a => a.trialStatus === "expired").length,
    pages, page: selectedPage,
    academies: academies.slice((selectedPage - 1) * PAGE_SIZE, selectedPage * PAGE_SIZE),
  };
}

type SnapshotReader = (context: { tenantId: string; correlationId: string; timeoutMs: number }, source: SourceDefinition) => Promise<IronCommercialSnapshot>;

/**
 * Reuses exactly the source registry and its IRON commercial adapter.
 * An unregistered or ambiguous product/source returns unavailable; no
 * ad-hoc environment URL or foreign-tenant data is used.
 */
export class IronTrialPortfolioService {
  constructor(
    private readonly products: ProductRepository,
    private readonly sources: SourceRepository,
    private readonly readSnapshot: SnapshotReader = (ctx, source) => new IronCommercialConnector().snapshot(ctx, source),
  ) {}

  async read(context: TenantContext, selectedProductId?: string, requestedPage = 1): Promise<IronTrialPortfolio> {
    requirePermission(context, "commercial:read");
    requirePermission(context, "product:read");
    const products = (await this.products.list(context.tenantId))
      .filter(p => p.tenantId === context.tenantId && p.status === "active" && p.slug === "iron");
    const product = products.length === 1 ? products[0] : null;
    if (!product || (selectedProductId && selectedProductId !== product.id)) return { state: "not_applicable" };
    const profile = profileForSourceType(IRON_COMMERCIAL_SOURCE_TYPE);
    if (!profile) return { state: "unavailable" };
    try {
      const sources = (await this.sources.list(context.tenantId)).filter(source =>
        source.tenantId === context.tenantId &&
        source.productId === product.id &&
        sourceMatchesAdapter(source, profile),
      );
      if (sources.length !== 1) return { state: "unavailable" };
      const source = sources[0];
      const snapshot = await this.readSnapshot({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        timeoutMs: 8000,
      }, source);
      const asOf = Date.parse(snapshot.as_of);
      const maximumAge = (source.freshnessSeconds ?? 300) * 1000;
      if (!Number.isFinite(asOf) || asOf > Date.now() + 60000 || Date.now() - asOf > maximumAge) {
        return { state: "unavailable" };
      }
      return projectIronTrialPortfolio(snapshot, source.id, requestedPage);
    } catch {
      // Source unavailable/invalid/stale is not a factual zero.
      return { state: "unavailable" };
    }
  }
}
