import assert from "node:assert/strict";
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const version = await client.query("SHOW server_version");
  assert.match(version.rows[0].server_version, /^18\./);
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'fmcc_billing_%' ORDER BY tablename");
  assert.equal(tables.rowCount, 7, "Expected all seven Billing tables");
  const migrations = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
  assert.equal(migrations.rows[0].n, 6, "Expected migrations 0000-0005");
  const idx = await client.query("SELECT indexname FROM pg_indexes WHERE tablename='fmcc_billing_provider_payment' AND indexname='fmcc_billing_provider_invoice_uq'");
  assert.equal(idx.rowCount, 1, "Missing one-payment-per-invoice index");
  // Verify that a real PostgreSQL transaction rolls back on failure.
  await client.query("BEGIN");
  await client.query("INSERT INTO fmcc_billing_customer (tenant_id, external_customer_id) VALUES ($1,$2)", ["homologation", "ci-rollback-probe"]);
  await client.query("ROLLBACK");
  const rollback = await client.query("SELECT count(*)::int AS n FROM fmcc_billing_customer WHERE tenant_id=$1 AND external_customer_id=$2", ["homologation", "ci-rollback-probe"]);
  assert.equal(rollback.rows[0].n, 0, "Rollback did not remove test record");
  // A unique tenant/customer external identity must be enforced by the database.
  await client.query("BEGIN");
  await client.query("INSERT INTO fmcc_billing_customer (tenant_id, external_customer_id) VALUES ($1,$2)", ["homologation", "ci-duplicate-probe"]);
  let duplicateRejected = false;
  await client.query("SAVEPOINT duplicate_attempt");
  try {
    await client.query("INSERT INTO fmcc_billing_customer (tenant_id, external_customer_id) VALUES ($1,$2)", ["homologation", "ci-duplicate-probe"]);
  } catch (error) {
    duplicateRejected = error?.code === "23505";
    await client.query("ROLLBACK TO SAVEPOINT duplicate_attempt");
  }
  assert.equal(duplicateRejected, true, "Unique customer identity not enforced");
  await client.query("ROLLBACK");
  console.log("PASS PostgreSQL 18: migrations 0000-0005, 7 billing tables, uniqueness and transactional rollback");
} finally {
  await client.end();
}
