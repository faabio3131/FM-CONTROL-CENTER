// Offline contract adapter. SQLite survives worker restarts, and the provider
// clock charges each enabled subscription independently on its own due date.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class Sandbox {
  constructor(path, time) {
    this.time = time;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY, gym TEXT, source TEXT, due TEXT, terms TEXT,
        UNIQUE(gym, source, due));
      CREATE TABLE IF NOT EXISTS authorizations(id TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, change_id TEXT UNIQUE, data TEXT);
      CREATE TABLE IF NOT EXISTS payments(invoice TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY, gym TEXT, plan TEXT, due TEXT,
        amount INTEGER, enabled INTEGER, disabled_at TEXT);
      CREATE TABLE IF NOT EXISTS licenses(change_id TEXT PRIMARY KEY, gym TEXT, plan TEXT, payment TEXT, at TEXT);
      CREATE TABLE IF NOT EXISTS renewals(subscription TEXT, due TEXT, data TEXT, PRIMARY KEY(subscription,due));
    `);
  }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  rows(sql) { return this.db.prepare(sql).all(); }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  seed(c, originalPrice) {
    this.run('INSERT INTO subscriptions VALUES(?,?,?,?,?,1,NULL)', c.sourceSubscriptionId, c.gymId,
      c.quote.currentPlanCode, c.quote.targetRecurrence.firstChargeAt, originalPrice);
  }
  authorize(c) {
    const t = c.quote.targetRecurrence;
    this.run('INSERT INTO authorizations VALUES(?,?)', c.changeId, JSON.stringify({
      gymId: c.gymId, reference: randomUUID(), targetSubscriptionId: c.targetSubscriptionId,
      amountMinor: t.amountMinor, currency: 'BRL', interval: t.interval, firstChargeAt: t.firstChargeAt,
      acceptedAt: this.time,
    }));
  }
  bindChange(c) {
    this.tx(() => {
      const terms = JSON.stringify(c);
      const existing = this.get('SELECT terms FROM changes WHERE id=?', c.changeId);
      if (existing) {
        if (existing.terms !== terms) throw Error('change conflict');
        return;
      }
      const source = this.get('SELECT * FROM subscriptions WHERE id=? AND gym=? AND enabled=1',
        c.sourceSubscriptionId,c.gymId);
      if (!source || source.plan !== c.quote.currentPlanCode || source.due !== c.quote.targetRecurrence.firstChargeAt)
        throw Error('source mismatch');
      this.run('INSERT INTO changes VALUES(?,?,?,?,?)', c.changeId,c.gymId,c.sourceSubscriptionId,source.due,terms);
    });
  }
  readAuthorization(c) {
    const row = this.get('SELECT data FROM authorizations WHERE id=?', c.changeId);
    return row ? JSON.parse(row.data) : null;
  }
  differenceInvoice(c, allowCreate) {
    return this.tx(() => {
      const row = this.get('SELECT data FROM invoices WHERE change_id=?', c.changeId);
      if (row) return JSON.parse(row.data);
      if (!allowCreate) return null;
      const inv = { id: randomUUID(), gymId: c.gymId, changeId: c.changeId,
        amountMinor: c.quote.amountDueNowMinor, currency: c.quote.currency, issuedAt: this.time };
      this.run('INSERT INTO invoices VALUES(?,?,?)', inv.id,c.changeId,JSON.stringify(inv));
      return inv;
    });
  }
  readPayment(inv) {
    const row = this.get('SELECT data FROM payments WHERE invoice=?', inv.id);
    return row ? JSON.parse(row.data) : null;
  }
  settle(c, status) {
    const inv = this.differenceInvoice(c, false);
    const previous = this.readPayment(inv);
    if (previous?.status === 'paid') return;
    if (Date.parse(this.time) >= Date.parse(c.quote.targetRecurrence.firstChargeAt)) throw Error('expired invoice');
    this.run('INSERT INTO payments VALUES(?,?) ON CONFLICT(invoice) DO UPDATE SET data=excluded.data',
      inv.id,JSON.stringify({ id: randomUUID(), invoiceId: inv.id, gymId: c.gymId, status,
        amountMinor: inv.amountMinor, currency: inv.currency, paidAt: status === 'paid' ? this.time : null }));
  }
  applyLicense(c, paymentId) {
    this.tx(() => {
      const old = this.get('SELECT * FROM licenses WHERE change_id=?', c.changeId);
      if (old && old.payment !== paymentId) throw Error('license settlement conflict');
      if (!old) this.run('INSERT INTO licenses VALUES(?,?,?,?,?)',
        c.changeId,c.gymId,c.quote.targetPlanCode,paymentId,this.time);
    });
  }
  replaceRenewal(c, auth, allowSwitch) {
    this.tx(() => {
      const old = this.get('SELECT * FROM subscriptions WHERE id=? AND gym=?', c.sourceSubscriptionId,c.gymId);
      const target = this.get('SELECT * FROM subscriptions WHERE id=?', c.targetSubscriptionId);
      if (target && target.gym === c.gymId && target.enabled && !old.enabled && target.plan === c.quote.targetPlanCode) return;
      if (!allowSwitch || !old.enabled || target) throw Error('renewal requires reconciliation');
      this.run('UPDATE subscriptions SET enabled=0,disabled_at=? WHERE id=?',this.time,old.id);
      this.run('INSERT INTO subscriptions VALUES(?,?,?,?,?,1,NULL)', c.targetSubscriptionId,c.gymId,
        c.quote.targetPlanCode,auth.firstChargeAt,auth.amountMinor);
    });
  }
  clock(at) {
    this.time = at;
    this.tx(() => {
      for (const sub of this.rows('SELECT * FROM subscriptions WHERE enabled=1')) {
        if (Date.parse(sub.due) > Date.parse(at)) continue;
        const payment = { gymId: sub.gym, subscriptionId: sub.id, paymentId: randomUUID(),
          amountMinor: sub.amount,currency: 'BRL',periodStart: sub.due,paidAt: at };
        this.run('INSERT INTO renewals VALUES(?,?,?) ON CONFLICT DO NOTHING',sub.id,sub.due,JSON.stringify(payment));
      }
    });
  }
  readTargetRenewal(c) {
    const row = this.get('SELECT data FROM renewals WHERE subscription=? AND due=?',
      c.targetSubscriptionId,c.quote.targetRecurrence.firstChargeAt);
    return row ? JSON.parse(row.data) : null;
  }
}
