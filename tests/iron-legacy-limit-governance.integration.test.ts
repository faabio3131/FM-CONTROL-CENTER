import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { IRON_COMMERCIAL_SECRET_REF, IRON_COMMERCIAL_SOURCE_TYPE, IRON_PLAN_GOVERNANCE_SECRET_REF,
  IronCommercialConnector, parseIronLegacyLimits } from "@/infrastructure/integration/iron-commercial-connector";

const gymId="8ca3defb-b2dd-4c2c-b109-e5e43c15e1d8";
const configurationId="d34ad798-7b7c-4b35-9e1a-f764293a9ed8";
const subscriptionId="6b4d2ffe-bbaa-4dda-b8e2-0b38f65b2a29";
const row={configurationId,featureKey:"ai.workout_monthly_max",legacyLimit:25,effectiveLimit:25,
  planLimit:100,subscriptionId,planCode:"IRON_BASE",planVersion:1,status:"REVIEW_REQUIRED",reason:null};
const payload={schema_version:"iron.fmcc.legacy-limits.v1",product_code:"IRON_FIT_CORE",gymId,limits:[row]};
const approval={configurationId,subscriptionId,planCode:"IRON_BASE",planVersion:1,legacyLimit:25,planLimit:100,
  confirm:"ALINHAR_AO_LIMITE_DO_PLANO" as const,reason:"Revisao comercial explicitamente aprovada"};
const source={id:"source-iron",tenantId:"fm-tenant",productId:"iron-product",name:"IRON FIT CORE Commercial",
  sourceType:IRON_COMMERCIAL_SOURCE_TYPE,authoritativeDomain:"commercial",status:"configured" as const,syncMode:"pull" as const,
  secretRef:IRON_COMMERCIAL_SECRET_REF,config:{baseUrl:"https://iron.example.test"},mappingVersion:"iron-commercial-v1"};
const context={tenantId:source.tenantId,correlationId:"legacy-review-ci",timeoutMs:5000};
const resolve=(ref:string)=>ref===IRON_COMMERCIAL_SECRET_REF?"billing-ci-fixture-credential-1234567890":
  ref===IRON_PLAN_GOVERNANCE_SECRET_REF?"dedicated-governance-ci-credential-1234567":undefined;

describe("IRON governed legacy LIMIT contract",()=>{
  it("rejects cross-gym, duplicate rows, unsupported or invalid effective grants",()=>{
    expect(parseIronLegacyLimits(payload,gymId)[0]).toMatchObject(row);
    for(const invalid of [
      {...payload,gymId:subscriptionId},
      {...payload,limits:[row,row]},
      {...payload,limits:[{...row,planLimit:5}]},
      {...payload,limits:[{...row,effectiveLimit:0}]},
      {...payload,limits:[{...row,subscriptionId:null}]},
      {...payload,limits:[{...row,status:"AVAILABLE"}]},
    ])expect(()=>parseIronLegacyLimits(invalid,gymId)).toThrow();
    expect(parseIronLegacyLimits({...payload,limits:[{...row,status:"BLOCKED",effectiveLimit:0,reason:"review denied"}]},gymId)).toHaveLength(1);
  });
  it("uses the dedicated bearer and verifies actual write result",async()=>{
    const responses=[payload,{removed:true,featureKey:row.featureKey,effectiveLimit:100}];
    const fetcher=vi.fn(async()=>new Response(JSON.stringify(responses.shift()),{status:200}));
    const connector=new IronCommercialConnector(resolve,fetcher as typeof fetch,()=>["https://iron.example.test"],()=>source.tenantId);
    await connector.legacyLimits(context,source,gymId);
    await connector.alignLegacyLimit(context,source,gymId,row.featureKey,approval);
    const calls=fetcher.mock.calls as unknown as [string,RequestInit][];
    expect(calls[1][0]).toContain("/legacy-limits/"+gymId+"/"+row.featureKey+"/align");
    expect(calls[1][1].method).toBe("POST");
    expect(JSON.parse(String(calls[1][1].body))).toEqual(approval);
    for(const [,init] of calls){
      expect((init.headers as Headers).get("authorization")).toBe("Bearer "+resolve(IRON_PLAN_GOVERNANCE_SECRET_REF));
      expect(init.redirect).toBe("error");expect(init.cache).toBe("no-store");
    }
    const wrong= new IronCommercialConnector(resolve,vi.fn(async()=>new Response(JSON.stringify({removed:true,featureKey:row.featureKey,effectiveLimit:999}),{status:200})) as typeof fetch,()=>["https://iron.example.test"],()=>source.tenantId);
    await expect(wrong.alignLegacyLimit(context,source,gymId,row.featureKey,approval)).rejects.toThrow("response_invalid");
    await expect(connector.legacyLimits({...context,tenantId:"other"},source,gymId)).rejects.toThrow("tenant_denied");
  });
  it("preserves FM authority, explicit approval, stale-state revalidation and canonical readback",()=>{
    const route=readFileSync("src/app/api/billing/products/[productId]/iron-legacy-limits/route.ts","utf8");
    const page=readFileSync("src/app/dashboard/products/[productId]/billing/page.tsx","utf8");
    const panel=readFileSync("src/app/dashboard/products/[productId]/billing/iron-legacy-limits-panel.tsx","utf8");
    expect(route).toContain('requirePermission(context,"billing:write")');
    expect(route).toContain("verifyPasswordStepUp(h,d.password)");
    expect(route).toContain("environmentIronControlTenantId()");
    expect(route).toContain("row.configurationId!==d.configurationId");
    expect(route).toContain("a.connector.legacyLimits(a.connection,a.source,d.gymId)");
    expect(route).toContain("iron_legacy_readback_unconfirmed");
    expect(route).toContain("ALINHAR_AO_LIMITE_DO_PLANO");
    expect(panel).toContain("Confirmo a remoção desta restrição");
    expect(page).toContain("<IronLegacyLimitsPanel");
    expect(panel).not.toContain("localStorage");
  });
});
