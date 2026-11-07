import type { CoreAnswer, CoreEvidence } from "@/domain/core/contracts";
import type { ProductRepository, ProductDefinition } from "@/domain/products/contracts";
import type { SourceRepository, SourceDefinition, ConnectorContext } from "@/domain/integration/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import { sourceMatchesAdapter, profileForSourceType } from "@/application/integration/saas-adapter-profiles";
import { KordenaCommercialConnector, KORDENA_COMMERCIAL_SOURCE_TYPE } from "@/infrastructure/integration/kordena-commercial-connector";
import { IronCommercialConnector, IRON_COMMERCIAL_SOURCE_TYPE } from "@/infrastructure/integration/iron-commercial-connector";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { CoreArgumentError } from "@/application/core/core-gateway";

type CustomerCountKind = "active" | "registered";
type SnapshotType = typeof KORDENA_COMMERCIAL_SOURCE_TYPE | typeof IRON_COMMERCIAL_SOURCE_TYPE;
export interface CommercialCustomerSnapshot {
  readonly schema_version: string;
  readonly product_code: string;
  readonly as_of: string;
  readonly summary: Readonly<Record<string, number>>;
}
export type CommercialSnapshotReader = (
  context: ConnectorContext,
  source: SourceDefinition,
) => Promise<CommercialCustomerSnapshot>;
export type CustomerSnapshotReaders = Partial<Record<SnapshotType, CommercialSnapshotReader>>;

const SOURCE_BY_PRODUCT: Readonly<Record<string, {
  readonly sourceType: SnapshotType;
  readonly schema: string;
  readonly productCode: string;
  readonly authority: string;
  readonly noun: string;
}>> = {
  kordena: {
    sourceType: KORDENA_COMMERCIAL_SOURCE_TYPE,
    schema: "kordena.fmcc.commercial.v1",
    productCode: "KORDENA",
    authority: "kordena_fm_commercial_platform",
    noun: "clientes",
  },
  iron: {
    sourceType: IRON_COMMERCIAL_SOURCE_TYPE,
    schema: "iron.fmcc.commercial.v1",
    productCode: "IRON_FIT_CORE",
    authority: "iron_fmcc_commercial_platform",
    noun: "academias",
  },
};

