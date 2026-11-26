ALTER TABLE fmcc_iron_plan_change_request ADD COLUMN retry_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE UNIQUE INDEX fmcc_iron_plan_change_one_active_per_gym ON fmcc_iron_plan_change_request
  (tenant_id,product_id,gym_id) WHERE status NOT IN ('completed','expired');
