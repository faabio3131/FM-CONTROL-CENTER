import { createHash, randomUUID } from "node:crypto";
import { pool } from "@/infrastructure/db/client";
import { CaktoPaymentProvider } from "@/infrastructure/subscription/cakto-payment-provider";
import { CaktoIronProductBilling } from "./cakto-iron-product-billing";
import { IronAiCreditBilling } from "./iron-ai-credit-billing";
import type { PaymentEvent } from "@/domain/billing/cakto-payment-provider-contract";
import { WebhookRejectedError } from "@/domain/billing/cakto-payment-provider-contract";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sourceTypes:Record<string,PaymentEvent["type"]>={
  purchase_approved:"payment_confirmed",subscription_renewed:"payment_confirmed",
  subscription_late_recovered:"payment_confirmed",refund:"payment_refunded",chargeback:"payment_refunded",
  subscription_canceled:"subscription_cancelled",subscription_late:"payment_overdue",
  subscription_renewal_refused:"payment_overdue",
};
type Scope="recurring"|"ai_credits";
type Job={id:string;scope:Scope;invoice_id:string;payment_id:string;source_event:string;
  observation:Omit<PaymentEvent,"occurredAt">&{occurredAt:string};fingerprint:string;attempts:number;claim_token:string};
type Result="idle"|"applied"|"duplicate"|"ignored"|"retry"|"blocked";

export class CaktoIronReadbackInbox {
  private readonly tenant:string;
  private readonly product:string;
  constructor(private readonly env:Record<string,string|undefined>=process.env,
    private readonly transport:typeof fetch=fetch){
    this.tenant=env.FMCC_IRON_BILLING_TENANT_ID??"";
    this.product=env.FMCC_IRON_PRODUCT_ID??"";
    if(!/^[A-Za-z0-9._:-]{3,128}$/.test(this.tenant)||!UUID.test(this.product))
      throw new Error("cakto.readback_scope_missing");
  }
  async accept(scope:Scope,headers:Headers,raw:string):Promise<"queued"|"ignored"|"duplicate">{
    const provider=new CaktoPaymentProvider(this.env);
    const event=scope==="ai_credits"?provider.verifyOneTimeWebhook(headers,raw):provider.verifyWebhook(headers,raw);
    if(!event)return "ignored";
    if((scope==="ai_credits")!==(event.offerInterval==="one_time"))return "ignored";
    const source=String((JSON.parse(raw) as {event?:unknown}).event??"");
    if(sourceTypes[source]!==event.type||
      (scope==="ai_credits"&&!["purchase_approved","refund","chargeback"].includes(source)))return "ignored";
    if(!event.paymentRef||!UUID.test(event.paymentRef)||!UUID.test(event.subscriptionRef))
      throw new WebhookRejectedError("webhook.body_invalid");
    // Only normalized, validated fields and the SHA-256 of the original body.
    const result=await pool.query(`
      INSERT INTO fmcc_iron_cakto_readback_inbox(tenant_id,product_id,scope,invoice_id,payment_id,source_event,observation,fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(tenant_id,product_id,scope,invoice_id,payment_id,source_event) DO NOTHING
      RETURNING id
    `,[this.tenant,this.product,scope,event.subscriptionRef,event.paymentRef,source,
      JSON.stringify(event),createHash("sha256").update(raw).digest("hex")]);
    return result.rowCount===1?"queued":"duplicate";
  }

