import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

export class VaultUnavailableError extends Error {
  constructor() { super("billing.vault_unavailable"); }
}
/** Application-encrypted envelope in PostgreSQL. The 256-bit key must be injected from a
 * separately governed secrets manager, NEVER saved in the database/repository. */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: string;
}
export function getBillingVaultKey(): Buffer {
  const encoded = process.env.FMCC_BILLING_VAULT_KEY_B64;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new VaultUnavailableError();
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.equals(Buffer.alloc(32))) throw new VaultUnavailableError();
  return key;
}
export function encryptGatewaySecret(tenantId: string, accountId: string, secret: string, key: Buffer): EncryptedSecret {
  if (!tenantId || !accountId || !secret || secret.length > 16000 || key.length !== 32) throw new VaultUnavailableError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(JSON.stringify([tenantId, accountId]), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: createHash("sha256").update(key).digest("hex").slice(0, 16),
  };
}
export function decryptGatewaySecret(tenantId: string, accountId: string, value: EncryptedSecret, key: Buffer): string {
  if (createHash("sha256").update(key).digest("hex").slice(0, 16) !== value.keyVersion) throw new VaultUnavailableError();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAAD(Buffer.from(JSON.stringify([tenantId, accountId]), "utf8"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
