import { bigint, check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productDefinitions } from "./platform-schema";

/** Canonical billing records are owned by FM Command; never by a SaaS or gateway. */
export const billingGatewayAccounts = pgTable("fmcc_billing_gateway_account", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  provider: text("provider").notNull(),
  environment: text("environment").notNull(),
  label: text("label").notNull(),
  secretRef: text("secret_ref").notNull(),
  status: text("status").notNull().default("disabled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_billing_gateway_tenant_id_uq").on(t.tenantId, t.id),
  uniqueIndex("fmcc_billing_gateway_scope_label_uq").on(t.tenantId, t.provider, t.environment, t.label),
  check("fmcc_billing_gateway_env_ck", sql`${t.environment} in ('sandbox','production')`),
  check("fmcc_billing_gateway_status_ck", sql`${t.status} in ('disabled','enabled','revoked')`),
]);

export const billingCustomers = pgTable("fmcc_billing_customer", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  externalCustomerId: text("external_customer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_billing_customer_tenant_id_uq").on(t.tenantId, t.id),
  uniqueIndex("fmcc_billing_customer_external_uq").on(t.tenantId, t.externalCustomerId),
]);

export const billingSubscriptions = pgTable("fmcc_billing_subscription", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  planCode: text("plan_code").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_billing_subscription_scope_uq").on(t.tenantId, t.id, t.productId, t.customerId),
  foreignKey({ name: "fmcc_billing_sub_product_fk", columns: [t.tenantId,t.productId], foreignColumns: [productDefinitions.tenantId, productDefinitions.id] }),
  foreignKey({ name: "fmcc_billing_sub_customer_fk", columns: [t.tenantId,t.customerId], foreignColumns: [billingCustomers.tenantId,billingCustomers.id] }),
  index("fmcc_billing_sub_customer_idx").on(t.tenantId, t.customerId),
]);

export const billingInvoices = pgTable("fmcc_billing_invoice", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  gatewayAccountId: uuid("gateway_account_id").notNull(),
  currency: text("currency").notNull().default("BRL"),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_billing_invoice_tenant_id_uq").on(t.tenantId, t.id),
  foreignKey({ name: "fmcc_billing_invoice_sub_fk", columns: [t.tenantId,t.subscriptionId,t.productId,t.customerId], foreignColumns: [billingSubscriptions.tenantId,billingSubscriptions.id,billingSubscriptions.productId,billingSubscriptions.customerId] }),
  foreignKey({ name: "fmcc_billing_invoice_gateway_fk", columns: [t.tenantId,t.gatewayAccountId], foreignColumns: [billingGatewayAccounts.tenantId,billingGatewayAccounts.id] }),
  check("fmcc_billing_invoice_amount_ck", sql`${t.amountMinor} > 0`),
  check("fmcc_billing_invoice_currency_ck", sql`${t.currency} = 'BRL'`),
  index("fmcc_billing_invoice_product_customer_idx").on(t.tenantId,t.productId,t.customerId),
]);

export const billingProviderPayments = pgTable("fmcc_billing_provider_payment", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  invoiceId: uuid("invoice_id").notNull(),
  gatewayAccountId: uuid("gateway_account_id").notNull(),
  externalPaymentId: text("external_payment_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_billing_provider_external_uq").on(t.tenantId,t.gatewayAccountId,t.externalPaymentId),
  uniqueIndex("fmcc_billing_provider_invoice_uq").on(t.tenantId,t.invoiceId),
  foreignKey({ name: "fmcc_billing_payment_invoice_fk", columns: [t.tenantId,t.invoiceId], foreignColumns: [billingInvoices.tenantId,billingInvoices.id] }),
  foreignKey({ name: "fmcc_billing_payment_gateway_fk", columns: [t.tenantId,t.gatewayAccountId], foreignColumns: [billingGatewayAccounts.tenantId,billingGatewayAccounts.id] }),
]);

export const billingGatewayEvents = pgTable("fmcc_billing_gateway_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  gatewayAccountId: uuid("gateway_account_id").notNull(),
  externalEventId: text("external_event_id").notNull(),
  status: text("status").notNull().default("received"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_billing_gateway_event_dedupe_uq").on(t.tenantId,t.gatewayAccountId,t.externalEventId),
  foreignKey({ name: "fmcc_billing_event_gateway_fk", columns: [t.tenantId,t.gatewayAccountId], foreignColumns: [billingGatewayAccounts.tenantId,billingGatewayAccounts.id] }),
]);

export const billingAuditEvents = pgTable("fmcc_billing_audit_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  subjectId: text("subject_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("fmcc_billing_audit_scope_idx").on(t.tenantId,t.createdAt)]);
