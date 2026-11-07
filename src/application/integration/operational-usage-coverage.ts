import type { IronUsageSnapshot } from "@/infrastructure/integration/iron-usage-connector";
import { IRON_USAGE_SOURCE_TYPE } from "@/infrastructure/integration/iron-usage-connector";
import type { NfcoreOperationalUsageSnapshot } from "@/infrastructure/integration/nfcore-operational-usage-connector";
import { NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE } from "@/infrastructure/integration/nfcore-operational-usage-connector";

export interface OperationalUsageCoverageReport {
  readonly source: typeof IRON_USAGE_SOURCE_TYPE | typeof NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE;
  readonly contract: "iron.fmcc.ai-usage.v1" | "nfcore.fmcc.operational-usage.v1";
  readonly asOf: string;
  readonly queriedAt: string;
  readonly authority: "IRON_CANONICAL_AI_EXECUTION_TRACE" | "nfcore-operational-usage-core";
  readonly windowStart: string | null;
  readonly windowDays: number | null;
  readonly summary: readonly { readonly code: string; readonly label: string; readonly count: number }[];
  readonly groups: readonly {
    readonly label: string;
    readonly measured: number | null;
    readonly limit: number | null;
    readonly missingMeasurements: number;
  }[];
  readonly truncated: boolean;
  readonly measurementKind: "execution_count" | "quota_usage";
  readonly completeIntegrationCertified: false;
}
function add(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error("operational_usage.aggregate_overflow");
  return sum;
}
export function projectOperationalUsageCoverage(sourceType: typeof IRON_USAGE_SOURCE_TYPE, snapshot: IronUsageSnapshot): OperationalUsageCoverageReport;
export function projectOperationalUsageCoverage(sourceType: typeof NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE, snapshot: NfcoreOperationalUsageSnapshot): OperationalUsageCoverageReport;
/** Read-only, explicitly whitelisted aggregates. Never expose tenant or subscription IDs. */
export function projectOperationalUsageCoverage(
  sourceType: typeof IRON_USAGE_SOURCE_TYPE | typeof NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE,
  snapshot: IronUsageSnapshot | NfcoreOperationalUsageSnapshot,
): OperationalUsageCoverageReport {
  const queriedAt = new Date().toISOString();
  if (sourceType === IRON_USAGE_SOURCE_TYPE) {
    if (snapshot.schema_version !== "iron.fmcc.ai-usage.v1" ||
        snapshot.product_code !== "IRON_FIT_CORE") {
      throw new Error("operational_usage.iron_projection_invalid");
    }
    const raw = snapshot as IronUsageSnapshot;
    const groups = new Map<string, {label:string;measured:number;limit:null;missingMeasurements:0}>();
    let total = 0;
    for (const row of raw.usage) {
      total = add(total, row.execution_count);
      const label = [row.capability, row.provider_code, row.model_code, row.status].join(" · ");
      const prior = groups.get(label);
      groups.set(label, {
        label, measured: add(prior?.measured ?? 0,row.execution_count),
        limit:null, missingMeasurements:0,
      });
    }
    const list = [...groups.values()].sort((a,b)=> b.measured - a.measured || a.label.localeCompare(b.label));
    return {
      source: IRON_USAGE_SOURCE_TYPE, contract:"iron.fmcc.ai-usage.v1",
      asOf:new Date(raw.as_of).toISOString(),queriedAt,
      authority:"IRON_CANONICAL_AI_EXECUTION_TRACE",
      windowStart:new Date(raw.window_start).toISOString(),windowDays:raw.window_days,
      summary:[
        {code:"execution_groups",label:"Grupos de execução de IA",count:raw.usage.length},
        {code:"executions",label:"Execuções reportadas",count:total},
        {code:"unavailable",label:"Tipos de medição detalhada indisponíveis",count:raw.unavailable_metrics.length},
      ],
      groups:list.slice(0,40),truncated:list.length>40,
      measurementKind:"execution_count",completeIntegrationCertified:false,
    };
  }
  if (sourceType !== NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE ||
      snapshot.schema_version !== "nfcore.fmcc.operational-usage.v1" ||
      snapshot.product_code !== "NFCORE") {
    throw new Error("operational_usage.nfcore_projection_invalid");
  }
  const raw = snapshot as NfcoreOperationalUsageSnapshot;
  const groups = new Map<string, {
    label:string;measured:number|null;limit:number;missingMeasurements:number
  }>();
  for (const row of raw.consumption) {
    for (const metric of row.metrics) {
      const prior = groups.get(metric.metric_id);
      groups.set(metric.metric_id,{
        label:metric.metric_id,
        measured:metric.used === null || prior?.measured === null
          ? null : add(prior?.measured ?? 0,metric.used),
        limit:add(prior?.limit ?? 0,metric.limit),
        missingMeasurements:add(prior?.missingMeasurements ?? 0,metric.unavailable ? 1 : 0),
      });
    }
  }
  const list=[...groups.values()].sort((a,b)=>a.label.localeCompare(b.label));
  return {
    source:NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE,contract:"nfcore.fmcc.operational-usage.v1",
    asOf:new Date(raw.as_of).toISOString(),queriedAt,authority:"nfcore-operational-usage-core",
    windowStart:null,windowDays:null,
    summary:[
      {code:"subscriptions_with_quotas",label:"Assinaturas com quotas",count:raw.summary.subscriptions_with_quotas},
      {code:"metrics_reported",label:"Métricas de quota reportadas",count:raw.summary.metrics_reported},
      {code:"metrics_unavailable",label:"Medições indisponíveis",count:raw.summary.metrics_unavailable},
    ],
    groups:list.slice(0,40),truncated:list.length>40,
    measurementKind:"quota_usage",completeIntegrationCertified:false,
  };
}
