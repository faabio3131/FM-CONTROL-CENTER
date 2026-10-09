import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {AsaasProductionPilot,PRODUCTION_PILOT_REFERENCE} from "../src/infrastructure/billing/asaas-production-pilot";
describe("Asaas real R$1 pilot - fail closed",()=>{
 const original=process.env.FMCC_ASAAS_PRODUCTION_API_KEY;
 beforeEach(()=>{process.env.FMCC_ASAAS_PRODUCTION_API_KEY="test-only-key";});
 afterEach(()=>{if(original===undefined)delete process.env.FMCC_ASAAS_PRODUCTION_API_KEY;else process.env.FMCC_ASAAS_PRODUCTION_API_KEY=original;});
 const input={customerId:"cus_test123",dueDate:"2026-10-20",authorization:"AUTHORIZE_REAL_PIX_BRL_1_00",tenantId:"ci-tenant",invoiceId:"a51a5000-1990-4000-8000-000000000001",gatewayAccountId:"c51a5000-1990-4000-8000-000000000001"};
 const ledger=()=>({reserve:vi.fn().mockResolvedValue(true),persistProviderPayment:vi.fn().mockResolvedValue(undefined),markProviderConfirmed:vi.fn().mockResolvedValue(undefined)});
 it("rejects absent authorization without network",async()=>{
  const transport=vi.fn();
  await expect(new AsaasProductionPilot(ledger(),transport).createOneRealPix({...input,authorization:""})).rejects.toThrow("authorization_missing");
  expect(transport).not.toHaveBeenCalled();
 });
 it("blocks duplicate charge with only GET",async()=>{
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[{id:"pay_old"}],totalCount:1})});
  await expect(new AsaasProductionPilot(ledger(),transport).createOneRealPix(input)).rejects.toThrow("already_present");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1].method).toBe("GET");
 });
 it("blocks unknown provider response",async()=>{
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});
  await expect(new AsaasProductionPilot(ledger(),transport).createOneRealPix(input)).rejects.toThrow("unavailable");
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it("blocks provider authentication failure",async()=>{
  const transport=vi.fn().mockResolvedValue({ok:false,status:401});
  await expect(new AsaasProductionPilot(ledger(),transport).createOneRealPix(input)).rejects.toThrow("production_http_401");
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it("sends exactly one R$1 PIX with immutable reference after clear lookup",async()=>{
  const transport=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({data:[],totalCount:0})})
   .mockResolvedValueOnce({ok:true,json:async()=>({id:"pay_real",externalReference:PRODUCTION_PILOT_REFERENCE,value:1,billingType:"PIX",invoiceUrl:"https://www.asaas.com/i/example"})});
  const store=ledger();
  const result=await new AsaasProductionPilot(store,transport).createOneRealPix(input);
  expect(store.reserve).toHaveBeenCalledTimes(1);
  expect(store.persistProviderPayment).toHaveBeenCalledTimes(1);
  expect(result.id).toBe("pay_real");
  expect(transport).toHaveBeenCalledTimes(2);
  const [endpoint,request]=transport.mock.calls[1];
  expect(endpoint).toBe("https://api.asaas.com/v3/payments");
  expect(request.method).toBe("POST");
  expect(JSON.parse(request.body)).toMatchObject({value:1,billingType:"PIX",externalReference:PRODUCTION_PILOT_REFERENCE,customer:"cus_test123"});
 });
 it("blocks second execution if persistent invoice is claimed",async()=>{
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[],totalCount:0})});
  const store=ledger();store.reserve.mockResolvedValue(false);
  await expect(new AsaasProductionPilot(store,transport).createOneRealPix(input)).rejects.toThrow("claim_denied");
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it("does not mark invoice paid when gateway status is pending",async()=>{
  const store=ledger();
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"pay_fixture",externalReference:PRODUCTION_PILOT_REFERENCE,value:1,billingType:"PIX",status:"PENDING"})});
  expect(await new AsaasProductionPilot(store,transport).reconcileRealPix({...input,externalPaymentId:"pay_fixture"})).toBe("pending");
  expect(store.markProviderConfirmed).not.toHaveBeenCalled();
 });
 it("rejects mismatched amount without marking paid",async()=>{
  const store=ledger();
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"pay_fixture",externalReference:PRODUCTION_PILOT_REFERENCE,value:2,billingType:"PIX",status:"RECEIVED"})});
  await expect(new AsaasProductionPilot(store,transport).reconcileRealPix({...input,externalPaymentId:"pay_fixture"})).rejects.toThrow("reconciliation_mismatch");
  expect(store.markProviderConfirmed).not.toHaveBeenCalled();
 });
 it("marks paid only after verified provider confirmation",async()=>{
  const store=ledger();
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"pay_fixture",externalReference:PRODUCTION_PILOT_REFERENCE,value:1,billingType:"PIX",status:"RECEIVED"})});
  expect(await new AsaasProductionPilot(store,transport).reconcileRealPix({...input,externalPaymentId:"pay_fixture"})).toBe("paid");
  expect(store.markProviderConfirmed).toHaveBeenCalledTimes(1);
 });

});
