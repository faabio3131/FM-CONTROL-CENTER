CREATE TABLE "fmcc_vende_payment_readback_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"snapshot_hash" text NOT NULL,
	"state" text NOT NULL,
	"reason" text,
	"actor_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "fmcc_vende_readback_attempt_state_ck" CHECK ("fmcc_vende_payment_readback_attempt"."state" in ('processing','recorded','needs_attention'))
);
--> statement-breakpoint
CREATE TABLE "fmcc_vende_payment_readback_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"gateway_account_id" uuid NOT NULL,
	"external_payment_ref" text NOT NULL,
	"provider_customer_ref" text NOT NULL,
	"source_ref" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fmcc_vende_payment_attestation" DROP CONSTRAINT "fmcc_vende_attestation_outcome_ck";--> statement-breakpoint
ALTER TABLE "fmcc_vende_payment_readback_attempt" ADD CONSTRAINT "fmcc_vende_readback_attempt_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."fmcc_billing_invoice"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fmcc_vende_payment_readback_binding" ADD CONSTRAINT "fmcc_vende_readback_binding_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."fmcc_billing_invoice"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_readback_attempt_operation_uq" ON "fmcc_vende_payment_readback_attempt" USING btree ("tenant_id","observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_readback_binding_invoice_uq" ON "fmcc_vende_payment_readback_binding" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
ALTER TABLE "fmcc_vende_payment_attestation" ADD CONSTRAINT "fmcc_vende_attestation_outcome_ck" CHECK ("fmcc_vende_payment_attestation"."outcome" in ('unpaid_verified','settled_verified','reversed_verified','needs_attention'));