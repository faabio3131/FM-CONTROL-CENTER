import {
  bigint, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

// Schema candidates only. No DB migration, endpoint or credential activation in this PR.
// Every relationship crossing commercial entities includes the billing tenant.
export const billingCustomers = pgTable("fmcc_billing_customer", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  displayName: text("display_name").notNull(),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fmcc_billing_customer_tenant_id_uq").on(t.tenantId, t.id),
]);

export const billingGatewayAccounts = pgTable("fmcc_billing_gateway_account", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  providerCode: text("provider_code").notNull(),
  environment: text("environment").notNull(), // sandbox | production
  credentialRef: text("credential_ref").notNull(), // never inline secrets
  publicLabel: text("public_label").notNull(),
  status: text("status").notNull().default("disabled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fmcc_billing_gateway_account_tenant_id_uq").on(t.tenantId, t.id),
  index("fmcc_billing_gateway_account_tenant_provider_idx").on(t.tenantId, t.providerCode),
]);

export const billingSubscriptions = pgTable("fmcc_billing_subscription", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  productCode: text("product_code").notNull(),
  planCode: text("plan_code").notNull(),
  authority: text("authority").notNull().default("direct"),
  externalSubscriptionRef: text("external_subscription_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    name: "fmcc_billing_subscription_customer_fk",
    columns: [t.tenantId, t.customerId],
    foreignColumns: [billingCustomers.tenantId, billingCustomers.id],
  }),
  uniqueIndex("fmcc_billing_subscription_tenant_id_uq").on(t.tenantId, t.id),
  uniqueIndex("fmcc_billing_subscription_attribution_uq").on(t.tenantId, t.id, t.customerId, t.productCode),
  index("fmcc_billing_subscription_tenant_customer_idx").on(t.tenantId, t.customerId),
]);

export const billingLicenses = pgTable("fmcc_billing_license", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  version: integer("version").notNull().default(1),
  state: text("state").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    name: "fmcc_billing_license_subscription_fk",
    columns: [t.tenantId, t.subscriptionId],
    foreignColumns: [billingSubscriptions.tenantId, billingSubscriptions.id],
  }),
  uniqueIndex("fmcc_billing_license_tenant_subscription_uq").on(t.tenantId, t.subscriptionId),
  index("fmcc_billing_license_tenant_state_idx").on(t.tenantId, t.state),
]);

export const billingInvoices = pgTable("fmcc_billing_invoice", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  productCode: text("product_code").notNull(),
  gatewayAccountId: uuid("gateway_account_id").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  amountMinor: bigint("amount_minor", {mode:"bigint"}).notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    name: "fmcc_billing_invoice_subscription_fk",
    columns: [t.tenantId, t.subscriptionId, t.customerId, t.productCode],
    foreignColumns: [billingSubscriptions.tenantId, billingSubscriptions.id, billingSubscriptions.customerId, billingSubscriptions.productCode],
  }),
  foreignKey({
    name: "fmcc_billing_invoice_gateway_fk",
    columns: [t.tenantId, t.gatewayAccountId],
    foreignColumns: [billingGatewayAccounts.tenantId, billingGatewayAccounts.id],
  }),
  uniqueIndex("fmcc_billing_invoice_tenant_id_uq").on(t.tenantId, t.id),
  uniqueIndex("fmcc_billing_invoice_receiver_uq").on(t.tenantId, t.id, t.gatewayAccountId),
  index("fmcc_billing_invoice_tenant_subscription_idx").on(t.tenantId, t.subscriptionId),
]);

export const billingPayments = pgTable("fmcc_billing_payment", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  invoiceId: uuid("invoice_id").notNull(),
  gatewayAccountId: uuid("gateway_account_id").notNull(),
  externalPaymentId: text("external_payment_id").notNull(),
  status: text("status").notNull().default("pending"),
  currency: text("currency").notNull(),
  amountMinor: bigint("amount_minor", {mode:"bigint"}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    name: "fmcc_billing_payment_invoice_receiver_fk",
    columns: [t.tenantId, t.invoiceId, t.gatewayAccountId],
    foreignColumns: [billingInvoices.tenantId, billingInvoices.id, billingInvoices.gatewayAccountId],
  }),
  uniqueIndex("fmcc_billing_payment_provider_ref_uq").on(t.tenantId, t.gatewayAccountId, t.externalPaymentId),
  index("fmcc_billing_payment_tenant_invoice_idx").on(t.tenantId, t.invoiceId),
]);

export const billingProviderEvents = pgTable("fmcc_billing_provider_event", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  gatewayAccountId: uuid("gateway_account_id").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  outcome: text("outcome").notNull(),
}, (t) => [
  foreignKey({
    name: "fmcc_billing_event_gateway_fk",
    columns: [t.tenantId, t.gatewayAccountId],
    foreignColumns: [billingGatewayAccounts.tenantId, billingGatewayAccounts.id],
  }),
  uniqueIndex("fmcc_billing_event_dedupe_uq").on(t.tenantId, t.gatewayAccountId, t.providerEventId),
]);


/** Ciphertexts only. Encryption keys stay outside PostgreSQL and outside the repository. */
export const billingGatewaySecrets = pgTable("fmcc_billing_gateway_secret", {
  accountId: uuid("account_id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  keyVersion: text("key_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    name: "fmcc_billing_gateway_secret_account_fk",
    columns: [t.tenantId, t.accountId],
    foreignColumns: [billingGatewayAccounts.tenantId, billingGatewayAccounts.id],
  }),
  index("fmcc_billing_gateway_secret_tenant_idx").on(t.tenantId),
]);
