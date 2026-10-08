CREATE TABLE "fmcc_billing_customer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"display_name" text NOT NULL,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE "fmcc_billing_gateway_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider_code" text NOT NULL,
	"environment" text NOT NULL,
	"credential_ref" text NOT NULL,
	"public_label" text NOT NULL,
	"status" text DEFAULT 'disabled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE "fmcc_billing_invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"gateway_account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE "fmcc_billing_license" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"grace_ends_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE "fmcc_billing_payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"gateway_account_id" uuid NOT NULL,
	"external_payment_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE "fmcc_billing_provider_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"gateway_account_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL
);

--> statement-breakpoint

CREATE TABLE "fmcc_billing_subscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"plan_code" text NOT NULL,
	"authority" text DEFAULT 'direct' NOT NULL,
	"external_subscription_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_customer_tenant_id_uq" ON "fmcc_billing_customer" USING btree ("tenant_id","id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_gateway_account_tenant_id_uq" ON "fmcc_billing_gateway_account" USING btree ("tenant_id","id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_invoice_tenant_id_uq" ON "fmcc_billing_invoice" USING btree ("tenant_id","id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_invoice_receiver_uq" ON "fmcc_billing_invoice" USING btree ("tenant_id","id","gateway_account_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_license_tenant_subscription_uq" ON "fmcc_billing_license" USING btree ("tenant_id","subscription_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_payment_provider_ref_uq" ON "fmcc_billing_payment" USING btree ("tenant_id","gateway_account_id","external_payment_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_event_dedupe_uq" ON "fmcc_billing_provider_event" USING btree ("tenant_id","gateway_account_id","provider_event_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_subscription_tenant_id_uq" ON "fmcc_billing_subscription" USING btree ("tenant_id","id");
--> statement-breakpoint

CREATE UNIQUE INDEX "fmcc_billing_subscription_attribution_uq" ON "fmcc_billing_subscription" USING btree ("tenant_id","id","customer_id","product_code");
--> statement-breakpoint

ALTER TABLE "fmcc_billing_invoice" ADD CONSTRAINT "fmcc_billing_invoice_subscription_fk" FOREIGN KEY ("tenant_id","subscription_id","customer_id","product_code") REFERENCES "public"."fmcc_billing_subscription"("tenant_id","id","customer_id","product_code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "fmcc_billing_invoice" ADD CONSTRAINT "fmcc_billing_invoice_gateway_fk" FOREIGN KEY ("tenant_id","gateway_account_id") REFERENCES "public"."fmcc_billing_gateway_account"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "fmcc_billing_license" ADD CONSTRAINT "fmcc_billing_license_subscription_fk" FOREIGN KEY ("tenant_id","subscription_id") REFERENCES "public"."fmcc_billing_subscription"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "fmcc_billing_payment" ADD CONSTRAINT "fmcc_billing_payment_invoice_receiver_fk" FOREIGN KEY ("tenant_id","invoice_id","gateway_account_id") REFERENCES "public"."fmcc_billing_invoice"("tenant_id","id","gateway_account_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "fmcc_billing_provider_event" ADD CONSTRAINT "fmcc_billing_event_gateway_fk" FOREIGN KEY ("tenant_id","gateway_account_id") REFERENCES "public"."fmcc_billing_gateway_account"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "fmcc_billing_subscription" ADD CONSTRAINT "fmcc_billing_subscription_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."fmcc_billing_customer"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "fmcc_billing_gateway_account_tenant_provider_idx" ON "fmcc_billing_gateway_account" USING btree ("tenant_id","provider_code");
--> statement-breakpoint

CREATE INDEX "fmcc_billing_invoice_tenant_subscription_idx" ON "fmcc_billing_invoice" USING btree ("tenant_id","subscription_id");
--> statement-breakpoint

CREATE INDEX "fmcc_billing_license_tenant_state_idx" ON "fmcc_billing_license" USING btree ("tenant_id","state");
--> statement-breakpoint

CREATE INDEX "fmcc_billing_payment_tenant_invoice_idx" ON "fmcc_billing_payment" USING btree ("tenant_id","invoice_id");
--> statement-breakpoint

CREATE INDEX "fmcc_billing_subscription_tenant_customer_idx" ON "fmcc_billing_subscription" USING btree ("tenant_id","customer_id");
-- Billing tenant isolation: RLS denies all access unless request scope is established.
-- Runtime must set app.billing_tenant_id transaction-locally, with a non-bypass DB role.

--> statement-breakpoint

ALTER TABLE "fmcc_billing_customer" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE "fmcc_billing_customer" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY "fmcc_billing_customer_tenant_isolation" ON "fmcc_billing_customer" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));

--> statement-breakpoint

ALTER TABLE "fmcc_billing_gateway_account" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE "fmcc_billing_gateway_account" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY "fmcc_billing_gateway_account_tenant_isolation" ON "fmcc_billing_gateway_account" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));

--> statement-breakpoint

ALTER TABLE "fmcc_billing_subscription" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE "fmcc_billing_subscription" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY "fmcc_billing_subscription_tenant_isolation" ON "fmcc_billing_subscription" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));

--> statement-breakpoint

ALTER TABLE "fmcc_billing_license" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE "fmcc_billing_license" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY "fmcc_billing_license_tenant_isolation" ON "fmcc_billing_license" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));

--> statement-breakpoint

ALTER TABLE "fmcc_billing_invoice" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE "fmcc_billing_invoice" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY "fmcc_billing_invoice_tenant_isolation" ON "fmcc_billing_invoice" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));

--> statement-breakpoint

ALTER TABLE "fmcc_billing_payment" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE "fmcc_billing_payment" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY "fmcc_billing_payment_tenant_isolation" ON "fmcc_billing_payment" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));

--> statement-breakpoint

ALTER TABLE "fmcc_billing_provider_event" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

ALTER TABLE "fmcc_billing_provider_event" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

CREATE POLICY "fmcc_billing_provider_event_tenant_isolation" ON "fmcc_billing_provider_event" USING ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), '')) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.billing_tenant_id', true), ''));

--> statement-breakpoint

ALTER TABLE "fmcc_billing_invoice" ADD CONSTRAINT "fmcc_billing_invoice_valid_period" CHECK (period_end > period_start);

--> statement-breakpoint

ALTER TABLE "fmcc_billing_invoice" ADD CONSTRAINT "fmcc_billing_invoice_positive_amount" CHECK (amount_minor >= 0);

--> statement-breakpoint

ALTER TABLE "fmcc_billing_payment" ADD CONSTRAINT "fmcc_billing_payment_positive_amount" CHECK (amount_minor >= 0);

--> statement-breakpoint

ALTER TABLE "fmcc_billing_license" ADD CONSTRAINT "fmcc_billing_license_positive_version" CHECK (version > 0);

--> statement-breakpoint

ALTER TABLE "fmcc_billing_license" ADD CONSTRAINT "fmcc_billing_license_valid_period" CHECK (valid_until > valid_from);

