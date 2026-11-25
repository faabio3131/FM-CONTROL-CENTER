import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyStartGrowth } from './verify-iron-plan-change.mjs';

const gymId = 'gym-test', currency = 'BRL';
const day = n => '2026-12-' + String(n).padStart(2,'0') + 'T12:00:00Z';
const renewal = day(16), end = '2027-01-16T12:00:00Z';
function sample() {
  return {
    gymId, source: { gymId, id: 's', plan: 'START', originalRenewalAt: renewal, disabledAt: day(3), renewalEnabled: false },
    target: { gymId, id: 'g', plan: 'GROWTH', firstCycleEnd: end },
    authorization: { gymId, subscriptionId: 'g', currency, amountMinor: 29700, interval: 'monthly',
      firstChargeAt: renewal, acceptedAt: day(1), providerReference: 'auth' },
    invoice: { gymId, id: 'inv', issuedAt: day(1), currency, amountMinor: 15000, status: 'paid', fromSubscriptionId: 's', toSubscriptionId: 'g' },
    license: { gymId, plan: 'GROWTH', invoiceId: 'inv', paymentId: 'delta', activatedAt: day(2) },
    ledger: { gymId, complete: true, from: day(1), through: end, payments: [
      { providerPaymentId: 'delta', invoiceId: 'inv', kind: 'difference', status: 'paid', amountMinor: 15000, currency, at: day(2) },
      { providerPaymentId: 'new', subscriptionId: 'g', kind: 'renewal', status: 'paid', amountMinor: 29700, currency, at: renewal },
    ] },
  };
}
test('accepts the approved sequence in a synthetic cycle', () => verifyStartGrowth(sample()));
for (const [name, mutate] of [
  ['duplicate Start charge', e => e.ledger.payments.push({ ...e.ledger.payments[1], subscriptionId: 's', amountMinor: 14700 })],
  ['early Growth charge', e => { e.ledger.payments[1].at = day(4); }],
  ['license prior to payment', e => { e.license.activatedAt = day(1); }],
  ['incomplete cycle', e => { e.ledger.through = renewal; }],
  ['missing authorization', e => { e.authorization.providerReference = ''; }],
  ['source still enabled', e => { e.source.renewalEnabled = true; }],
]) test('rejects ' + name, () => { const e = sample(); mutate(e); assert.throws(() => verifyStartGrowth(e)); });
