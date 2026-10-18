CREATE TABLE "fmcc_assistant_plan_revision" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "product_id" uuid NOT NULL,
  "plan_code" text NOT NULL,
  "revision" integer NOT NULL,
  "label" text NOT NULL,
  "billing_interval" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "allowances" jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "actor_id" text NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fmcc_assistant_plan_revision_positive_ck" CHECK ("revision" > 0),
  CONSTRAINT "fmcc_assistant_plan_price_positive_ck" CHECK ("amount_minor" > 0),
  CONSTRAINT "fmcc_assistant_plan_status_ck" CHECK ("status" IN ('draft','published','retired')),
  CONSTRAINT "fmcc_assistant_plan_currency_ck" CHECK ("currency" = 'BRL'),
  CONSTRAINT "fmcc_assistant_plan_interval_ck" CHECK ("billing_interval" IN ('monthly','yearly'))
);
--> statement-breakpoint
ALTER TABLE "fmcc_assistant_plan_revision" ADD CONSTRAINT "fmcc_assistant_plan_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."fmcc_product_definition"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_assistant_plan_rev_scope_uq" ON "fmcc_assistant_plan_revision" USING btree ("tenant_id","product_id","plan_code","revision");
--> statement-breakpoint
CREATE INDEX "fmcc_assistant_plan_product_idx" ON "fmcc_assistant_plan_revision" USING btree ("tenant_id","product_id","status");