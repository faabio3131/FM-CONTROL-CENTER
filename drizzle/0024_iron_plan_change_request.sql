CREATE TABLE fmcc_iron_plan_change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  product_id uuid NOT NULL,
  gym_id uuid NOT NULL,
  source_subscription_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  target_plan text NOT NULL,
  renewal_at timestamptz NOT NULL,
  terms_hash text NOT NULL,
  quote jsonb NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_authorization',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, gym_id, source_subscription_id, renewal_at),
  FOREIGN KEY (tenant_id,product_id) REFERENCES fmcc_product_definition(tenant_id,id)
);
