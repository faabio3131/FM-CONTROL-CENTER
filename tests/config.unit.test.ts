import { afterEach,describe,expect,it } from "vitest";
import { serverEnv } from "@/config/env";
const db=process.env.DATABASE_URL, secret=process.env.BETTER_AUTH_SECRET;
afterEach(()=>{process.env.DATABASE_URL=db;process.env.BETTER_AUTH_SECRET=secret});
describe("server config",()=>{
  it("falha fechado sem secret",()=>{process.env.DATABASE_URL="postgresql://example";delete process.env.BETTER_AUTH_SECRET;expect(()=>serverEnv()).toThrow("config.missing:BETTER_AUTH_SECRET")});
  it("rejeita secret curto",()=>{process.env.DATABASE_URL="postgresql://example";process.env.BETTER_AUTH_SECRET="short";expect(()=>serverEnv()).toThrow("config.BETTER_AUTH_SECRET_too_short")});
});
