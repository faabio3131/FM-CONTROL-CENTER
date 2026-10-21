import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { billingInvoices } from "./billing-schema";

/** Immutable, FM-reviewed payer mapping for an already registered payment.
 * SaaS customer IDs are NOT provider customer IDs. No secret material here.
 */
export const vendePaymentReadbackBindings = pgTable("fmcc_vende_payment_readback_binding",{
  id:uuid("id").defaultRandom().primaryKey(),
  tenantId:text("tenant_id").notNull(),invoiceId:uuid("invoice_id").notNull(),
  gatewayAccountId:uuid("gateway_account_id").notNull(),
  externalPaymentRef:text("external_payment_ref").notNull(),
  providerCustomerRef:text("provider_customer_ref").notNull(),
  sourceRef:text("source_ref").notNull(),actorId:text("actor_id").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[
  uniqueIndex("fmcc_vende_readback_binding_invoice_uq").on(t.tenantId,t.invoiceId),
  foreignKey({name:"fmcc_vende_readback_binding_invoice_fk",columns:[t.tenantId,t.invoiceId],
    foreignColumns:[billingInvoices.tenantId,billingInvoices.id]}),
]);

/** A claimed observation is never retried blindly, including after a crash. */
export const vendePaymentReadbackAttempts = pgTable("fmcc_vende_payment_readback_attempt",{
  id:uuid("id").defaultRandom().primaryKey(),tenantId:text("tenant_id").notNull(),
  invoiceId:uuid("invoice_id").notNull(),observationId:uuid("observation_id").notNull(),
  snapshotHash:text("snapshot_hash").notNull(),state:text("state").notNull(),
  reason:text("reason"),actorId:text("actor_id").notNull(),
  startedAt:timestamp("started_at",{withTimezone:true}).notNull(),
  finishedAt:timestamp("finished_at",{withTimezone:true}),
},t=>[
  uniqueIndex("fmcc_vende_readback_attempt_operation_uq").on(t.tenantId,t.observationId),
  foreignKey({name:"fmcc_vende_readback_attempt_invoice_fk",columns:[t.tenantId,t.invoiceId],
    foreignColumns:[billingInvoices.tenantId,billingInvoices.id]}),
  check("fmcc_vende_readback_attempt_state_ck",sql`${t.state} in ('processing','recorded','needs_attention')`),
]);
