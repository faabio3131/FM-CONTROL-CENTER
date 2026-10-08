import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptGatewaySecret, decryptGatewaySecret, getBillingVaultKey, VaultUnavailableError } from "../src/infrastructure/billing/encrypted-gateway-vault";

describe("tenant-bound encrypted gateway vault", () => {
  const key = randomBytes(32);
  it("encrypts at rest with authenticated tenant and account binding", () => {
    const encrypted = encryptGatewaySecret("fm", "account-fm", "test-secret-only", key);
    expect(JSON.stringify(encrypted)).not.toContain("test-secret-only");
    expect(decryptGatewaySecret("fm", "account-fm", encrypted, key)).toBe("test-secret-only");
    expect(() => decryptGatewaySecret("abc", "account-fm", encrypted, key)).toThrow();
    expect(() => decryptGatewaySecret("fm", "account-abc", encrypted, key)).toThrow();
  });
  it("rejects tampered ciphertext and wrong keys", () => {
    const encrypted = encryptGatewaySecret("fm", "account-fm", "test-secret-only", key);
    expect(() => decryptGatewaySecret("fm", "account-fm", encrypted, randomBytes(32))).toThrow();
    expect(() => decryptGatewaySecret("fm", "account-fm", {...encrypted,ciphertext:Buffer.from("tampered").toString("base64")}, key)).toThrow();
  });
  it("refuses operation without a configured managed key", () => {
    const existing = process.env.FMCC_BILLING_VAULT_KEY_B64;
    try {
      delete process.env.FMCC_BILLING_VAULT_KEY_B64;
      expect(() => getBillingVaultKey()).toThrow(VaultUnavailableError);
      process.env.FMCC_BILLING_VAULT_KEY_B64 = "short";
      expect(() => getBillingVaultKey()).toThrow(VaultUnavailableError);
    } finally {
      if (existing===undefined) delete process.env.FMCC_BILLING_VAULT_KEY_B64;
      else process.env.FMCC_BILLING_VAULT_KEY_B64=existing;
    }
  });
});
