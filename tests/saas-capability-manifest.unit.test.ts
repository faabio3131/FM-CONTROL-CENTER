import { describe, expect, it } from "vitest";
import {
  inspectSaasCapabilityManifest, SAAS_CAPABILITY_MANIFEST_VERSION,
} from "@/application/integration/saas-capability-manifest";
import {
  SAAS_ADAPTER_PROFILES,
} from "@/application/integration/saas-adapter-profiles";
import { KordenaCommercialConnector } from "@/infrastructure/integration/kordena-commercial-connector";
import { IronCommercialConnector } from "@/infrastructure/integration/iron-commercial-connector";
import type { Connector } from "@/domain/integration/contracts";

const now = new Date("2026-10-20T14:00:00Z");
const manifest = (profile=SAAS_ADAPTER_PROFILES[0], caps:readonly string[] = [
  "commercial.snapshot", "commercial.facts",
]) => ({
  schema_version: SAAS_CAPABILITY_MANIFEST_VERSION,
  product_slug: profile.productSlug,
  source_type: profile.sourceType,
  mapping_version: profile.mappingVersion,
  valid_from: "2026-10-20T13:59:00Z",
  valid_until: "2026-10-20T14:05:00Z",
  capabilities: caps,
});
describe("C08 offline capability manifest precheck (not S2S auth)", () => {
  it("reconhece contratos locais de Kordena e IRON sem alegar E2E", () => {
    for (const [profile, connector] of [
      [SAAS_ADAPTER_PROFILES[0],new KordenaCommercialConnector()],
      [SAAS_ADAPTER_PROFILES[1],new IronCommercialConnector()],
    ] as const) {
      const result=inspectSaasCapabilityManifest(manifest(profile),profile,connector,now);
      expect(result.schema_version).toBe("fmcc.saas-capabilities.v1");
      expect(result.capabilities).toEqual(["commercial.snapshot","commercial.facts"]);
      expect(Object.keys(result)).not.toContain("tenant_id");
      expect(Object.keys(result)).not.toContain("authorized");
    }
  });
  it("nega identity/version drift e capacidades não suportadas", () => {
    const profile=SAAS_ADAPTER_PROFILES[1],connector=new IronCommercialConnector();
    for(const bad of [
      {...manifest(profile),schema_version:"v99"},
      {...manifest(profile),product_slug:"kordena"},
      {...manifest(profile),mapping_version:"iron-v2"},
      {...manifest(profile),source_type:"kordena-commercial-v1"},
      {...manifest(profile),capabilities:["commercial.snapshot","commercial.facts","commercial.billing.write"]},
      {...manifest(profile),capabilities:["commercial.snapshot","commercial.snapshot"]},
    ]) {
      expect(() => inspectSaasCapabilityManifest(bad,profile,connector,now)).toThrow();
    }
  });
  it("nega token, URL e tenant externo injetados no manifest", () => {
    const profile=SAAS_ADAPTER_PROFILES[0],connector=new KordenaCommercialConnector();
    for(const key of ["secretRef","token","baseUrl","tenant_id"]) {
      expect(() => inspectSaasCapabilityManifest({
        ...manifest(profile), [key]:"should-never-be-sent",
      },profile,connector,now)).toThrow("integration.manifest_unexpected_field");
    }
  });
  it("nega expiração, janela longa, emissão futura e datas inválidas", () => {
    const profile=SAAS_ADAPTER_PROFILES[0],connector=new KordenaCommercialConnector();
    for(const bad of [
      {...manifest(profile),valid_until:"2026-10-20T13:59:59Z"},
      {...manifest(profile),valid_until:"2026-10-20T16:59:00Z"},
      {...manifest(profile),valid_from:"2026-10-20T14:01:00Z"},
      {...manifest(profile),valid_from:"not-a-date"},
    ]) {
      expect(() => inspectSaasCapabilityManifest(bad,profile,connector,now)).toThrow("integration.manifest_validity_invalid");
    }
  });
  it("aceita um SaaS sintético apenas após fornecer adaptador tipado", () => {
    const profile={...SAAS_ADAPTER_PROFILES[1],productSlug:"future",
      sourceType:"future-commercial-v1",mappingVersion:"future-commercial-v1"};
    const connector:Connector={
      sourceType:"future-commercial-v1",
      capabilities:["commercial.snapshot","commercial.facts"],
      async health(){return "healthy";},
    };
    expect(inspectSaasCapabilityManifest(manifest(profile),profile,connector,now).product_slug).toBe("future");
    expect(() => inspectSaasCapabilityManifest(manifest(profile),profile,new IronCommercialConnector(),now))
      .toThrow("integration.manifest_identity_mismatch");
  });
});
