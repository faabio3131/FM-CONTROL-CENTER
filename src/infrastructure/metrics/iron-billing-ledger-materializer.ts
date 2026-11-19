import { createHash } from "node:crypto";
import { and, eq, gte, lt, sql, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { metricValues, productDefinitions, sourceDefinitions } from "@/infrastructure/db/platform-schema";


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
      // Read after the projection lock in a SINGLE statement. Read-committed
      // obtains the snapshot after lock acquisition, while joins keep
      // subscription, invoice and payment facts on that same snapshot.
      // Both ledgers share one MVCC statement snapshot. One-time orders
      // contribute to gross billed only; they can never establish paid coverage.
      type LedgerRow = {kind:"recurring"|"credit";subscriptionId:string;subscriptionStatus:string;
        paidThrough:Date|string|null;gymId:string|null;invoiceId:string|null;invoiceStatus:string|null;
        amountMinor:string|null;currency:string|null;periodEnd:Date|string|null;createdAt:Date|string|null;
        recordedPaymentStatus:string|null;creditGymId:string|null};
      const result = await tx.execute<LedgerRow>(sql`
        SELECT 'recurring'::text AS kind,s.id AS "subscriptionId",s.status AS "subscriptionStatus",
          s.paid_through AS "paidThrough",b.external_tenant_id AS "gymId",i.id AS "invoiceId",
          i.status AS "invoiceStatus",i.amount_minor::text AS "amountMinor",i.currency,
          i.period_end AS "periodEnd",i.created_at AS "createdAt",p.status AS "recordedPaymentStatus",
          NULL::text AS "creditGymId"
        FROM fmcc_billing_subscription s
        LEFT JOIN fmcc_billing_customer_binding b ON b.tenant_id=s.tenant_id
          AND b.product_id=s.product_id AND b.customer_id=s.customer_id
        LEFT JOIN fmcc_billing_invoice i ON i.tenant_id=s.tenant_id
          AND i.product_id=s.product_id AND i.customer_id=s.customer_id AND i.subscription_id=s.id
        LEFT JOIN fmcc_billing_provider_payment p ON p.tenant_id=i.tenant_id
          AND p.invoice_id=i.id AND p.gateway_account_id=i.gateway_account_id
        WHERE s.tenant_id=${input.tenantId} AND s.product_id=${input.productId}
        UNION ALL
        SELECT 'credit'::text,s.id,s.status,s.paid_through,b.external_tenant_id,o.id,o.status,
          o.amount_minor::text,o.currency,NULL::timestamptz,o.created_at,NULL::text,o.gym_id::text
        FROM fmcc_iron_ai_credit_order o
        JOIN fmcc_billing_subscription s ON s.tenant_id=o.tenant_id AND s.id=o.subscription_id
          AND s.product_id=o.product_id AND s.customer_id=o.customer_id
        LEFT JOIN fmcc_billing_customer_binding b ON b.tenant_id=o.tenant_id
          AND b.product_id=o.product_id AND b.customer_id=o.customer_id
        WHERE o.tenant_id=${input.tenantId} AND o.product_id=${input.productId}
        ORDER BY kind,"subscriptionId","invoiceId"
        LIMIT 100001
      `);
      function timestamp(value:Date|string|null):Date|null {
        if(value===null) return null;
        const date=new Date(value);
        if(!Number.isFinite(date.getTime())) throw new Error("metrics.iron_billing_timestamp_invalid");
        return date;
      }
      const rows=result.rows.map(row=>({...row,paidThrough:timestamp(row.paidThrough),
        periodEnd:timestamp(row.periodEnd),createdAt:timestamp(row.createdAt)}));
      if(rows.length>100000) throw new Error("metrics.iron_billing_snapshot_limit");
      if(!rows.length) return {materialized:0}; // unobserved, NOT zero
      const subscriptions = new Map<string,{id:string,status:string,paidThrough:Date|null,gymId:string}>();
      const invoices: {id:string,subscriptionId:string,status:string,amountMinor:number,
        currency:string,periodEnd:Date|null,createdAt:Date,recordedPaymentStatus:string|null}[]=[];
      const creditOrders: {id:string,status:string,amountMinor:number,currency:string,createdAt:Date}[]=[];
      const invoiceIds=new Set<string>();
      const creditIds=new Set<string>();
      for(const row of rows){
        if(!row.gymId||!UUID.test(row.gymId)||!SUPPORTED_STATUS.has(row.subscriptionStatus))
          throw new Error("metrics.iron_billing_subscription_scope_inconsistent");
        if(row.kind==="credit"){
          const amount=Number(row.amountMinor);
          if(!row.invoiceId||creditIds.has(row.invoiceId)||row.creditGymId!==row.gymId||
            !row.invoiceStatus||!VALID_INVOICE.has(row.invoiceStatus)||!Number.isSafeInteger(amount)||
            amount<=0||row.currency!=="BRL"||!row.createdAt||!Number.isFinite(row.createdAt.getTime()))
            throw new Error("metrics.iron_credit_order_inconsistent");
          creditIds.add(row.invoiceId);
          creditOrders.push({id:row.invoiceId,status:row.invoiceStatus,amountMinor:amount,currency:row.currency,createdAt:row.createdAt});
          continue;
        }
        subscriptions.set(row.subscriptionId,{id:row.subscriptionId,status:row.subscriptionStatus,
          paidThrough:row.paidThrough,gymId:row.gymId});
        if(row.invoiceId===null) continue;
        const amount=Number(row.amountMinor);
        if(invoiceIds.has(row.invoiceId)||!row.invoiceStatus||
          !Number.isSafeInteger(amount)||amount<=0||row.currency!=="BRL"||!row.createdAt||!Number.isFinite(row.createdAt.getTime()))
          throw new Error("metrics.iron_billing_invoice_inconsistent");
        invoiceIds.add(row.invoiceId);
        invoices.push({id:row.invoiceId,subscriptionId:row.subscriptionId,status:row.invoiceStatus,
          amountMinor:amount,currency:row.currency,periodEnd:row.periodEnd,createdAt:row.createdAt,
          recordedPaymentStatus:row.recordedPaymentStatus});
      }
      const subs=[...subscriptions.values()];
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
      const valid=[
        ...invoices.filter(x=>VALID_INVOICE.has(x.status)).map(x=>({...x,ledger:"recurring" as const})),
        ...creditOrders.map(x=>({...x,ledger:"ai_credit" as const})),
      ];
      if(valid.length){
        const current=valid.filter(x=>x.createdAt>=month&&x.createdAt<nextMonth);
        const minor=current.reduce((sum,x)=>sum+BigInt(x.amountMinor),0n);
        const gross=(minor/100n).toString()+"."+(minor%100n).toString().padStart(2,"0");
        await write("billing.gross_billed",gross,"currency",[digest(current),...current.slice(0,8).map(x=>x.id)],{start:month,end:nextMonth});
        materialized++;
      }
      return { materialized };
    },{isolationLevel:"read committed"});
  }
}
