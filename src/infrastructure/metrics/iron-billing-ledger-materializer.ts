import { createHash } from "node:crypto";
import { and, eq, gte, lt, sql, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { metricValues, productDefinitions, sourceDefinitions } from "@/infrastructure/db/platform-schema";
import { billingSubscriptions, billingCustomerBindings, billingInvoices, billingProviderPayments } from "@/infrastructure/db/billing-schema";

const AUTHORITY = "FM_COMMAND_IRON_PRODUCT_LEDGER";
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SUPPORTED_STATUS = new Set(["pending","active","past_due","suspended","cancelled"]);
const VALID_INVOICE = new Set(["pending","paid","refunded"]);

/**
 * Materialize only the two already-defined F11 metrics for which this ledger
 * has direct authority. No trial entitlement counts, no implicit revenue,
 * no MRR, no provider settlement claims. UTC period [start,end).
 */
export class IronBillingLedgerMaterializer {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  async materialize(input: { tenantId:string; productId:string; sourceId:string; mappingVersion:string }) {
    if (input.mappingVersion !== "iron-commercial-v1" || !UUID.test(input.productId) ||
        !UUID.test(input.sourceId) || !input.tenantId)
      throw new Error("metrics.iron_billing_scope_invalid");
    // Only the configured FM-owned IRON product ledger may supply these metrics.
    if (this.env.FMCC_IRON_PRODUCT_ID !== input.productId ||
        this.env.FMCC_IRON_BILLING_TENANT_ID !== input.tenantId)
      return { materialized: 0 };
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${[input.tenantId,input.productId,AUTHORITY].join(":")},0))`);
      const [source] = await tx.select({ sourceId:sourceDefinitions.id }).from(sourceDefinitions)
        .innerJoin(productDefinitions, and(eq(productDefinitions.tenantId,sourceDefinitions.tenantId),
          eq(productDefinitions.id,sourceDefinitions.productId)))
        .where(and(eq(sourceDefinitions.tenantId,input.tenantId),
          eq(sourceDefinitions.productId,input.productId),eq(sourceDefinitions.id,input.sourceId),
          eq(sourceDefinitions.sourceType,"iron-commercial-v1"),eq(sourceDefinitions.mappingVersion,input.mappingVersion),
          eq(sourceDefinitions.authoritativeDomain,"commercial"),eq(sourceDefinitions.name,"IRON FIT CORE Commercial"),
          eq(productDefinitions.slug,"iron"),eq(productDefinitions.status,"active"))).limit(1);
      if (!source) throw new Error("metrics.iron_billing_source_not_authorized");
      const asOf = new Date();
      const day = new Date(Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate()));
      const nextDay = new Date(day.getTime()+86400000);
      const month = new Date(Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),1));
      const nextMonth = new Date(Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth()+1,1));
      const scope = and(eq(billingSubscriptions.tenantId,input.tenantId),eq(billingSubscriptions.productId,input.productId));
      const subs = await tx.select({id:billingSubscriptions.id,status:billingSubscriptions.status,
        paidThrough:billingSubscriptions.paidThrough,gymId:billingCustomerBindings.externalTenantId})
        .from(billingSubscriptions).leftJoin(billingCustomerBindings,and(
          eq(billingCustomerBindings.tenantId,billingSubscriptions.tenantId),
          eq(billingCustomerBindings.productId,billingSubscriptions.productId),
          eq(billingCustomerBindings.customerId,billingSubscriptions.customerId)))
        .where(scope).orderBy(billingSubscriptions.id).limit(100001);
      if (subs.length > 100000 || subs.some(x=>!x.gymId || !UUID.test(x.gymId) || !SUPPORTED_STATUS.has(x.status)))
        throw new Error("metrics.iron_billing_subscription_scope_inconsistent");
      const invoices = await tx.select({id:billingInvoices.id,subscriptionId:billingInvoices.subscriptionId,
        status:billingInvoices.status,amountMinor:billingInvoices.amountMinor,currency:billingInvoices.currency,
        periodEnd:billingInvoices.periodEnd,createdAt:billingInvoices.createdAt,
        recordedPaymentStatus:billingProviderPayments.status})
        .from(billingInvoices).leftJoin(billingProviderPayments,and(
          eq(billingProviderPayments.tenantId,billingInvoices.tenantId),
          eq(billingProviderPayments.invoiceId,billingInvoices.id),
          eq(billingProviderPayments.gatewayAccountId,billingInvoices.gatewayAccountId)))
        .where(and(eq(billingInvoices.tenantId,input.tenantId),eq(billingInvoices.productId,input.productId)))
        .orderBy(billingInvoices.id).limit(100001);
      if (invoices.length>100000 || invoices.some(x=>!Number.isSafeInteger(x.amountMinor)||x.amountMinor<=0||x.currency!=="BRL"))
        throw new Error("metrics.iron_billing_invoice_inconsistent");
      if (subs.length===0 && invoices.length===0) return { materialized:0 }; // unobserved, NOT zero
      const subscriptionIds = new Set(subs.map(x=>x.id));
      if (invoices.some(x=>!subscriptionIds.has(x.subscriptionId))) throw new Error("metrics.iron_billing_orphan_invoice");
      const paidCycles = new Set(invoices.filter(x=>x.status==="paid"&&x.recordedPaymentStatus==="received"&&x.periodEnd)
        .map(x=>x.subscriptionId+":"+x.periodEnd!.toISOString()));
      // An active commercial subscription is not a free trial and must have
      // a current paid coverage period recorded in its own product ledger.
      const active = subs.filter(x=>x.status==="active"&&x.paidThrough&&x.paidThrough>asOf&&
        paidCycles.has(x.id+":"+x.paidThrough.toISOString()));
      const activeGyms = new Set(active.map(x=>x.gymId));
      if (activeGyms.size!==active.length) throw new Error("metrics.iron_billing_duplicate_active_subscription");
      const digest = (rows:unknown[])=>"sha256:"+createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      async function write(metricId:string,value:string,unit:"count"|"currency",refs:string[],period?:{start:Date;end:Date}) {
        const identity = and(eq(metricValues.tenantId,input.tenantId),eq(metricValues.productId,input.productId),
          eq(metricValues.metricId,metricId),eq(metricValues.metricVersion,1),eq(metricValues.sourceAuthority,AUTHORITY),
          period?and(eq(metricValues.periodStart,period.start),eq(metricValues.periodEnd,period.end)):
            and(isNull(metricValues.periodStart),isNull(metricValues.periodEnd),gte(metricValues.asOf,day),lt(metricValues.asOf,nextDay)));
        const existing=await tx.select({id:metricValues.id}).from(metricValues).where(identity).limit(2);
        if(existing.length>1) throw new Error("metrics.iron_billing_duplicate_materialization");
        const values={value,unit,currency:unit==="currency"?"BRL":null,asOf,computedAt:new Date(),
          sourceTimestamp:asOf,freshnessStatus:"unknown",qualityStatus:"reconciled",provenanceRefs:[source.sourceId,...refs]};
        if(existing[0]) await tx.update(metricValues).set(values).where(and(eq(metricValues.id,existing[0].id),
          eq(metricValues.tenantId,input.tenantId),eq(metricValues.productId,input.productId)));
        else await tx.insert(metricValues).values({tenantId:input.tenantId,productId:input.productId,metricId,metricVersion:1,
          sourceAuthority:AUTHORITY,periodStart:period?.start??null,periodEnd:period?.end??null,...values});
      }
      let materialized=0;
      if(subs.length){
        await write("subscription.active.count",String(active.length),"count",[digest(subs),digest(invoices),...active.slice(0,8).map(x=>x.id)]);
        materialized++;
      }
      // Invoice face value at issuance, NOT cash received. Refunds are not
      // netted against gross billed. Unknown/draft/void records are excluded;
      // nothing is fabricated when no valid invoice has been observed.
      const valid=invoices.filter(x=>VALID_INVOICE.has(x.status));
      if(valid.length){
        const current=valid.filter(x=>x.createdAt>=month&&x.createdAt<nextMonth);
        const minor=current.reduce((sum,x)=>sum+BigInt(x.amountMinor),0n);
        const gross=(minor/100n).toString()+"."+(minor%100n).toString().padStart(2,"0");
        await write("billing.gross_billed",gross,"currency",[digest(current),...current.slice(0,8).map(x=>x.id)],{start:month,end:nextMonth});
        materialized++;
      }
      return { materialized };
    },{isolationLevel:"repeatable read"});
  }
}