  async processOne():Promise<Result>{
    if(!this.env.FMCC_CAKTO_READ_CLIENT_ID||!this.env.FMCC_CAKTO_READ_CLIENT_SECRET)
      throw new Error("cakto.readback_credentials_missing");
    // Scope all recovery, leases and claims to the configured product.
    const exhausted=await pool.query(`UPDATE fmcc_iron_cakto_readback_inbox SET status='blocked',
      lease_until=NULL,claim_token=NULL,last_error_code='cakto.readback_attempts_exhausted',updated_at=now()
      WHERE tenant_id=$1 AND product_id=$2 AND attempts>=12 AND status='processing' AND lease_until<now()`,[this.tenant,this.product]);
    if(exhausted.rowCount)return "blocked";
    const claim=await pool.query<Job>(`
      UPDATE fmcc_iron_cakto_readback_inbox SET status='processing',attempts=attempts+1,
        claim_token=$3,lease_until=now()+interval '90 seconds',updated_at=now()
      WHERE id=(SELECT id FROM fmcc_iron_cakto_readback_inbox q
        WHERE q.tenant_id=$1 AND q.product_id=$2 AND q.attempts<12 AND
        ((q.status IN ('pending','retry') AND q.available_at<=now()) OR
        (q.status='processing' AND q.lease_until<now()))
        ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id,scope,invoice_id,payment_id,source_event,observation,fingerprint,attempts,claim_token
    `,[this.tenant,this.product,randomUUID()]);
    const job=claim.rows[0];if(!job)return "idle";
    const client=await pool.connect();
    let locked=false,discard=true;
    let state:Result="retry",code:string|null=null;
    const key=JSON.stringify(["cakto.readback.v1",this.tenant,this.product,job.scope,job.invoice_id]);
    try{
      const lock=await client.query<{ok:boolean}>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok",[key]);
      locked=lock.rows[0]?.ok===true;discard=false;
      if(!locked)throw new Error("cakto.readback_busy");
      const alive=await client.query("SELECT id FROM fmcc_iron_cakto_readback_inbox WHERE id=$1 AND claim_token=$2 AND status='processing' AND lease_until>now()",[job.id,job.claim_token]);
      if(alive.rowCount!==1)throw new Error("cakto.readback_lease_lost");
      const o=job.observation;
      if(o.subscriptionRef!==job.invoice_id||o.paymentRef!==job.payment_id||sourceTypes[job.source_event]!==o.type||
        (job.scope==="ai_credits")!==(o.offerInterval==="one_time")||!Number.isFinite(Date.parse(o.occurredAt)))
        throw new Error("cakto.readback_binding_invalid");
      const event:PaymentEvent={...o,occurredAt:new Date(o.occurredAt)};
      // No SQL transaction or row lock during OAuth/READ. The separate session
      // lock serializes observations for this invoice including refund races.
      const billing=job.scope==="ai_credits"?new IronAiCreditBilling(this.env,this.transport):
        new CaktoIronProductBilling(this.env,this.transport);
      const outcome=await billing.reconcile(event,job.source_event,job.fingerprint);
      if(outcome==="unmatched")throw new Error("cakto.readback_unmatched");
      state=outcome;
    }catch(e){
      const message=e instanceof Error?e.message:"";
      code=/^cakto\.readback_(binding_invalid|timestamp_invalid|not_confirmed|unavailable|unmatched|busy|lease_lost)$/.test(message)?
        message:"cakto.readback_processing_failed";
      state=job.attempts>=12||code==="cakto.readback_binding_invalid"?"blocked":"retry";
    }
    try{
    const result=await client.query(`UPDATE fmcc_iron_cakto_readback_inbox SET status=$3,
      claim_token=NULL,lease_until=NULL,last_error_code=$4,
      available_at=now()+make_interval(secs=>$5),updated_at=now()
      WHERE id=$1 AND claim_token=$2 AND status='processing' AND tenant_id=$6 AND product_id=$7`,
      [job.id,job.claim_token,state,code,Math.min(3600,30*2**Math.min(job.attempts,7)),this.tenant,this.product]);
    return result.rowCount===1?state:"retry";
    }finally{
      if(locked){try{const x=await client.query<{ok:boolean}>("SELECT pg_advisory_unlock(hashtextextended($1,0)) AS ok",[key]);discard=x.rows[0]?.ok!==true;}catch{discard=true;}}
      client.release(discard);
    }
  }

  async listBlocked(context:TenantContext){
    this.authorize(context);
    return (await pool.query(`SELECT id,scope,source_event,status,attempts,last_error_code,created_at
      FROM fmcc_iron_cakto_readback_inbox WHERE tenant_id=$1 AND product_id=$2 AND status='blocked'
      ORDER BY created_at,id LIMIT 100`,[this.tenant,this.product])).rows;
  }
  private authorize(context:TenantContext){
    requirePermission(context,"billing:write");
    if(context.role!=="owner"||context.tenantId!==this.tenant)throw new Error("cakto.readback_scope_denied");
  }
  async requeue(context:TenantContext,id:string){
    this.authorize(context);
    if(!UUID.test(id))throw new Error("cakto.readback_scope_denied");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query(`UPDATE fmcc_iron_cakto_readback_inbox SET status='retry',attempts=0,
        available_at=now(),last_error_code=NULL,updated_at=now()
        WHERE id=$1 AND tenant_id=$2 AND product_id=$3 AND status='blocked' AND claim_token IS NULL AND lease_until IS NULL
        RETURNING id`,[id,this.tenant,this.product]);
      if(result.rowCount!==1)throw new Error("cakto.readback_not_blocked");
      await client.query(`INSERT INTO fmcc_billing_audit_event(tenant_id,actor_id,action,subject_id,correlation_id)
        VALUES($1,$2,'billing.cakto_readback.requeue',$3,$4)`,[this.tenant,context.userId,id,context.correlationId]);
      await client.query("COMMIT");return {status:"retry",id};
    }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }
}
