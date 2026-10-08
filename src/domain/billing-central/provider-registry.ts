/** Public capability inventory. A listing is not certification or payment availability. */
export type ProviderDescriptor = Readonly<{
  code: string;
  displayName: string;
  status: "planned" | "sandbox_certified" | "production_certified";
  supports: ReadonlyArray<"payments" | "subscriptions" | "refunds" | "webhooks">;
}>;
const providers: readonly ProviderDescriptor[] = [
  {code:"cakto",displayName:"Cakto",status:"planned",supports:[]},
  {code:"hotmart",displayName:"Hotmart",status:"planned",supports:[]},
  {code:"asaas",displayName:"Asaas",status:"planned",supports:[]},
  {code:"mercado_pago",displayName:"Mercado Pago",status:"planned",supports:[]},
  {code:"pagbank",displayName:"PagBank",status:"planned",supports:[]},
  {code:"stripe",displayName:"Stripe",status:"planned",supports:[]},
];
export function listProviderDescriptors(): readonly ProviderDescriptor[] {
  return providers.map((provider) => ({...provider, supports:[...provider.supports]}));
}
export function canActivateProvider(code:string):boolean {
  return providers.some((provider)=>provider.code===code && provider.status==="production_certified");
}
