import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHATSAPP_QR_DISPLAY_SECONDS,
  effectiveQRDisplaySeconds,
  parseWhatsAppQRDisplaySeconds,
} from "../src/domain/integration/whatsapp-qr-policy";

describe("FM Command WhatsApp QR display TTL policy",()=>{
  it("defaults to the corporate-approved 45 seconds",()=>{
    expect(DEFAULT_WHATSAPP_QR_DISPLAY_SECONDS).toBe(45);
    expect(parseWhatsAppQRDisplaySeconds(45)).toBe(45);
  });
  it.each([0,-1,14,121,45.5,"45",null,undefined,NaN,Infinity])(
    "fails closed on invalid policy %s",value=>{
      expect(()=>parseWhatsAppQRDisplaySeconds(value)).toThrow("whatsapp.qr.display_seconds_invalid");
    },
  );
  it("never extends a shorter provider expiry",()=>{
    expect(effectiveQRDisplaySeconds(45,30)).toBe(30);
    expect(effectiveQRDisplaySeconds(45,90)).toBe(45);
    expect(effectiveQRDisplaySeconds(45,0)).toBe(0);
    expect(effectiveQRDisplaySeconds(45,null)).toBe(45);
    expect(effectiveQRDisplaySeconds(45,29.8)).toBe(29);
  });
});
