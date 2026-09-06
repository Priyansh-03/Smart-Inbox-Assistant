// Parse an RFC-5322-ish "Name <email>" sender string into its two parts.
// Falls back gracefully for bare emails or bare names.

export interface Sender { name: string; email: string; }

export function parseSender(raw: string | null | undefined): Sender {
  const s = (raw || '').trim();
  const withAngle = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (withAngle) {
    const email = withAngle[2].trim();
    return { name: withAngle[1].trim() || email, email };
  }
  if (/@/.test(s)) return { name: s, email: s };
  return { name: s || '(unknown sender)', email: '' };
}
