-- Durable HMAC-authenticated Cakto observations; no raw payload, secrets or PII.
CREATE TABLE fmcc_iron_cakto_readback_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  product_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('recurring','ai_credits')),
  invoice_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  source_event text NOT NULL CHECK(source_event IN ('purchase_approved','subscription_renewed','subscription_late_recovered','refund','chargeback','subscription_canceled','subscription_late','subscription_renewal_refused')),
  observation jsonb NOT NULL,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','applied','duplicate','ignored','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 12),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claim_token uuid,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_id,scope,invoice_id,payment_id,source_event),
  FOREIGN KEY(tenant_id,product_id) REFERENCES fmcc_product_definition(tenant_id,id)
);
--> statement-breakpoint
CREATE INDEX fmcc_iron_cakto_readback_ready_idx ON fmcc_iron_cakto_readback_inbox(tenant_id,product_id,status,available_at,created_at);
