CREATE TABLE "fmcc_whatsapp_qr_display_policy" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" text NOT NULL,
 "product_id" uuid NOT NULL,
 "display_seconds" integer DEFAULT 45 NOT NULL,
 "revision" integer DEFAULT 1 NOT NULL,
 "actor_id" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "fmcc_whatsapp_qr_policy_seconds_ck" CHECK ("display_seconds" BETWEEN 15 AND 120),
 CONSTRAINT "fmcc_whatsapp_qr_policy_revision_ck" CHECK ("revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "fmcc_whatsapp_qr_display_policy" ADD CONSTRAINT "fmcc_whatsapp_qr_policy_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."fmcc_product_definition"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_whatsapp_qr_policy_scope_uq" ON "fmcc_whatsapp_qr_display_policy" USING btree ("tenant_id","product_id");
--> statement-breakpoint
CREATE TABLE "fmcc_whatsapp_qr_display_policy_audit" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" text NOT NULL,
 "product_id" uuid NOT NULL,
 "actor_id" text NOT NULL,
 "revision" integer NOT NULL,
 "previous_seconds" integer,
 "display_seconds" integer NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "fmcc_whatsapp_qr_audit_seconds_ck" CHECK ("display_seconds" BETWEEN 15 AND 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_whatsapp_qr_audit_revision_uq" ON "fmcc_whatsapp_qr_display_policy_audit" USING btree ("tenant_id","product_id","revision");
