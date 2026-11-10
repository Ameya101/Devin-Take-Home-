/** jane.doe@example.com -> j*******@example.com */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  return `${local[0]}${"*".repeat(Math.max(local.length - 1, 3))}${email.slice(at)}`;
}

/** 4242 -> •••• 4242 */
export function maskCard(last4: string): string {
  return `•••• ${last4.slice(-4)}`;
}

/** GB29NWBK60161331926819 -> ••••6819 */
export function maskAccountNumber(account: string): string {
  const compact = account.replace(/\s+/g, "");
  return compact.length <= 4 ? "••••" : `••••${compact.slice(-4)}`;
}

/** Olivia Martin -> Olivia M. */
export function maskName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first ?? "";
}
