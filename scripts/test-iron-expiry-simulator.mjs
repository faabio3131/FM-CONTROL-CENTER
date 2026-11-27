import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { Sandbox } from '../tests/fixtures/iron-plan-change-sandbox.mjs';
import { quoteIronPlanChange } from '../src/application/billing/iron-plan-change-quote.ts';

// The worker uses the injected SQLite invoice provider here. Fail if it attempts
// to post a renewal or consult the PostgreSQL ledger in either unpaid scenario.
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === './iron-plan-change')
    return next(new URL('../src/application/billing/iron-plan-change.ts', import.meta.url).href, context);
  if (specifier.startsWith('@/infrastructure/billing/iron-plan-change-'))
    return { shortCircuit:true, url:'data:text/javascript,export function differenceInvoice(){throw Error("unexpected invoice fallback")} export function postPlanChange(){throw Error("unexpected ledger posting")}' };
  return next(specifier, context);
}});
const {processDueIronPlanChange} = await import('../src/application/billing/iron-plan-change-worker.ts');
hooks.deregister();
const migration = readFileSync(new URL('../drizzle/0025_iron_change_reconciliation.sql', import.meta.url),'utf8');
const index = migration.slice(migration.indexOf('CREATE UNIQUE INDEX'));
const due = '2026-12-01T12:00:00.000Z';
const initial = '2026-11-16T12:00:00.000Z';
const scope = {tenantId:'tenant-test',productId:'iron-test'};

for (const confirmed of [true,false]) test(confirmed ? 'confirmed unpaid expiry releases next cycle' : 'uncertain payment reserves gym for reconciliation', async t => {
  const provider = new Sandbox(':memory:',initial);
  t.after(()=>provider.db.close());
  provider.db.exec(`CREATE TABLE fmcc_iron_plan_change_request(id TEXT PRIMARY KEY,tenant_id TEXT,
    product_id TEXT,gym_id TEXT,status TEXT,last_error TEXT); ${index}`);
  const quote = quoteIronPlanChange({planCode:'START',interval:'monthly',amountMinor:14700},
    {planCode:'GROWTH',interval:'monthly',amountMinor:29700},{nextPaymentAt:due,observedAt:initial});
  const change = {gymId:'gym-test',changeId:'first',sourceSubscriptionId:'start',targetSubscriptionId:'growth',quote};
  const insert = id => provider.run('INSERT INTO fmcc_iron_plan_change_request VALUES(?,?,?,?,?,NULL)',
    id,scope.tenantId,scope.productId,change.gymId,'awaiting_authorization');
  insert(change.changeId);
  provider.seed(change,14700);
  provider.authorize(change);
  // Adapt only claim, lease and writeback for the SQLite rehearsal. Persist the
  // status selected by the actual worker and enforce the actual migration index.
  const db = {
    query(sql,args) {
      if (sql.includes('WITH candidate')) {
        const saved = provider.get('SELECT * FROM fmcc_iron_plan_change_request WHERE id=?',change.changeId);
        return {rowCount:1,rows:[{...saved,source_subscription_id:'start',target_subscription_id:'growth',
          quote,renewal_at:new Date(due),retry_count:0,lease_token:'test-lease'}]};
      }
      assert.ok(sql.includes('retry_count=retry_count+1'));
      assert.equal(args[4],true);
      provider.run("UPDATE fmcc_iron_plan_change_request SET status='reconciliation_required',last_error=? WHERE id=?",args[3],args[0]);
      return {rowCount:1};
    },
    connect() {return {
      query(sql,args) {
        if (args) {
          assert.ok(sql.includes('SET status=$3'));
          provider.run('UPDATE fmcc_iron_plan_change_request SET status=? WHERE id=?',args[2],args[0]);
        } else provider.db.exec(sql);
        return {rowCount:1};
      },release() {}
    };}
  };
  const step = time => {provider.time=time;return processDueIronPlanChange(db,scope,provider,new Date(time));};
  assert.equal(await step(initial),'awaiting_difference');
  assert.equal(await step(due),'awaiting_late_settlement');
  assert.throws(()=>insert('next'),/UNIQUE/);
  const inv = provider.differenceInvoice(change,false);
  if (confirmed) provider.confirmUnpaidExpiry(inv);
  assert.equal(await step('2026-12-02T11:59:59.999Z'),'awaiting_late_settlement');
  const expected = confirmed ? 'expired' : 'reconciliation_required';
  assert.equal(await step('2026-12-02T12:00:00.000Z'),expected);
  const saved = provider.get('SELECT status,last_error FROM fmcc_iron_plan_change_request WHERE id=?','first');
  assert.equal(saved.status,expected);
  if (confirmed) {
    insert('next');
    assert.equal(provider.get("SELECT status FROM fmcc_iron_plan_change_request WHERE id='next'").status,'awaiting_authorization');
  } else {
    assert.equal(saved.last_error,'iron.change_late_settlement_review');
    assert.throws(()=>insert('next'),/UNIQUE/);
  }
  assert.equal(provider.rows('SELECT * FROM licenses').length,0);
  assert.equal(provider.get("SELECT enabled FROM subscriptions WHERE id='start'").enabled,1);
  assert.equal(provider.rows("SELECT * FROM subscriptions WHERE id='growth'").length,0);
});
