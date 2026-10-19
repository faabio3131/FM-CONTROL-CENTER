/** Internal FM price-input parser. Never performs exchange conversion or rounding. */
export function parseIronCommercialAmount(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  if (!/^[0-9]{1,9}(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
