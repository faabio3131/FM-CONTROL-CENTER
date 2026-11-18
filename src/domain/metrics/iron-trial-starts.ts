import { createHash } from "node:crypto";

/** Actual historical IRON trial start, not a paid FM billing subscription. */
export interface IronTrialCanonicalFact {
  readonly id: string;
  readonly externalId: string;
  readonly payload: Record<string, unknown>;
  readonly sourceTimestamp: Date;
}

export interface IronTrialMonthProjection {
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly count: number;
  readonly sourceTimestamp: Date;
  readonly provenanceRefs: readonly string[];
}

function isoDate(input: unknown): Date {
  if (typeof input !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input)) {
    throw new Error("metrics.iron_trial_invalid_timestamp");
  }
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) {
    throw new Error("metrics.iron_trial_invalid_timestamp");
  }
  return parsed;
}

function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}
function monthEnd(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
}

/**
 * Fail closed on malformed, duplicated or future-dated source trials rather than
 * converting missing metrics into zero. The source records each trial request
 * exactly once; we count request IDs, never subscription status, users or paid
 * invoices. Data comes only from the authenticated canonical IRON source.
 */
export function projectIronTrialStarts(
  facts: readonly IronTrialCanonicalFact[],
  asOf: Date,
): readonly IronTrialMonthProjection[] {
  if (!Number.isFinite(asOf.getTime()) || facts.length > 100_000) {
    throw new Error("metrics.iron_trial_materialization_limit");
  }
  const seen = new Map<string, string>();
  const groups = new Map<string, { started: Date; refs: string[]; ids: Set<string> }>();
  for (const fact of facts) {
    const item = fact.payload;
    const externalId = item.external_id;
    const gymId = item.tenant_id;
    const subscriptionId = item.subscription_id;
    if (typeof externalId !== "string" || externalId.length < 8 || externalId.length > 160 ||
        fact.externalId !== "trial:" + externalId ||
        typeof gymId !== "string" || !/^[0-9a-f-]{36}$/i.test(gymId) ||
        typeof subscriptionId !== "string" || !/^[0-9a-f-]{36}$/i.test(subscriptionId) ||
        (item.status !== "active" && item.status !== "expired") ||
        typeof fact.id !== "string" || !/^[0-9a-f-]{36}$/i.test(fact.id) ||
        !(fact.sourceTimestamp instanceof Date) || !Number.isFinite(fact.sourceTimestamp.getTime())) {
      throw new Error("metrics.iron_trial_invalid_fact");
    }
    const start = isoDate(item.started_at);
    const end = isoDate(item.ends_at);
    const created = isoDate(item.created_at);
    if (created.getTime() !== fact.sourceTimestamp.getTime() ||
        start.getTime() > asOf.getTime() + 60_000 || end <= start) {
      throw new Error("metrics.iron_trial_inconsistent_fact");
    }
    const fingerprint = [gymId, subscriptionId, start.toISOString()].join(":");
    const existing = seen.get(externalId);
    if (existing && existing !== fingerprint) {
      throw new Error("metrics.iron_trial_duplicate_conflict");
    }
    seen.set(externalId, fingerprint);
    const month = monthStart(start).toISOString();
    const group = groups.get(month) ?? { started: start, refs: [], ids: new Set<string>() };
    if (!group.ids.has(externalId)) {
      group.refs.push(fact.id);
      group.ids.add(externalId);
    }
    if (group.started < start) group.started = start;
    groups.set(month, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([month, group]) => {
      const refs = [...group.refs].sort();
      const digest = createHash("sha256").update(refs.join("\n")).digest("hex");
      return {
        periodStart: new Date(month),
        periodEnd: monthEnd(new Date(month)),
        count: group.ids.size,
        sourceTimestamp: group.started,
        provenanceRefs: ["iron.trial:sha256:" + digest, ...refs.slice(0, 12)],
      };
    });
}
