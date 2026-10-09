import { assertNoPreviousPayment } from "../../../scripts/billing-provider-duplicate-guard.mjs";
import { ASAAS_PRODUCTION_SECRET_REF, resolveGatewaySecret } from "./secret-resolver";

export const PRODUCTION_PILOT_REFERENCE = "fmcc-kordena-real-pix-001-20261008";
export class ProductionPilotError extends Error {}
export class AsaasProductionPilot {
 constructor(private readonly transport: typeof fetch = fetch) {}
 private async request(method: "GET" | "POST", endpoint: string, payload?: object): Promise<any> {
  const key = resolveGatewaySecret({provider:"asaas",environment:"production",secretRef:ASAAS_PRODUCTION_SECRET_REF});
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),15000);
  try {
   const response = await this.transport("https://api.asaas.com/v3"+endpoint,{
    method, headers:{access_token:key,accept:"application/json","content-type":"application/json","user-agent":"FMCommand-Pilot/1.0"},
    ...(payload?{body:JSON.stringify(payload)}:{}),signal:controller.signal,redirect:"error",cache:"no-store"
   });
   if(!response.ok)throw new ProductionPilotError("billing.production_http_"+response.status);
   return response.json();
  }finally{clearTimeout(timer);}
 }
 async checkReference():Promise<void> {
  const data = await this.request("GET","/payments?externalReference="+encodeURIComponent(PRODUCTION_PILOT_REFERENCE));
  assertNoPreviousPayment(data);
 }
 async createOneRealPix(input:{customerId:string; dueDate:string; authorization:string}):Promise<{id:string;invoiceUrl?:string}>{
  if(input.authorization!=="AUTHORIZE_REAL_PIX_BRL_1_00")throw new ProductionPilotError("billing.production_authorization_missing");
  if(!/^cus_[A-Za-z0-9_-]+$/.test(input.customerId))throw new ProductionPilotError("billing.production_customer_id_invalid");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate))throw new ProductionPilotError("billing.production_date_invalid");
  // A failed lookup or existing charge blocks issuance. Never retry POST after a timeout.
  await this.checkReference();
  const result = await this.request("POST","/payments",{
   customer:input.customerId,billingType:"PIX",value:1,dueDate:input.dueDate,
   description:"FM Command Kordena - teste real autorizado R$ 1,00",externalReference:PRODUCTION_PILOT_REFERENCE
  });
  if(!result || typeof result.id!=="string" || result.externalReference!==PRODUCTION_PILOT_REFERENCE ||
     Math.round(Number(result.value)*100)!==100 || result.billingType!=="PIX")
   throw new ProductionPilotError("billing.production_payment_response_mismatch");
  return {id:result.id,invoiceUrl:typeof result.invoiceUrl==="string"?result.invoiceUrl:undefined};
 }
}
