import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {AsaasProductionPilot,PRODUCTION_PILOT_REFERENCE} from "../src/infrastructure/billing/asaas-production-pilot";
describe("Asaas real R$1 pilot - fail closed",()=>{
 const original=process.env.FMCC_ASAAS_PRODUCTION_API_KEY;
 beforeEach(()=>{process.env.FMCC_ASAAS_PRODUCTION_API_KEY="test-only-key";});
 afterEach(()=>{if(original===undefined)delete process.env.FMCC_ASAAS_PRODUCTION_API_KEY;else process.env.FMCC_ASAAS_PRODUCTION_API_KEY=original;});
 const input={customerId:"cus_test123",dueDate:"2026-10-20",authorization:"AUTHORIZE_REAL_PIX_BRL_1_00"};
 it("rejects absent authorization without network",async()=>{
  const transport=vi.fn();
  await expect(new AsaasProductionPilot(transport).createOneRealPix({...input,authorization:""})).rejects.toThrow("authorization_missing");
  expect(transport).not.toHaveBeenCalled();
 });
 it("blocks duplicate charge with only GET",async()=>{
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[{id:"pay_old"}],totalCount:1})});
  await expect(new AsaasProductionPilot(transport).createOneRealPix(input)).rejects.toThrow("already_present");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1].method).toBe("GET");
 });
 it("blocks unknown provider response",async()=>{
  const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});
  await expect(new AsaasProductionPilot(transport).createOneRealPix(input)).rejects.toThrow("unavailable");
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it("blocks provider authentication failure",async()=>{
  const transport=vi.fn().mockResolvedValue({ok:false,status:401});
  await expect(new AsaasProductionPilot(transport).createOneRealPix(input)).rejects.toThrow("production_http_401");
  expect(transport).toHaveBeenCalledTimes(1);
 });
 it("sends exactly one R$1 PIX with immutable reference after clear lookup",async()=>{
  const transport=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({data:[],totalCount:0})})
   .mockResolvedValueOnce({ok:true,json:async()=>({id:"pay_real",externalReference:PRODUCTION_PILOT_REFERENCE,value:1,billingType:"PIX",invoiceUrl:"https://www.asaas.com/i/example"})});
  const result=await new AsaasProductionPilot(transport).createOneRealPix(input);
  expect(result.id).toBe("pay_real");
  expect(transport).toHaveBeenCalledTimes(2);
  const [endpoint,request]=transport.mock.calls[1];
  expect(endpoint).toBe("https://api.asaas.com/v3/payments");
  expect(request.method).toBe("POST");
  expect(JSON.parse(request.body)).toMatchObject({value:1,billingType:"PIX",externalReference:PRODUCTION_PILOT_REFERENCE,customer:"cus_test123"});
 });
});