function normalize(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Only unambiguous counting questions; unrelated requests still use the normal Core planner. */
export function classifyCustomerCountQuestion(question: string): CustomerCountKind | null {
  const q = normalize(question);
  const counting = /\b(quantos|quantas|quantidade|numero|total)\b/.test(q);
  const customers = /\b(clientes|academias)\b/.test(q);
  const competing = /\b(assinaturas|assinantes|faturamento|receita|pagamentos|trials|leads)\b/.test(q);
  if (!counting || !customers || competing) return null;
  return /\b(ativos|ativas)\b/.test(q) ? "active" : "registered";
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function intendedProductIds(
  catalog: readonly ProductDefinition[],
  question: string,
  explicit?: readonly string[],
): readonly ProductDefinition[] {
  if (explicit !== undefined) {
    if (explicit.length > 4 || new Set(explicit).size !== explicit.length ||
        explicit.some(slug => typeof slug !== "string" || !slug.trim())) {
      throw new CoreArgumentError();
    }
    const selected = explicit.map(slug => catalog.find(p => p.slug === slug));
    if (selected.some(p => !p)) throw new CoreArgumentError();
    return selected as ProductDefinition[];
  }
  const q = normalize(question);
  const found = catalog.filter(p => {
    // Slug matching is always word-boundary aware to avoid accidental product selection.
    const terms = [p.slug, p.name].map(normalize).filter(x => x.length > 2);
    return terms.some(term => {
      const pos = q.indexOf(term);
      return pos >= 0 && (pos === 0 || !/[a-z0-9]/.test(q[pos - 1])) &&
        (pos + term.length === q.length || !/[a-z0-9]/.test(q[pos + term.length]));
    });
  });
  return found.length ? found : catalog;
}

interface CustomerObservation {
  readonly product: ProductDefinition;
  readonly count: number | null;
  readonly registeredCount: number | null;
  readonly status: "available" | "unsupported" | "missing" | "stale" | "invalid";
  readonly evidence?: CoreEvidence;
}

/**
 * Read-only direct data path for concrete customer-count questions.
 * Never maps subscriptions to customers, never returns PII, never assumes
 * deduplication of customer identities across SaaS or invents a company total.
 */
export class CustomerSnapshotQueryService {
  constructor(
    private readonly products: ProductRepository,
    private readonly sources: SourceRepository,
    private readonly readers: CustomerSnapshotReaders,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async answer(
    context: TenantContext,
    question: string,
    input: { readonly kind: CustomerCountKind; readonly productSlugs?: readonly string[] },
  ): Promise<CoreAnswer> {
    requirePermission(context, "metric:read");
    requirePermission(context, "commercial:read");
    const catalog = (await this.products.list(context.tenantId))
      .filter(p => p.tenantId === context.tenantId && p.status === "active");
    const selected = intendedProductIds(catalog, question, input.productSlugs);
    if (selected.length === 0) {
      return {
        answer: "Não há produtos ativos cadastrados para esta organização. Não é possível determinar o total de clientes.",
        factualStatus: "unavailable",
        evidence: [],
      };
    }
    const candidates = await this.sources.list(context.tenantId);
    const now = this.now();
    const observations = await Promise.all(selected.map(async (product): Promise<CustomerObservation> => {
      const config = SOURCE_BY_PRODUCT[product.slug];
      if (!config || !this.readers[config.sourceType]) {
        return { product, count: null, registeredCount: null, status: "unsupported" };
      }
      const rows = candidates.filter(s =>
        s.tenantId === context.tenantId &&
        s.productId === product.id &&
        s.sourceType === config.sourceType,
      );
      const profile = profileForSourceType(config.sourceType);
      if (!profile || rows.length !== 1 || !sourceMatchesAdapter(rows[0], profile)) {
        return { product, count: null, registeredCount: null, status: "missing" };
      }
      const source = rows[0];
      const baseEvidence: CoreEvidence = {
        kind: "source",
        ref: config.schema,
        productId: product.id,
        productSlug: product.slug,
        sourceAuthority: config.authority,
        freshnessStatus: "unavailable",
        qualityStatus: "missing",
      };
      try {
        const snapshot = await this.readers[config.sourceType]!({
          tenantId: context.tenantId, correlationId: context.correlationId,
          timeoutMs: 8000,
        }, source);
        const asOf = new Date(snapshot.as_of);
        if (snapshot.schema_version !== config.schema ||
            snapshot.product_code !== config.productCode ||
            !snapshot.summary || typeof snapshot.summary !== "object" ||
            !Number.isFinite(asOf.getTime())) {
          return { product, count: null, registeredCount: null, status: "invalid", evidence: baseEvidence };
        }
        const ageMs = now.getTime() - asOf.getTime();
        const maxAge = (source.freshnessSeconds ?? 300) * 1000;
        const evidence: CoreEvidence = {
          ...baseEvidence,
          asOf: asOf.toISOString(),
          provenanceRefs: [
            `source:${source.id}`,
            `schema:${snapshot.schema_version}`,
            `mapping:${source.mappingVersion}`,
          ],
          freshnessStatus: (ageMs < -60_000 || ageMs > maxAge) ? "stale" : "fresh",
          qualityStatus: "verified",
        };
        if (evidence.freshnessStatus === "stale") {
          return { product, count: null, registeredCount: null, status: "stale", evidence };
        }
        const rawRegistered = snapshot.summary.customers;
        const rawActive = snapshot.summary.active_customers;
        // Never infer active from total registered or active subscriptions.
        if ((rawRegistered !== undefined && !validCount(rawRegistered)) ||
            (rawActive !== undefined && !validCount(rawActive))) {
          return { product, count: null, registeredCount: null, status: "invalid", evidence: baseEvidence };
        }
        const count = input.kind === "active" ? rawActive : rawRegistered;
        return {
          product, count: validCount(count) ? count : null,
          registeredCount: validCount(rawRegistered) ? rawRegistered : null,
          status: validCount(count) ? "available" : "missing",
          evidence,
        };
      } catch {
        return { product, count: null, registeredCount: null, status: "missing", evidence: baseEvidence };
      }
    }));

    const available = observations.filter(item => item.status === "available");
    const rows = observations.map(item => {
      const noun = SOURCE_BY_PRODUCT[item.product.slug]?.noun ?? "clientes";
      if (item.status === "available") {
        const asOf = item.evidence?.asOf ?? "sem timestamp";
        return `${item.product.name}: ${item.count} ${noun} ${input.kind === "active" ? "ativos" : "cadastrados"} (atualizado em ${asOf}).`;
      }
      if (input.kind === "active" && item.registeredCount !== null) {
        return `${item.product.name}: clientes ativos não informados; o snapshot informa apenas ${item.registeredCount} ${noun} cadastrados.`;
      }
      const reason = item.status === "unsupported" ? "contrato de clientes não integrado ao Core" :
        item.status === "stale" ? "dados antigos, não considerados atuais" :
        item.status === "invalid" ? "resposta inválida" :
        "dados desta métrica não informados ou consulta indisponível";
      return `${item.product.name}: ${reason}.`;
    });
    const scopeNote = selected.length > 1
      ? "Não é possível afirmar um total único de clientes da empresa: há lacunas de cobertura e clientes de SaaS diferentes não são automaticamente deduplicados."
      : available.length === 0
        ? "Não é possível confirmar esse número atualmente."
        : "Leitura específica deste SaaS, não total consolidado da empresa.";
    return {
      answer: [
        input.kind === "active" ? "Clientes ativos por SaaS:" : "Clientes cadastrados por SaaS:",
        ...rows,
        scopeNote,
      ].join("\n"),
      factualStatus: available.length > 0 ? "grounded" : "unavailable",
      evidence: observations.flatMap(o => o.evidence ? [o.evidence] : []),
    };
  }
}

export function buildCustomerSnapshotQueryService(): CustomerSnapshotQueryService {
  const kordena = new KordenaCommercialConnector();
  const iron = new IronCommercialConnector();
  return new CustomerSnapshotQueryService(
    new PostgresProductRepository(),
    new PostgresSourceRepository(),
    {
      [KORDENA_COMMERCIAL_SOURCE_TYPE]: (context, source) => kordena.snapshot(context, source),
      [IRON_COMMERCIAL_SOURCE_TYPE]: (context, source) => iron.snapshot(context, source),
    },
  );
}
