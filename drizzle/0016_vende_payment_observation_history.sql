DROP INDEX "fmcc_vende_payment_attestation_ref_uq";--> statement-breakpoint
ALTER TABLE "fmcc_vende_payment_attestation" ADD COLUMN "observation_sequence" bigserial NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fmcc_vende_payment_observation_uq" ON "fmcc_vende_payment_attestation" USING btree ("tenant_id","invoice_id","external_payment_ref","source_ref");