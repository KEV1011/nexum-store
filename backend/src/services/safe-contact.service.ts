// ─────────────────────────────────────────────────────────────────────────────
// Safe-contact module — number privacy between passengers and drivers.
//
// Like Uber/Didi, ZIPA NEVER exposes the other party's real phone number by
// default. Cross-party DTOs carry a `contactChannel` ('in_app_chat') plus an
// optional `maskedPhone` (e.g. "+57 •••• ••• 12") shown only as a reference —
// never as a directly-dialable number.
//
// Direct calling is disabled until a call-proxy provider (Twilio/PBX) is wired
// up. `getProxyNumber` is the documented stub seam for that — see SAFETY_NOTES.md.
// ─────────────────────────────────────────────────────────────────────────────

export type ContactChannel = 'in_app_chat' | 'call_proxy';

export interface SafeContact {
  /** Primary communication channel between the parties. */
  contactChannel: ContactChannel;
  /** Reference-only masked number; never the full real number. */
  maskedPhone?: string;
}

/**
 * Mask a phone number keeping only the last two digits.
 * "+57 312 678 9012" → "+57 •••• ••• 12". Returns undefined for empty input.
 */
export function maskPhone(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 2) return '+57 •••• ••• ••';
  const last2 = digits.slice(-2);
  return `+57 •••• ••• ${last2}`;
}

/**
 * Build the default safe-contact payload for the other party. The real number
 * is intentionally dropped; only the masked reference (if any) is included.
 */
export function safeContact(realPhone?: string | null): SafeContact {
  return { contactChannel: 'in_app_chat', maskedPhone: maskPhone(realPhone) };
}

/**
 * STUB — masked call proxy. When a real provider (Twilio Proxy or a PBX) is
 * integrated, this returns a temporary proxy number that bridges the two
 * parties without revealing their real numbers. Until then it returns null and
 * direct calling stays disabled (chat is the channel). See SAFETY_NOTES.md.
 */
export function getProxyNumber(_tripId: string, _role: 'driver' | 'passenger'): string | null {
  return null;
}
