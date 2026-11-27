ALTER TABLE fmcc_billing_subscription
  ADD COLUMN supersedes_subscription_id uuid,
  ADD COLUMN provider_cancel_status text,
  ADD COLUMN provider_cancel_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN provider_cancel_error text,
  ADD COLUMN provider_cancel_next_at timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX fmcc_billing_sub_one_upgrade_uq ON fmcc_billing_subscription
  (tenant_id, product_id, supersedes_subscription_id) WHERE supersedes_subscription_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX fmcc_billing_sub_provider_cancel_due ON fmcc_billing_subscription
  (tenant_id, product_id, provider_cancel_next_at) WHERE provider_cancel_status = 'pending';
