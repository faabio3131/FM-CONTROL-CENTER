CREATE TABLE "fmcc_billing_gateway_secret" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"key_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fmcc_billing_gateway_secret" ADD CONSTRAINT "fmcc_billing_gateway_secret_account_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."fmcc_billing_gateway_account"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fmcc_billing_gateway_secret_tenant_idx" ON "fmcc_billing_gateway_secret" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "fmcc_billing_gateway_secret" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fmcc_billing_gateway_secret" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "fmcc_billing_gateway_secret_tenant_isolation" ON "fmcc_billing_gateway_secret" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));
