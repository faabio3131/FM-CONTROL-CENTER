import type { quoteIronPlanChange } from './iron-plan-change-quote';

type Quote = ReturnType<typeof quoteIronPlanChange>;
export type PlanChange = {
  gymId: string;
  changeId: string;
  sourceSubscriptionId: string;
  targetSubscriptionId: string;
  quote: Quote;
};
export type Authorization = {
  gymId: string; targetSubscriptionId: string; reference: string;
  amountMinor: number; currency: string; interval: string; firstChargeAt: string;
  acceptedAt: string;
};
export type Invoice = { id: string; gymId: string; changeId: string; amountMinor: number; currency: string };
export type Payment = {
  id: string; gymId: string; invoiceId: string; amountMinor: number; currency: string;
  status: 'pending' | 'failed' | 'paid'; paidAt: string | null;
};
export interface IronPlanChangePorts {
  // Implementations serialize competing changes for the same gym/source/cycle.
  // The same immutable change and each effect can be replayed after a process restart.
  bindChange(change: PlanChange): Promise<void>;
  readAuthorization(change: PlanChange): Promise<Authorization | null>;
  differenceInvoice(change: PlanChange, allowCreate: boolean): Promise<Invoice | null>;
  readPayment(invoice: Invoice): Promise<Payment | null>;
  applyLicense(change: PlanChange, paymentId: string): Promise<void>;
  // Replace only the expected source schedule. Enforce one payable plan at
  // renewal, including when the previous call succeeded but lost its response.
  replaceRenewal(change: PlanChange, authorization: Authorization, allowSwitch: boolean): Promise<void>;
  readTargetRenewal(change: PlanChange): Promise<{
    gymId: string; subscriptionId: string; paymentId: string; amountMinor: number;
    currency: string; periodStart: string; paidAt: string;
  } | null>;
}

export async function advanceIronPlanChange(change: PlanChange, ports: IronPlanChangePorts, now: Date) {
  const { quote } = change;
  const terms = quote.targetRecurrence;
  const due = Date.parse(terms.firstChargeAt ?? '');
  const time = now.getTime();
  if (!Number.isFinite(due) || !Number.isFinite(time) ||
      !change.gymId || !change.changeId || !change.sourceSubscriptionId || !change.targetSubscriptionId ||
      change.sourceSubscriptionId === change.targetSubscriptionId) throw new Error('iron.change_invalid');

  await ports.bindChange(change);
  const auth = await ports.readAuthorization(change);
  if (!auth) return 'awaiting_authorization';
  const accepted = Date.parse(auth.acceptedAt);
  if (!auth.reference || auth.gymId !== change.gymId ||
      auth.targetSubscriptionId !== change.targetSubscriptionId || auth.currency !== quote.currency ||
      auth.amountMinor !== terms.amountMinor || auth.interval !== terms.interval ||
      Date.parse(auth.firstChargeAt) !== due || !Number.isFinite(accepted) || accepted > time ||
      accepted >= due) throw new Error('iron.change_authorization_mismatch');

  let differencePaymentId: string | undefined;
  if (quote.effectiveOn === 'DIFFERENCE_PAYMENT_CONFIRMED') {
    // On/after the boundary, the adapter may reopen the original invoice but
    // must reject creation of an expired quote or collection after its deadline.
    const invoice = await ports.differenceInvoice(change, time < due);
    if (!invoice && time >= due) return 'expired';
    if (!invoice || !invoice.id || invoice.gymId !== change.gymId || invoice.changeId !== change.changeId ||
        invoice.amountMinor !== quote.amountDueNowMinor || invoice.currency !== quote.currency)
      throw new Error('iron.change_invoice_mismatch');
    const payment = await ports.readPayment(invoice);
    if (!payment || payment.status !== 'paid') return time >= due ? 'awaiting_late_settlement' : 'awaiting_difference';
    const paid = Date.parse(payment.paidAt ?? '');
    if (!payment.id || payment.gymId !== change.gymId || payment.invoiceId !== invoice.id ||
        payment.amountMinor !== invoice.amountMinor || payment.currency !== invoice.currency ||
        !Number.isFinite(paid) || paid < accepted || paid > time || paid >= due)
      throw new Error('iron.change_payment_mismatch');
    differencePaymentId = payment.id;
  }

  await ports.replaceRenewal(change, auth, time < due);
  if (differencePaymentId) await ports.applyLicense(change, differencePaymentId);
  if (time < due) return 'renewal_scheduled';
  const renewal = await ports.readTargetRenewal(change);
  if (!renewal) return 'awaiting_renewal';
  const paid = Date.parse(renewal.paidAt);
  if (!renewal.paymentId || renewal.paymentId === differencePaymentId || renewal.gymId !== change.gymId ||
      renewal.subscriptionId !== change.targetSubscriptionId || renewal.currency !== quote.currency ||
      renewal.amountMinor !== terms.amountMinor || Date.parse(renewal.periodStart) !== due ||
      !Number.isFinite(paid) || paid < due || paid > time) throw new Error('iron.change_renewal_mismatch');
  if (quote.effectiveOn === 'NEXT_RENEWAL') await ports.applyLicense(change, renewal.paymentId);
  return 'completed';
}
