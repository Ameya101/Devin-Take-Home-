function fractionDigits(currency: string): number {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Formats integer minor units: formatMoney(123456, "USD") -> "$1,234.56". */
export function formatMoney(minorUnits: number, currency: string): string {
  if (!Number.isInteger(minorUnits)) throw new Error("formatMoney expects integer minor units");
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minorUnits / 10 ** digits);
}

/** Parses a user-entered decimal string into integer minor units without float math. "12.5" -> 1250. */
export function parseToMinorUnits(input: string, currency = "USD"): number | null {
  const digits = fractionDigits(currency);
  const match = input.trim().match(/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const whole = match[1].replace(/,/g, "");
  const frac = match[2] ?? "";
  if (frac.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
}
