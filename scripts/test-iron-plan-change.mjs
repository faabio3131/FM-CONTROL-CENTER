import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quoteIronPlanChange } from '../src/application/billing/iron-plan-change-quote.ts';
import { advanceIronPlanChange } from '../src/application/billing/iron-plan-change.ts';
import { Sandbox } from '../tests/fixtures/iron-plan-change-sandbox.mjs';
import { verifyStartGrowth } from './verify-iron-plan-change.mjs';

const mid = '2026-11-16T12:00:00.000Z';
const due = '2026-12-01T12:00:00.000Z';
const end = '2027-01-01T12:00:00.000Z';
const start = { planCode: 'START', interval: 'monthly', amountMinor: 14700 };
const growth = { planCode: 'GROWTH', interval: 'monthly', amountMinor: 29700 };

function scenario(t, from=start, to=growth) {
  const dir = mkdtempSync(join(tmpdir(), 'iron-change-'));
  const file = join(dir, 'sandbox.sqlite');
  let provider = new Sandbox(file, mid);
  t.after(() => { provider.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const c = { gymId: 'academia-ficticia', changeId: 'mudanca-1', sourceSubscriptionId: 'original',
    targetSubscriptionId: 'destino', quote: quoteIronPlanChange(from,to,{nextPaymentAt: due,observedAt: mid}) };
  provider.seed(c,from.amountMinor);
  return { c, get p() { return provider; },
    restart() { const saved = provider.time; provider.db.close(); provider = new Sandbox(file,saved); },
    step: () => advanceIronPlanChange(c, provider, new Date(provider.time)),
  };
}

test('Start → Growth, mid-cycle, repeated checkout, failed then paid, restart and a single renewal', async t => {
  const s = scenario(t), {c} = s;
  assert.equal(await s.step(), 'awaiting_authorization');
  assert.equal(s.p.rows('SELECT * FROM invoices').length,0);
  s.p.authorize(c);
  await Promise.all([s.step(),s.step()]);
  assert.equal(s.p.rows('SELECT * FROM invoices').length,1);
  const invoice = s.p.differenceInvoice(c,false);
  assert.equal(invoice.amountMinor,15000);
  s.p.settle(c,'failed');
  assert.equal(await s.step(),'awaiting_difference');
  assert.equal(s.p.rows('SELECT * FROM licenses').length,0);
  assert.equal(s.p.get('SELECT enabled FROM subscriptions WHERE id=?',c.sourceSubscriptionId).enabled,1);
  s.p.settle(c,'paid');
  const switchRenewal = s.p.replaceRenewal.bind(s.p);
  s.p.replaceRenewal = (...args) => { switchRenewal(...args); throw Error('simulated lost acknowledgement'); };
  await assert.rejects(s.step(),/lost acknowledgement/);
  s.restart();
  assert.equal(await s.step(),'renewal_scheduled');
  await Promise.all([s.step(),s.step()]);
  assert.equal(s.p.rows('SELECT * FROM licenses').length,1);
  s.p.clock('2026-12-01T11:59:59.999Z');
  assert.equal(s.p.rows('SELECT * FROM renewals').length,0);
  s.p.clock(due);
  s.p.clock(due);
  assert.equal(await s.step(),'completed');
  s.restart();
  s.p.clock(end);
  assert.equal(await s.step(),'completed');
  const auth = s.p.readAuthorization(c), payment = s.p.readPayment(invoice);
  const old = s.p.get('SELECT * FROM subscriptions WHERE id=?',c.sourceSubscriptionId);
  const license = s.p.get('SELECT * FROM licenses WHERE change_id=?',c.changeId);
  const renewals = s.p.rows('SELECT data FROM renewals').map(r=>JSON.parse(r.data));
  assert.deepEqual(renewals.map(r=>[r.subscriptionId,r.amountMinor]),[[c.targetSubscriptionId,29700]]);
  const {gymId} = c;
  verifyStartGrowth({ gymId,
    source: {gymId,id:old.id,plan:old.plan,originalRenewalAt:old.due,disabledAt:old.disabled_at,renewalEnabled:Boolean(old.enabled)},
    target: {gymId,id:c.targetSubscriptionId,plan:license.plan,firstCycleEnd:end},
    authorization: {...auth,subscriptionId:auth.targetSubscriptionId,providerReference:auth.reference},
    invoice: {...invoice,status:payment.status,fromSubscriptionId:old.id,toSubscriptionId:c.targetSubscriptionId},
    license: {gymId,plan:license.plan,invoiceId:payment.invoiceId,paymentId:license.payment,activatedAt:license.at},
    ledger: {gymId,complete:true,from:mid,through:s.p.time,payments:[
      {...payment,providerPaymentId:payment.id,kind:'difference',at:payment.paidAt},
      ...renewals.map(r=>({...r,status:'paid',kind:'renewal',at:r.paidAt,providerPaymentId:r.paymentId})),
    ]},
  });
});

test('Growth → Start only changes the license on the paid renewal', async t => {
  const s=scenario(t,growth,start); s.p.authorize(s.c);
  assert.equal(await s.step(),'renewal_scheduled');
  assert.equal(s.p.rows('SELECT * FROM invoices').length,0);
  assert.equal(s.p.rows('SELECT * FROM licenses').length,0);
  s.p.time=due;
  assert.equal(await s.step(),'awaiting_renewal');
  assert.equal(s.p.rows('SELECT * FROM licenses').length,0);
  s.p.clock(due);
  assert.equal(await s.step(),'completed');
  assert.equal(s.p.readTargetRenewal(s.c).amountMinor,14700);
  assert.equal(s.p.rows('SELECT plan FROM licenses')[0].plan,'START');
});

test('unpaid difference remains visible for late confirmation; the original plan renews exactly once', async t => {
  const s=scenario(t); s.p.authorize(s.c); await s.step();
  s.p.clock(due);
  assert.equal(await s.step(),'awaiting_late_settlement');
  assert.throws(()=>s.p.settle(s.c,'paid'),/expired/);
  assert.equal(s.p.rows('SELECT * FROM licenses').length,0);
  const [r]=s.p.rows('SELECT data FROM renewals');
  assert.equal(JSON.parse(r.data).amountMinor,14700);
});

test('competing changes for the same subscription/cycle are refused', async t => {
  const s=scenario(t); await s.step();
  await assert.rejects(advanceIronPlanChange({...s.c,changeId:'other'},s.p,new Date(mid)), /UNIQUE/);
});

test('a payment from another gym or for the wrong amount cannot grant access', async t => {
  const s=scenario(t); s.p.authorize(s.c); await s.step(); s.p.settle(s.c,'paid');
  const p=s.p.readPayment(s.p.differenceInvoice(s.c,false));
  for (const invalid of [{...p,gymId:'other'},{...p,amountMinor:1},{...p,paidAt:due}]) {
    s.p.readPayment=()=>invalid;
    await assert.rejects(s.step(),/payment_mismatch/);
  }
  assert.equal(s.p.rows('SELECT * FROM licenses').length,0);
});

test('wrong authorization date cannot open a difference invoice', async t => {
  const s=scenario(t); s.p.authorize(s.c);
  const auth=s.p.readAuthorization(s.c);
  s.p.readAuthorization=()=>({...auth,firstChargeAt:mid});
  await assert.rejects(s.step(),/authorization_mismatch/);
  assert.equal(s.p.rows('SELECT * FROM invoices').length,0);
});

test('a delayed switch after Start already renewed requires reconciliation', async t => {
  const s=scenario(t); s.p.authorize(s.c); await s.step(); s.p.settle(s.c,'paid');
  s.p.replaceRenewal=()=>{ throw Error('offline'); };
  await assert.rejects(s.step(),/offline/);
  s.restart(); s.p.clock(due);
  await assert.rejects(s.step(),/requires reconciliation/);
  assert.deepEqual(s.p.rows('SELECT subscription FROM renewals').map(r=>r.subscription),[s.c.sourceSubscriptionId]);
  assert.equal(s.p.rows('SELECT * FROM licenses').length,0);
});

test('replayed instructions cannot change the price or subscription on an existing operation', async t => {
  const s=scenario(t); await s.step();
  await assert.rejects(advanceIronPlanChange({...s.c,targetSubscriptionId:'different'},s.p,new Date(mid)),/conflict/);
  await assert.rejects(advanceIronPlanChange({...s.c,quote:{...s.c.quote,amountDueNowMinor:100}},s.p,new Date(mid)),/conflict/);
});

test('restart after a successful switch and failed license delivery converges across the due date', async t => {
  const s=scenario(t); s.p.authorize(s.c); await s.step(); s.p.settle(s.c,'paid');
  s.p.applyLicense=()=>{ throw Error('license offline'); };
  await assert.rejects(s.step(),/license offline/);
  s.restart(); s.p.clock(due);
  assert.equal(await s.step(),'completed');
  assert.equal(s.p.rows('SELECT * FROM licenses').length,1);
  assert.deepEqual(s.p.rows('SELECT subscription FROM renewals').map(r=>r.subscription),[s.c.targetSubscriptionId]);
});

test('a payment confirmed before the deadline but observed afterwards is retained for reconciliation', async t => {
  const s=scenario(t); s.p.authorize(s.c); await s.step();
  s.p.time=new Date(Date.parse(due)-2000).toISOString(); s.p.settle(s.c,'paid');
  const read=s.p.readPayment.bind(s.p);
  s.p.readPayment=()=>null;
  s.p.clock(new Date(Date.parse(due)+1000).toISOString());
  assert.equal(await s.step(),'awaiting_late_settlement');
  s.p.readPayment=read;
  s.p.time=new Date(Date.parse(due)+3000).toISOString();
  await assert.rejects(s.step(),/requires reconciliation/);
  assert.equal(s.p.rows('SELECT * FROM licenses').length,0);
});

test('the same payment cannot settle both the difference and the recurring invoice', async t => {
  const s=scenario(t); s.p.authorize(s.c); await s.step(); s.p.settle(s.c,'paid'); await s.step();
  s.p.clock(due);
  const renewal=s.p.readTargetRenewal(s.c);
  const payment=s.p.readPayment(s.p.differenceInvoice(s.c,false));
  s.p.readTargetRenewal=()=>({...renewal,paymentId:payment.id});
  await assert.rejects(s.step(),/renewal_mismatch/);
});
