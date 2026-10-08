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
  // Real competing connections: only one may claim an invoice.
  const product = await client.query("INSERT INTO fmcc_product_definition (tenant_id,slug,name) VALUES ('ci-tenant','ci-kordena','Kordena CI') RETURNING id");
  const customer = await client.query("INSERT INTO fmcc_billing_customer (tenant_id,external_customer_id) VALUES ('ci-tenant','ci-customer') RETURNING id");
  const account = await client.query("INSERT INTO fmcc_billing_gateway_account (tenant_id,provider,environment,label,secret_ref,status) VALUES ('ci-tenant','asaas','sandbox','ci','env://FMCC_ASAAS_SANDBOX_API_KEY','enabled') RETURNING id");
  const subscription = await client.query("INSERT INTO fmcc_billing_subscription (tenant_id,product_id,customer_id,plan_code) VALUES ('ci-tenant',$1,$2,'ci-plan') RETURNING id",[product.rows[0].id,customer.rows[0].id]);
  const invoice = await client.query("INSERT INTO fmcc_billing_invoice (tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor) VALUES ('ci-tenant',$1,$2,$3,$4,1990) RETURNING id",[product.rows[0].id,customer.rows[0].id,subscription.rows[0].id,account.rows[0].id]);
  const competitor = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await competitor.connect();
  try {
    const claim = "UPDATE fmcc_billing_invoice SET status='creating' WHERE tenant_id=$1 AND id=$2 AND status='pending' RETURNING id";
    const attempts = await Promise.all([client.query(claim,['ci-tenant',invoice.rows[0].id]),competitor.query(claim,['ci-tenant',invoice.rows[0].id])]);
    assert.deepEqual(attempts.map(r=>r.rowCount).sort(),[0,1],"Concurrent invoice claim allowed duplicate creation");
    const provider = await client.query("INSERT INTO fmcc_billing_provider_payment (tenant_id,invoice_id,gateway_account_id,external_payment_id) VALUES ('ci-tenant',$1,$2,'pay-ci-one') RETURNING id",[invoice.rows[0].id,account.rows[0].id]);
    let providerDuplicate = false;
    try {
      await competitor.query("INSERT INTO fmcc_billing_provider_payment (tenant_id,invoice_id,gateway_account_id,external_payment_id) VALUES ('ci-tenant',$1,$2,'pay-ci-two')",[invoice.rows[0].id,account.rows[0].id]);
    } catch (error) { providerDuplicate = error?.code === '23505'; }
    assert.ok(provider.rows[0].id);
    assert.equal(providerDuplicate,true,"Second provider payment for same invoice was accepted");
    console.log("PASS PostgreSQL 18: competing invoice claims and payment uniqueness");
  } finally {
    await competitor.end();
    await client.query("DELETE FROM fmcc_billing_provider_payment WHERE tenant_id='ci-tenant'");
    await client.query("DELETE FROM fmcc_billing_invoice WHERE tenant_id='ci-tenant'");
    await client.query("DELETE FROM fmcc_billing_subscription WHERE tenant_id='ci-tenant'");
    await client.query("DELETE FROM fmcc_billing_gateway_account WHERE tenant_id='ci-tenant'");
    await client.query("DELETE FROM fmcc_billing_customer WHERE tenant_id='ci-tenant'");
    await client.query("DELETE FROM fmcc_product_definition WHERE tenant_id='ci-tenant'");
  }
  console.log("PASS PostgreSQL 18: migrations 0000-0005, 7 billing tables, uniqueness and transactional rollback");
} finally {
  await client.end();
}
