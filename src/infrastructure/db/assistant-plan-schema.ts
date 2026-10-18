import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productDefinitions } from "./platform-schema";

export const assistantPlanRevisions = pgTable("fmcc_assistant_plan_revision", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  planCode: text("plan_code").notNull(),
  revision: integer("revision").notNull(),
  label: text("label").notNull(),
  billingInterval: text("billing_interval").notNull(),
  amountMinor: bigint("amount_minor", {mode:"number"}).notNull(),
  currency: text("currency").notNull().default("BRL"),
  allowances: jsonb("allowances").$type<Array<{resource:string;scope:"tenant"|"unit";limitUnits:number;windowSeconds:number}>>().notNull(),
  status: text("status").notNull().default("draft"),
  actorId: text("actor_id").notNull(),
  publishedAt: timestamp("published_at",{withTimezone:true}),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_assistant_plan_rev_scope_uq").on(t.tenantId,t.productId,t.planCode,t.revision),
  index("fmcc_assistant_plan_product_idx").on(t.tenantId,t.productId,t.status),
  foreignKey({name:"fmcc_assistant_plan_product_fk",columns:[t.tenantId,t.productId],foreignColumns:[productDefinitions.tenantId,productDefinitions.id]}),
  check("fmcc_assistant_plan_revision_positive_ck",sql`${t.revision} > 0`),
  check("fmcc_assistant_plan_price_positive_ck",sql`${t.amountMinor} > 0`),
  check("fmcc_assistant_plan_status_ck",sql`${t.status} in ('draft','published','retired')`),
  check("fmcc_assistant_plan_currency_ck",sql`${t.currency} = 'BRL'`),
  check("fmcc_assistant_plan_interval_ck",sql`${t.billingInterval} in ('monthly','yearly')`),
]);
