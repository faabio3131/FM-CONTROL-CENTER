import { describe, expect, it, vi } from "vitest";
import type { NewSourceDefinition, SourceRepository } from "@/domain/integration/contracts";
import type { ProductRepository } from "@/domain/products/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";
import { SourceRegistryService } from "@/application/integration/source-registry-service";
import { UNIVERSAL_SAAS_SOURCE_TYPE, universalSaasSecretRef } from "@/domain/integration/universal-saas-contract";

const context: TenantContext = {tenantId:"fm",role:"owner",userId:"admin-1",correlationId:"cor"};
const legitimate: NewSourceDefinition = {
  productId:"product-1",name:"NFCore Usage v1",
  sourceType:UNIVERSAL_SAAS_SOURCE_TYPE,authoritativeDomain:"operational",
  syncMode:"pull",mappingVersion:UNIVERSAL_SAAS_SOURCE_TYPE,
  secretRef:universalSaasSecretRef("nfcore"),
  config:{baseUrl:"https://api.nfcore.com.br",productSlug:"nfcore"},
};
function setup(productSlug = "nfcore") {
  const create = vi.fn(async (_tenantId:string,_input:NewSourceDefinition) => ({}));
  const findById = vi.fn(async (_tenantId:string,_id:string) =>
    ({id:"product-1",tenantId:"fm",slug:productSlug,name:"NFCore",status:"active"}));
  const service = new SourceRegistryService(
    {create} as unknown as SourceRepository,
    {findById} as unknown as ProductRepository,
  );
  return {create,findById,service};
}

describe("C08 registration for arbitrary future SaaS", () => {
  it("registers only canonical product ID, source type, slug and expected secret reference", async () => {
    const r=setup();
    await r.service.register(context,legitimate);
    expect(r.findById).toHaveBeenCalledWith("fm","product-1");
    expect(r.create).toHaveBeenCalledOnce();
    expect(r.create.mock.calls[0][1]).toMatchObject({
      productId:"product-1",sourceType:UNIVERSAL_SAAS_SOURCE_TYPE,
      secretRef:universalSaasSecretRef("nfcore"), authoritativeDomain:"operational",
    });
  });
  it("blocks missing product ID and cross-product slug even when client supplies valid looking refs", async () => {
    const r=setup();
    await expect(r.service.register(context,{...legitimate,productId:undefined})).rejects.toThrow("integration.product_source_binding_invalid");
    await expect(r.service.register(context,{...legitimate,config:{...legitimate.config,productSlug:"gym-pro"}})).rejects.toThrow("integration.product_source_binding_invalid");
    expect(r.create).not.toHaveBeenCalled();
  });
  it("rejects a new unknown product slug, a borrowed secret and wrong authority", async () => {
    const r=setup("other-saas");
    await expect(r.service.register(context,legitimate)).rejects.toThrow("integration.product_source_binding_invalid");
    const authorized=setup();
    await expect(authorized.service.register(context,{...legitimate,secretRef:"env:FMCC_SAAS_IRON_CONTROL_TOKEN"})).rejects.toThrow();
    await expect(authorized.service.register(context,{...legitimate,authoritativeDomain:"commercial"})).rejects.toThrow();
    expect(authorized.create).not.toHaveBeenCalled();
  });
  it("rejects a product returned by a broken repository from another organization", async () => {
    const r=setup();
    r.findById.mockResolvedValueOnce({
      id:"product-1",tenantId:"other-organization",slug:"nfcore",name:"NFCore",status:"active",
    });
    await expect(r.service.register(context,legitimate)).rejects.toThrow("integration.product_scope_invalid");
    expect(r.create).not.toHaveBeenCalled();
  });
  it("viewer cannot register even with correct source and cannot invoke product lookups", async () => {
    const r=setup();
    await expect(r.service.register({...context,role:"viewer"},legitimate)).rejects.toThrow();
    expect(r.findById).not.toHaveBeenCalled();
    expect(r.create).not.toHaveBeenCalled();
  });
});
