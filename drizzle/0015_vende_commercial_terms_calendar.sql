CREATE TABLE "fmcc_vende_contract_terms" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" text NOT NULL,
 "product_id" uuid NOT NULL,
 "subscription_id" uuid NOT NULL,
 "customer_id" uuid NOT NULL,
 "revision" integer DEFAULT 1 NOT NULL,
 "effective_from" date NOT NULL,
 "paid_through" date NOT NULL,
 "due_date" date NOT NULL,
 "auto_renew" boolean DEFAULT false NOT NULL,
 "lifecycle_state" text DEFAULT 'active' NOT NULL,
 "calendar_region" text DEFAULT 'BR-SP' NOT NULL,
 "source_ref" text NOT NULL,
 "actor_id" text NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "fmcc_vende_terms_dates_ck" CHECK ("paid_through" >= "effective_from"),
 CONSTRAINT "fmcc_vende_terms_revision_ck" CHECK ("revision" > 0),
 CONSTRAINT "fmcc_vende_terms_state_ck" CHECK ("lifecycle_state" in ('active','past_due','suspended','cancel_at_period_end','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "fmcc_vende_contract_terms" ADD CONSTRAINT "fmcc_vende_terms_subscription_fk" FOREIGN KEY ("tenant_id","subscription_id","product_id","customer_id") REFERENCES "public"."fmcc_billing_subscription"("tenant_id","id","product_id","customer_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_terms_subscription_uq" ON "fmcc_vende_contract_terms" USING btree ("tenant_id","subscription_id");
--> statement-breakpoint
CREATE INDEX "fmcc_vende_terms_due_idx" ON "fmcc_vende_contract_terms" USING btree ("tenant_id","due_date","lifecycle_state");
--> statement-breakpoint
CREATE TABLE "fmcc_vende_contract_term_audit" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" text NOT NULL,
 "subscription_id" uuid NOT NULL,
 "revision" integer NOT NULL,
 "operation_id" text NOT NULL,
 "action" text NOT NULL,
 "actor_id" text NOT NULL,
 "previous_state" text,
 "new_state" text NOT NULL,
 "effective_date" date NOT NULL,
 "source_ref" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_term_audit_revision_uq" ON "fmcc_vende_contract_term_audit" USING btree ("tenant_id","subscription_id","revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_term_audit_operation_uq" ON "fmcc_vende_contract_term_audit" USING btree ("tenant_id","operation_id");
--> statement-breakpoint
CREATE TABLE "fmcc_vende_business_calendar" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" text NOT NULL,
 "product_id" uuid NOT NULL,
 "region" text NOT NULL,
 "revision" integer NOT NULL,
 "valid_from" date NOT NULL,
 "valid_through" date NOT NULL,
 "holidays" jsonb NOT NULL,
 "source_ref" text NOT NULL,
 "actor_id" text NOT NULL,
 "approved_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "fmcc_vende_calendar_revision_ck" CHECK ("revision" > 0),
 CONSTRAINT "fmcc_vende_calendar_validity_ck" CHECK ("valid_through" >= "valid_from")
);
--> statement-breakpoint
ALTER TABLE "fmcc_vende_business_calendar" ADD CONSTRAINT "fmcc_vende_calendar_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."fmcc_product_definition"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_calendar_region_revision_uq" ON "fmcc_vende_business_calendar" USING btree ("tenant_id","product_id","region","revision");
--> statement-breakpoint
CREATE TABLE "fmcc_vende_lifecycle_command" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" text NOT NULL,
 "product_id" uuid NOT NULL,
 "subscription_id" uuid NOT NULL,
 "customer_id" uuid NOT NULL,
 "operation_id" text NOT NULL,
 "expected_revision" integer NOT NULL,
 "revision" integer NOT NULL,
 "action" text NOT NULL,
 "state" text DEFAULT 'pending' NOT NULL,
 "external_tenant_id" text NOT NULL,
 "effective_date" date NOT NULL,
 "source_ref" text NOT NULL,
 "actor_id" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "claimed_at" timestamp with time zone,
 "delivered_at" timestamp with time zone,
 CONSTRAINT "fmcc_vende_lifecycle_revision_ck" CHECK ("expected_revision">0 and "revision">"expected_revision"),
 CONSTRAINT "fmcc_vende_lifecycle_action_ck" CHECK ("action" in ('SUSPEND_DELINQUENCY','SCHEDULE_CANCEL','REACTIVATE_VERIFIED','APPLY_DOWNGRADE','APPLY_UPGRADE','RENEW_VERIFIED')),
 CONSTRAINT "fmcc_vende_lifecycle_state_ck" CHECK ("state" in ('pending','processing','delivered','blocked','unknown'))
);
--> statement-breakpoint
ALTER TABLE "fmcc_vende_lifecycle_command" ADD CONSTRAINT "fmcc_vende_lifecycle_subscription_fk" FOREIGN KEY ("tenant_id","subscription_id","product_id","customer_id") REFERENCES "public"."fmcc_billing_subscription"("tenant_id","id","product_id","customer_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_lifecycle_operation_uq" ON "fmcc_vende_lifecycle_command" USING btree ("tenant_id","operation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_lifecycle_revision_uq" ON "fmcc_vende_lifecycle_command" USING btree ("tenant_id","subscription_id","revision");
--> statement-breakpoint
CREATE INDEX "fmcc_vende_lifecycle_ready_idx" ON "fmcc_vende_lifecycle_command" USING btree ("state","created_at");
--> statement-breakpoint
CREATE TABLE "fmcc_vende_payment_attestation" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" text NOT NULL,
 "invoice_id" uuid NOT NULL,
 "external_payment_ref" text NOT NULL,
 "outcome" text NOT NULL,
 "verified_at" timestamp with time zone NOT NULL,
 "source_ref" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "fmcc_vende_attestation_outcome_ck" CHECK ("outcome" in ('unpaid_verified','settled_verified','reversed_verified'))
);
--> statement-breakpoint
ALTER TABLE "fmcc_vende_payment_attestation" ADD CONSTRAINT "fmcc_vende_attestation_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."fmcc_billing_invoice"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_payment_attestation_ref_uq" ON "fmcc_vende_payment_attestation" USING btree ("tenant_id","invoice_id","external_payment_ref");
--> statement-breakpoint
CREATE INDEX "fmcc_vende_attestation_fresh_idx" ON "fmcc_vende_payment_attestation" USING btree ("tenant_id","invoice_id","verified_at");