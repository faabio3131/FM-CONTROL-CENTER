import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { billingInvoices, billingSubscriptions } from "./billing-schema";
import { productDefinitions } from "./platform-schema";

/** Vende-specific *current* approved contractual dates, NEVER inferred from invoice.created_at.
 * One row per tenant/subscription, revision-CAS updates and append-only audit.
 */
export const vendeContractTerms = pgTable("fmcc_vende_contract_terms", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  revision: integer("revision").notNull().default(1),
  effectiveFrom: date("effective_from").notNull(),
  paidThrough: date("paid_through").notNull(),
  dueDate: date("due_date").notNull(),
  autoRenew: boolean("auto_renew").notNull().default(false),
  lifecycleState: text("lifecycle_state").notNull().default("active"),
  calendarRegion: text("calendar_region").notNull().default("BR-SP"),
  sourceRef: text("source_ref").notNull(),
  actorId: text("actor_id").notNull(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("fmcc_vende_terms_subscription_uq").on(t.tenantId,t.subscriptionId),
  foreignKey({name:"fmcc_vende_terms_subscription_fk",
    columns:[t.tenantId,t.subscriptionId,t.productId,t.customerId],
    foreignColumns:[billingSubscriptions.tenantId,billingSubscriptions.id,
      billingSubscriptions.productId,billingSubscriptions.customerId]}),
  check("fmcc_vende_terms_dates_ck",sql`${t.paidThrough} >= ${t.effectiveFrom}`),
  check("fmcc_vende_terms_revision_ck",sql`${t.revision} > 0`),
  check("fmcc_vende_terms_state_ck",sql`${t.lifecycleState} in ('active','past_due','suspended','suspension_pending','cancel_at_period_end','cancelled')`),
  index("fmcc_vende_terms_due_idx").on(t.tenantId,t.dueDate,t.lifecycleState),
]);

export const vendeContractTermAudit = pgTable("fmcc_vende_contract_term_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId:text("tenant_id").notNull(),
  subscriptionId:uuid("subscription_id").notNull(),
  revision:integer("revision").notNull(),
  operationId:text("operation_id").notNull(),
  action:text("action").notNull(),
  actorId:text("actor_id").notNull(),
  previousState:text("previous_state"),
  newState:text("new_state").notNull(),
  effectiveDate:date("effective_date").notNull(),
  sourceRef:text("source_ref").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("fmcc_vende_term_audit_revision_uq").on(t.tenantId,t.subscriptionId,t.revision),
  uniqueIndex("fmcc_vende_term_audit_operation_uq").on(t.tenantId,t.operationId),
]);

export const vendeBusinessCalendars = pgTable("fmcc_vende_business_calendar",{
  id:uuid("id").defaultRandom().primaryKey(),
  tenantId:text("tenant_id").notNull(),
  productId:uuid("product_id").notNull(),
  region:text("region").notNull(),
  revision:integer("revision").notNull(),
  validFrom:date("valid_from").notNull(),
  validThrough:date("valid_through").notNull(),
  holidays:jsonb("holidays").$type<string[]>().notNull(),
  sourceRef:text("source_ref").notNull(),
  actorId:text("actor_id").notNull(),
  approvedAt:timestamp("approved_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("fmcc_vende_calendar_region_revision_uq").on(t.tenantId,t.productId,t.region,t.revision),
  foreignKey({name:"fmcc_vende_calendar_product_fk",
    columns:[t.tenantId,t.productId],
    foreignColumns:[productDefinitions.tenantId,productDefinitions.id]}),
  check("fmcc_vende_calendar_revision_ck",sql`${t.revision} > 0`),
  check("fmcc_vende_calendar_validity_ck",sql`${t.validThrough} >= ${t.validFrom}`),
]);

/** Only the trusted gateway reconciler may write these observations.
 * No public route and no synthetic 'unpaid' derived from a webhook.
 */
export const vendePaymentAttestations = pgTable("fmcc_vende_payment_attestation",{
  id:uuid("id").defaultRandom().primaryKey(),
  tenantId:text("tenant_id").notNull(),
  invoiceId:uuid("invoice_id").notNull(),
  externalPaymentRef:text("external_payment_ref").notNull(),
  outcome:text("outcome").notNull(),
  verifiedAt:timestamp("verified_at",{withTimezone:true}).notNull(),
  sourceRef:text("source_ref").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("fmcc_vende_payment_attestation_ref_uq").on(t.tenantId,t.invoiceId,t.externalPaymentRef),
  foreignKey({name:"fmcc_vende_attestation_invoice_fk",
    columns:[t.tenantId,t.invoiceId],
    foreignColumns:[billingInvoices.tenantId,billingInvoices.id]}),
  check("fmcc_vende_attestation_outcome_ck",sql`${t.outcome} in ('unpaid_verified','settled_verified','reversed_verified')`),
  index("fmcc_vende_attestation_fresh_idx").on(t.tenantId,t.invoiceId,t.verifiedAt),
]);

/** Immutable intent and delivery fence. Never treat 'queued' as a SaaS ACK.
 * Sender/receiver integration must implement signed delivery and read-only recovery.
 */
export const vendeLifecycleCommands = pgTable("fmcc_vende_lifecycle_command",{
  id:uuid("id").defaultRandom().primaryKey(),
  tenantId:text("tenant_id").notNull(),
  productId:uuid("product_id").notNull(),
  subscriptionId:uuid("subscription_id").notNull(),
  customerId:uuid("customer_id").notNull(),
  operationId:text("operation_id").notNull(),
  expectedRevision:integer("expected_revision").notNull(),
  revision:integer("revision").notNull(),
  action:text("action").notNull(),
  state:text("state").notNull().default("pending"),
  externalTenantId:text("external_tenant_id").notNull(),
  effectiveDate:date("effective_date").notNull(),
  sourceRef:text("source_ref").notNull(),
  actorId:text("actor_id").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  claimedAt:timestamp("claimed_at",{withTimezone:true}),
  deliveredAt:timestamp("delivered_at",{withTimezone:true}),
},t=>[
  uniqueIndex("fmcc_vende_lifecycle_operation_uq").on(t.tenantId,t.operationId),
  uniqueIndex("fmcc_vende_lifecycle_revision_uq").on(t.tenantId,t.subscriptionId,t.revision),
  foreignKey({name:"fmcc_vende_lifecycle_subscription_fk",
    columns:[t.tenantId,t.subscriptionId,t.productId,t.customerId],
    foreignColumns:[billingSubscriptions.tenantId,billingSubscriptions.id,
      billingSubscriptions.productId,billingSubscriptions.customerId]}),
  check("fmcc_vende_lifecycle_revision_ck",sql`${t.expectedRevision}>0 and ${t.revision}>${t.expectedRevision}`),
  check("fmcc_vende_lifecycle_action_ck",sql`${t.action} in ('SUSPEND_DELINQUENCY','SCHEDULE_CANCEL','REACTIVATE_VERIFIED','APPLY_DOWNGRADE','APPLY_UPGRADE','RENEW_VERIFIED')`),
  check("fmcc_vende_lifecycle_state_ck",sql`${t.state} in ('pending','processing','delivered','blocked','unknown')`),
  index("fmcc_vende_lifecycle_ready_idx").on(t.state,t.createdAt),
]);
