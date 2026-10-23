import {describe,expect,it,vi} from "vitest";
vi.mock("../src/infrastructure/db/client",()=>({db:{}}));
vi.mock("../src/application/billing/vende-core-quota-readback",()=>({
  readVendeCoreQuotaEvidence:vi.fn(),
}));
import {
  projectQuotaObservation,matchesVendeQuotaObservationReplay,
  unchangedVendeCorrectionSnapshot,
} from "../src/application/billing/vende-compensation-quota-observation";

const productId="11111111-1111-4111-8111-111111111111";
const intentId="22222222-2222-4222-8222-222222222222";
const observationId="33333333-3333-4333-8333-333333333333";
const input={
  productId,intentId,observationId,unitId:"unit-a",
  capability:"atendimento_interpretacao" as const,
};
const now=new Date("2026-10-22T20:00:00.000Z");
const evidence:Parameters<typeof projectQuotaObservation>[0]={
  intentId,unitId:"unit-a",capability:"atendimento_interpretacao",
  state:"core_unit_policy_verified",licenseFreshlyVerified:true,
  coreQuotaVerified:true,
  quotaMetrics:[
    {metric:"ai.requests",scope:"unit",limitUnits:100,
      windowSeconds:86400,reservedUnits:2,consumedUnits:5,remainingUnits:93},
    {metric:"ai.total_tokens",scope:"tenant",limitUnits:10000,
      windowSeconds:86400,reservedUnits:200,consumedUnits:500,remainingUnits:9300},
  ],
  caseResolved:false,providerCalled:false,reservationCreated:false,
  allUnitsVerified:false,futureAiAdmissionGuaranteed:false,
};
describe("F9 immutable historical quota observation",()=>{
  it("projects scoped observed counters, never invoice confirmation or closure",()=>{
    const r=projectQuotaObservation(evidence,input,now);
    expect(r).toMatchObject({
      intentId,unitId:"unit-a",productId,observedAt:now.toISOString(),
      licenseVerifiedAtObservation:true,
      paymentVerifiedAtObservation:true,coreQuotaVerifiedAtObservation:true,
      historicalOnly:true,caseResolved:false,allUnitsVerified:false,
      noQuotaReservation:true,providerRefundExecuted:false,
    });
    expect(r.quotaMetrics).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain("serviceKey");
  });
  it("fails closed for unscoped, incomplete or artificially inflated proof",()=>{
    for(const invalid of [
      {...evidence,unitId:"unit-b"},
      {...evidence,intentId:"foreign"},
      {...evidence,licenseFreshlyVerified:false},
      {...evidence,coreQuotaVerified:false},
      {...evidence,providerCalled:true},
      {...evidence,reservationCreated:true},
      {...evidence,caseResolved:true},
      {...evidence,allUnitsVerified:true},
      {...evidence,futureAiAdmissionGuaranteed:true},
      {...evidence,quotaMetrics:[]},
      {...evidence,quotaMetrics:evidence.quotaMetrics.slice(0,1)},
    ]){
      expect(()=>projectQuotaObservation(
        invalid as typeof evidence,input,now,
      )).toThrow("vende.compensation_quota_observation_denied");
    }
  });
});

describe("F9 financial-compensation evidence retry fences",()=>{
  const user={
    tenantId:"fm-corporate",userId:"fm-human",role:"owner" as const,
    correlationId:"test-retry",
  };
  const recorded={
    tenantId:user.tenantId,actorId:user.userId,actorType:"user",
    action:"vende.compensation_unit_quota.observed",
    resourceType:"vende_compensation_intent",resourceId:intentId,
    metadata:projectQuotaObservation(evidence,input,now),
  };
  it("accepts the exact same historical retry without reasserting fresh balance",()=>{
    expect(matchesVendeQuotaObservationReplay(recorded,user,input)).toBe(true);
  });
  it("rejects collision, tenant swap, operator swap and altered payload",()=>{
    const tampered=[
      {...recorded,tenantId:"another-fm"},
      {...recorded,actorId:"another-operator"},
      {...recorded,resourceId:productId},
      {...recorded,action:"vende.payment.settled"},
      {...recorded,actorType:"service"},
      {...recorded,metadata:{...recorded.metadata,unitId:"other"}},
      {...recorded,metadata:{...recorded.metadata,caseResolved:true}},
      {...recorded,metadata:{...recorded.metadata,noQuotaReservation:false}},
    ];
    for(const other of tampered)
      expect(matchesVendeQuotaObservationReplay(other,user,input)).toBe(false);
  });
  it("denies race with command revision, delivery state or signed grant changes",()=>{
    const current={
      id:"44444444-4444-4444-8444-444444444444",
      state:"delivered" as const,revision:7,
      deliveryTarget:{
        schema:"fm.vende.reactivation-target.v1" as const,
        planCode:"PLUS",planRevision:7,validUntil:1790000000,
      },
    };
    expect(unchangedVendeCorrectionSnapshot(current,current)).toBe(true);
    for(const changed of [
      {...current,revision:8},
      {...current,state:"unknown" as const},
      {...current,id:"55555555-5555-4555-8555-555555555555"},
      {...current,deliveryTarget:{...current.deliveryTarget,planRevision:8}},
      {...current,deliveryTarget:{...current.deliveryTarget,validUntil:1790000001}},
    ])expect(unchangedVendeCorrectionSnapshot(current,changed)).toBe(false);
  });
});
