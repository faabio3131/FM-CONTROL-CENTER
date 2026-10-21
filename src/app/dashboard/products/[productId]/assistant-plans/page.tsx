import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { ProductRegistryService, ProductNotFoundError } from "@/application/products/product-registry-service";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { AssistantPlanEditor } from "./assistant-plan-editor";
import { WhatsAppQRPolicyEditor } from "./whatsapp-qr-policy-editor";
import { VendeLicenseQueueSupervisor } from "./vende-license-queue-supervisor";
import { VendePaymentReadbackSupervisor } from "./vende-payment-readback-supervisor";
import { VendeCommandApprovals } from "./vende-command-approvals";
import { VendeCommercialClaimsSupervisor } from "./vende-commercial-claims-supervisor";
import { VendeContractHistory } from "./vende-contract-history";

export default async function AssistantPlansPage({params}:{params:Promise<{productId:string}>}) {
  let context;
  try {context=await resolveTenantContext(await headers());}
  catch(error) {
    if(error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if(error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }
  if (!process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
      context.tenantId !== process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
      (context.role!=="owner" && context.role!=="admin")) redirect("/dashboard");
  const {productId}=await params;
  let product;
  try {product=await new ProductRegistryService(new PostgresProductRepository()).get(context,productId);}
  catch(error){if(error instanceof ProductNotFoundError) notFound();throw error;}
  return <main className="dashboard-shell">
    <header className="dashboard-header">
      <div><span className="eyebrow">Command · FM Tecnologia</span>
        <h1>Planos e franquias · {product.name}</h1>
        <p>Controle corporativo de preços e consumo. Todas as funções permanecem disponíveis em qualquer plano.</p>
      </div>
      <Link className="button" href={`/dashboard/products/${productId}`}>Voltar ao produto</Link>
    </header>
    <AssistantPlanEditor productId={productId}/>
    <WhatsAppQRPolicyEditor productId={productId}/>
    {product.slug==="vendeatendeia"?<VendeLicenseQueueSupervisor/>:null}
    {product.slug==="vendeatendeia"?<VendePaymentReadbackSupervisor productId={productId}/>:null}
    {product.slug==="vendeatendeia"?<VendeCommandApprovals productId={productId}/>:null}
    {product.slug==="vendeatendeia"?<VendeCommercialClaimsSupervisor productId={productId}/>:null}
    {product.slug==="vendeatendeia"?<VendeContractHistory productId={productId}/>:null}
  </main>;
}
