CREATE TABLE "fmcc_billing_vende_license_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "product_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "subscription_id" uuid NOT NULL,
  "external_tenant_id" text NOT NULL,
  "plan_code" text NOT NULL,
  "plan_revision" integer NOT NULL,
  "actor_id" text NOT NULL,
  "state" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "claimed_at" timestamp with time zone,
  "claim_token" uuid,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fmcc_vende_license_outbox_revision_ck" CHECK ("plan_revision" > 0),
  CONSTRAINT "fmcc_vende_license_outbox_attempts_ck" CHECK ("attempts" between 0 and 12),
  CONSTRAINT "fmcc_vende_license_outbox_state_ck" CHECK ("state" in ('pending','processing','delivered','blocked'))
);
--> statement-breakpoint
ALTER TABLE "fmcc_billing_vende_license_outbox" ADD CONSTRAINT "fmcc_vende_license_outbox_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."fmcc_billing_invoice"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_license_outbox_invoice_uq" ON "fmcc_billing_vende_license_outbox" USING btree ("tenant_id","invoice_id");
--> statement-breakpoint
CREATE INDEX "fmcc_vende_license_outbox_ready_idx" ON "fmcc_billing_vende_license_outbox" USING btree ("state","created_at");
