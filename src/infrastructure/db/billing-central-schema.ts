import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Proposed persistence; deliberately not migrated into production in this PR.
export const billingCustomers = pgTable("fmcc_billing_customer", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  displayName: text("display_name").notNull(),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fmcc_billing_customer_tenant_idx").on(t.tenantId)]);

export const billingSubscriptions = pgTable("fmcc_billing_subscription", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  customerId: uuid("customer_id").notNull().references(() => billingCustomers.id),
  productCode: text("product_code").notNull(),
  planCode: text("plan_code").notNull(),
  authority: text("authority").notNull().default("direct"),
  externalSubscriptionRef: text("external_subscription_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("fmcc_billing_subscription_tenant_customer_idx").on(t.tenantId, t.customerId),
  uniqueIndex("fmcc_billing_subscription_tenant_id_uq").on(t.tenantId, t.id),
]);

export const billingLicenses = pgTable("fmcc_billing_license", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull().references(() => billingSubscriptions.id),
  version: integer("version").notNull().default(1),
  state: text("state").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fmcc_billing_license_tenant_subscription_uq").on(t.tenantId, t.subscriptionId),
  index("fmcc_billing_license_tenant_state_idx").on(t.tenantId, t.state),
]);

export const billingProviderEvents = pgTable("fmcc_billing_provider_event", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  outcome: text("outcome").notNull(),
}, (t) => [uniqueIndex("fmcc_billing_event_dedupe_uq").on(t.tenantId, t.provider, t.providerEventId)]);
