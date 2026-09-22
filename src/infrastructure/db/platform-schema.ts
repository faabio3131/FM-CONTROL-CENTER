import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const productDefinitions = pgTable("fmcc_product_definition", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fmcc_product_tenant_slug_uq").on(t.tenantId, t.slug),
  index("fmcc_product_tenant_status_idx").on(t.tenantId, t.status),
]);

export const sourceDefinitions = pgTable("fmcc_source_definition", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id"),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  authoritativeDomain: text("authoritative_domain").notNull(),
  status: text("status").notNull().default("configured"),
  syncMode: text("sync_mode").notNull(),
  secretRef: text("secret_ref"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  freshnessSeconds: integer("freshness_seconds"),
  mappingVersion: text("mapping_version").notNull().default("v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fmcc_source_tenant_name_uq").on(t.tenantId, t.name),
  index("fmcc_source_tenant_status_idx").on(t.tenantId, t.status),
  index("fmcc_source_tenant_product_idx").on(t.tenantId, t.productId),
]);

export const syncExecutions = pgTable("fmcc_sync_execution", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sourceId: uuid("source_id").notNull(),
  status: text("status").notNull(),
  cursorBefore: text("cursor_before"),
  cursorAfter: text("cursor_after"),
  idempotencyKey: text("idempotency_key").notNull(),
  correlationId: text("correlation_id").notNull(),
  attempt: integer("attempt").notNull().default(1),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("fmcc_sync_tenant_idempotency_uq").on(t.tenantId, t.idempotencyKey),
  index("fmcc_sync_tenant_source_idx").on(t.tenantId, t.sourceId, t.startedAt),
]);

export const canonicalFacts = pgTable("fmcc_canonical_fact", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id"),
  sourceId: uuid("source_id").notNull(),
  externalId: text("external_id").notNull(),
  factType: text("fact_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  mappingVersion: text("mapping_version").notNull(),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }).notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [
  uniqueIndex("fmcc_fact_dedupe_uq").on(t.tenantId, t.sourceId, t.externalId, t.mappingVersion),
  index("fmcc_fact_tenant_type_time_idx").on(t.tenantId, t.factType, t.sourceTimestamp),
  index("fmcc_fact_tenant_product_type_time_idx").on(t.tenantId, t.productId, t.factType, t.sourceTimestamp),
]);

export const metricValues = pgTable("fmcc_metric_value", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id"),
  metricId: text("metric_id").notNull(),
  metricVersion: integer("metric_version").notNull(),
  value: text("value"),
  unit: text("unit").notNull(),
  currency: text("currency"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  asOf: timestamp("as_of", { withTimezone: true }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  freshnessStatus: text("freshness_status").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceAuthority: text("source_authority").notNull(),
  provenanceRefs: jsonb("provenance_refs").$type<string[]>().notNull().default([]),
}, (t) => [
  index("fmcc_metric_tenant_metric_time_idx").on(t.tenantId, t.metricId, t.computedAt),
  index("fmcc_metric_tenant_product_metric_time_idx").on(t.tenantId, t.productId, t.metricId, t.computedAt),
]);
