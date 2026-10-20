/** Corporate display cap only; never claims to extend the WhatsApp provider QR validity. */
export const DEFAULT_WHATSAPP_QR_DISPLAY_SECONDS = 45;
export const MIN_WHATSAPP_QR_DISPLAY_SECONDS = 15;
export const MAX_WHATSAPP_QR_DISPLAY_SECONDS = 120;

export class WhatsAppQRPolicyInvalid extends Error {}

export function parseWhatsAppQRDisplaySeconds(raw: unknown): number {
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < MIN_WHATSAPP_QR_DISPLAY_SECONDS ||
    raw > MAX_WHATSAPP_QR_DISPLAY_SECONDS
  ) {
    throw new WhatsAppQRPolicyInvalid("whatsapp.qr.display_seconds_invalid");
  }
  return raw;
}

export function effectiveQRDisplaySeconds(
  corporateSeconds: number,
  providerRemainingSeconds: number | null,
): number {
  const fmCap = parseWhatsAppQRDisplaySeconds(corporateSeconds);
  if (providerRemainingSeconds === null) return fmCap;
  if (!Number.isFinite(providerRemainingSeconds) || providerRemainingSeconds <= 0) return 0;
  return Math.min(fmCap, Math.floor(providerRemainingSeconds));
}
