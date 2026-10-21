import { resolveGatewaySecret } from "./secret-resolver";

export type VendePaymentOutcome = "unpaid_verified"|"settled_verified"|"reversed_verified"|"needs_attention";
export type VendeReadbackScope = Readonly<{
  tenantId:string;gatewayAccountId:string;provider:"asaas";
  environment:"sandbox"|"production";secretRef:string;
}>;
export type VendePaymentExpectation = Readonly<{
  paymentId:string;providerCustomerRef:string;invoiceId:string;amountMinor:number;
}>;
export type VendeReadbackSecrets = (scope:VendeReadbackScope)=>Promise<string>;
export interface VendePaymentReadbackPort {
  read(scope:VendeReadbackScope,expected:VendePaymentExpectation):Promise<VendePaymentOutcome>;
}
export class VendePaymentReadbackDenied extends Error {
  constructor(){super("vende.payment_readback_unavailable");}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const origins={sandbox:"https://api-sandbox.asaas.com",production:"https://api.asaas.com"};

/** GET only, no polling, no mutations, no arbitrary endpoint from caller data.
 * Secret resolver is an account-scoped port; the default supports the existing
 * allowlisted env references. Vault adapters may be supplied by server composition.
 */
export class AsaasVendePaymentReadOnlyClient implements VendePaymentReadbackPort {
  constructor(
    private readonly secrets:VendeReadbackSecrets=async scope=>resolveGatewaySecret(scope),
    private readonly http:typeof fetch=fetch,
  ){}
  async read(scope:VendeReadbackScope,expected:VendePaymentExpectation):Promise<VendePaymentOutcome>{
    if(scope.provider!=="asaas" || !Object.hasOwn(origins,scope.environment) ||
       !scope.tenantId || !UUID.test(scope.gatewayAccountId) || !scope.secretRef ||
       !UUID.test(expected.invoiceId) || !/^pay_[A-Za-z0-9_-]{1,128}$/.test(expected.paymentId) ||
       !/^cus_[A-Za-z0-9_-]{1,128}$/.test(expected.providerCustomerRef) ||
       !Number.isSafeInteger(expected.amountMinor) || expected.amountMinor<=0)
      throw new VendePaymentReadbackDenied();
    try{
      const secret=await this.secrets(scope);
      if(!/^[\x21-\x7e]{12,2048}$/.test(secret))throw new VendePaymentReadbackDenied();
      const result=await this.http(origins[scope.environment]+"/v3/payments/"+encodeURIComponent(expected.paymentId),{
        method:"GET",headers:{access_token:secret,accept:"application/json","User-Agent":"FMCommand-Vende-Readback/1.0"},
        redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
      });
      if(result.status!==200 || !result.body)throw new VendePaymentReadbackDenied();
      const reader=result.body.getReader();let size=0;const chunks:Uint8Array[]=[];
      try{
        for(;;){
          const next=await reader.read();if(next.done)break;
          size+=next.value.byteLength;
          if(size>65536){await reader.cancel();throw new VendePaymentReadbackDenied();}
          chunks.push(next.value);
        }
      }finally{reader.releaseLock();}
      const data:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if(!data || typeof data!=="object" || Array.isArray(data))throw new VendePaymentReadbackDenied();
      const p=data as Record<string,unknown>;
      if(p.id!==expected.paymentId || p.customer!==expected.providerCustomerRef ||
         p.externalReference!==expected.invoiceId || p.deleted!==false ||
         typeof p.value!=="number" || !Number.isFinite(p.value) ||
         Math.abs(p.value*100-expected.amountMinor)>0.001 ||
         !["PIX","BOLETO","CREDIT_CARD","UNDEFINED"].includes(String(p.billingType)))
        throw new VendePaymentReadbackDenied();
      if(p.chargeback!=null ||
         (p.refunds!==undefined && (!Array.isArray(p.refunds) || (p.refunds.length>0 && p.status!=="REFUNDED"))))
        return "needs_attention";
      if(p.status==="PENDING"||p.status==="OVERDUE")return "unpaid_verified";
      if(p.status==="RECEIVED")return "settled_verified";
      if(p.status==="REFUNDED")return "reversed_verified";
      // CONFIRMED, disputes, partial refunds, cash receipts and unknown states
      // do not establish either unpaid or fully settled authority.
      return "needs_attention";
    }catch{throw new VendePaymentReadbackDenied();}
  }
}
