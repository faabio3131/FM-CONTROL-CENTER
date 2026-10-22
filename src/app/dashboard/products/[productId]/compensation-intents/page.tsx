import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {ProductRegistryService,ProductNotFoundError}
  from "@/application/products/product-registry-service";
import {PostgresProductRepository} from "@/infrastructure/products/postgres-product-repository";
import {AuthenticationRequiredError,TenantScopeRequiredError}
  from "@/domain/security/tenant-context";
import {CorrectionIntentPanel} from "./view";

export default async function CompensationIntentsPage({
  params,
}:{params:Promise<{productId:string}>}){
  let context;
  try{context=await resolveTenantContext(await headers());}
  catch(error){
    if(error instanceof AuthenticationRequiredError)redirect("/sign-in");
    if(error instanceof TenantScopeRequiredError)redirect("/onboarding");
    throw error;
  }
  if(!process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID||
     context.tenantId!==process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID||
     (context.role!=="owner"&&context.role!=="admin"))
    redirect("/dashboard");
  const {productId}=await params;
  let product;
  try{
    product=await new ProductRegistryService(new PostgresProductRepository())
      .get(context,productId);
  }catch(error){
    if(error instanceof ProductNotFoundError)notFound();
    throw error;
  }
  if(product.slug!=="vendeatendeia")notFound();
  return <main className="dashboard-shell">
    <header className="dashboard-header">
      <div>
        <span className="eyebrow">FM Tecnologia · VendeAtendeIA · P01</span>
        <h1>Reparação supervisionada — intenção auditável</h1>
      </div>
    </header>
    <CorrectionIntentPanel productId={productId}/>
  </main>;
}
