// Independent mock HTTP transport for CI only. Explicitly register provider
// observations; no test switch or fake readback exists in production code.
export function caktoReadbackFixture(){
  const orders=new Map<string,Record<string,unknown>>();
  const subscriptions=new Map<string,Record<string,unknown>>();
  const parents=new Map<string,string>();
  let failStatus:number|null=null;
  let readCount=0;
  const subId="8d91b5e8-e98f-4fbe-a07f-30f71a476c65";
  const register=(raw:string,checkoutPath?:string)=>{
    const {event,data}=JSON.parse(raw);
    const recurring=String(data.offer?.id).startsWith("offer_");
    const path=checkoutPath??(recurring?data.offer.id:
      data.offer.id==="ci_credit_100"?"ci_credit_100":"ai100");
    const now=new Date().toISOString();
    const status=event==="chargeback"?"chargedback":event==="refund"?"refunded":data.status;
    const id=String(data.id);
    orders.set(id,{id,sck:data.sck,offer_type:data.offer_type,currency:data.currency,product:data.product,
      type:recurring?"subscription":"unique",amount:String(data.amount),status,
      subscription:recurring?subId:null,checkoutUrl:"https://pay.cakto.com.br/"+path,
      paidAt:data.paidAt??now,createdAt:now,refundedAt:now,chargedbackAt:now});
    if(recurring){
      if(!parents.has(data.sck))parents.set(data.sck,id);
      const parent=parents.get(data.sck)!;
      subscriptions.set(subId,{id:subId,parent_order:parent,product:data.product.id,offer:data.offer.id,
        orders:[...orders.keys()],status:event==="subscription_canceled"?"canceled":
          ["subscription_late","subscription_renewal_refused"].includes(event)?"late":"active"});
    }
  };
  const transport:typeof fetch=async(input,init)=>{
    const u=new URL(String(input));
    if(u.origin!=="https://api.cakto.com.br"||!u.pathname.startsWith("/public_api/"))
      throw Error("fixture origin");
    if(u.pathname.endsWith("/token/"))return new Response(JSON.stringify({
      access_token:"ci-readback-token-0000000000000000",token_type:"Bearer",expires_in:36000}));
    readCount++;
    if(failStatus!==null)return new Response("",{status:failStatus});
    if(init?.method!=="GET"||new Headers(init.headers).get("authorization")!=="Bearer ci-readback-token-0000000000000000")throw Error("fixture authorization");
    const parts=u.pathname.split("/").filter(Boolean);
    const row=parts[1]==="orders"?orders.get(parts[2]):parts[1]==="subscriptions"?subscriptions.get(parts[2]):null;
    return row?new Response(JSON.stringify(row)):new Response("",{status:404});
  };
  return {register,transport,orders,subscriptions,setFailure:(v:number|null)=>{failStatus=v;},reads:()=>readCount};
}
export const ciCaktoReadEnv={FMCC_CAKTO_READ_CLIENT_ID:"ci-read-client",FMCC_CAKTO_READ_CLIENT_SECRET:"ci-only-read-secret"};
