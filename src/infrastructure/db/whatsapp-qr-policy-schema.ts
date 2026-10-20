import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productDefinitions } from "./platform-schema";
import { foreignKey } from "drizzle-orm/pg-core";

/** A single FM corporate WhatsApp QR display policy for each product. */
export const whatsappQRDisplayPolicies = pgTable("fmcc_whatsapp_qr_display_policy", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  displaySeconds: integer("display_seconds").notNull().default(45),
  revision: integer("revision").notNull().default(1),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_whatsapp_qr_policy_scope_uq").on(t.tenantId,t.productId),
  foreignKey({name:"fmcc_whatsapp_qr_policy_product_fk",columns:[t.tenantId,t.productId],foreignColumns:[productDefinitions.tenantId,productDefinitions.id]}),
  check("fmcc_whatsapp_qr_policy_seconds_ck",sql`${t.displaySeconds} BETWEEN 15 AND 120`),
  check("fmcc_whatsapp_qr_policy_revision_ck",sql`${t.revision} >= 1`),
]);

export const whatsappQRDisplayPolicyAudit = pgTable("fmcc_whatsapp_qr_display_policy_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  actorId: text("actor_id").notNull(),
  revision: integer("revision").notNull(),
  previousSeconds: integer("previous_seconds"),
  displaySeconds: integer("display_seconds").notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [
  uniqueIndex("fmcc_whatsapp_qr_audit_revision_uq").on(t.tenantId,t.productId,t.revision),
  check("fmcc_whatsapp_qr_audit_seconds_ck",sql`${t.displaySeconds} BETWEEN 15 AND 120`),
]);
