import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function requireEvidence(condition, field) {
  if (!condition) throw new Error('Evidência ausente ou divergente: ' + field);
}

function instant(raw) {
  requireEvidence(typeof raw === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(raw) &&
    Number.isFinite(Date.parse(raw)), 'data com fuso horário');
  return Date.parse(raw);
}

// Check normalized exports. Provenance and completeness of those exports must
// be established by the operator collecting them from the three systems.
export function verifyStartGrowth(e) {
  const { invoice, authorization, license, source, target, ledger } = e;
  const id = v => typeof v === 'string' && v.trim().length > 0;
  requireEvidence(id(e.gymId) && [invoice, authorization, license, source, target, ledger]
    .every(record => record?.gymId === e.gymId), 'academia');
  requireEvidence([source.id, target.id, invoice.id].every(id) && source.id !== target.id &&
    source.plan === 'START' && target.plan === 'GROWTH', 'assinaturas');
  const renewal = instant(source.originalRenewalAt);
  requireEvidence(authorization.subscriptionId === target.id && authorization.amountMinor === 29700 &&
    authorization.currency === 'BRL' && authorization.interval === 'monthly' &&
    instant(authorization.firstChargeAt) === renewal && id(authorization.providerReference), 'nova autorização');
  requireEvidence(invoice.currency === 'BRL' && invoice.amountMinor === 15000 &&
    invoice.status === 'paid' && invoice.fromSubscriptionId === source.id &&
    invoice.toSubscriptionId === target.id, 'fatura diferencial');
  const start = Math.min(instant(authorization.acceptedAt), instant(invoice.issuedAt));
  requireEvidence(ledger.complete === true && instant(ledger.from) <= start &&
    instant(ledger.through) >= instant(target.firstCycleEnd) && instant(target.firstCycleEnd) > renewal,
    'extrato integral até o fim do primeiro ciclo Growth');
  requireEvidence(instant(source.disabledAt) < renewal && source.renewalEnabled === false,
    'fim da recorrência Start');
  requireEvidence(Array.isArray(ledger.payments), 'pagamentos');
  const paid = ledger.payments.filter(p => p.status === 'paid' &&
    instant(p.at) >= start && instant(p.at) < instant(target.firstCycleEnd));
  requireEvidence(paid.length === 2 && paid.every(p => id(p.providerPaymentId) && p.currency === 'BRL') &&
    paid[0].providerPaymentId !== paid[1].providerPaymentId, 'duas cobranças distintas no período');
  const delta = paid.find(p => p.invoiceId === invoice.id && p.kind === 'difference' && p.amountMinor === 15000);
  const first = paid.find(p => p.subscriptionId === target.id && p.kind === 'renewal' && p.amountMinor === 29700);
  requireEvidence(delta && first && instant(authorization.acceptedAt) <= instant(delta.at) &&
    instant(invoice.issuedAt) <= instant(delta.at) && instant(delta.at) < renewal && instant(first.at) >= renewal, 'pagamento e renovação');
  requireEvidence(license.plan === 'GROWTH' && license.invoiceId === invoice.id &&
    license.paymentId === delta.providerPaymentId && instant(license.activatedAt) >= instant(delta.at) &&
    instant(license.activatedAt) < renewal, 'licença vinculada ao pagamento');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyStartGrowth(JSON.parse(await readFile(process.argv[2], 'utf8')));
  console.log('Sequência consistente nos extratos fornecidos.');
}
