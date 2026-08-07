// Krátkodobý podepsaný ticket pro sdílený odkaz. Na rozdíl od starého ?k=
// neobsahuje globální GATE_CODE a po vypršení ho nelze použít k nové session.

export const SHARE_TICKET_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CARD_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{2}$/;
const HEX_RE = /^[0-9a-f]+$/;

async function hmac(secret, payload, usage) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, [usage]
  );
  return { key, bytes: new TextEncoder().encode(payload) };
}

export async function createShareTicket(cardId, secret) {
  if (!CARD_ID_RE.test(cardId) || !secret) return null;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const payload = `${Date.now()}.${cardId}.${nonce}`;
  const { key, bytes } = await hmac(secret, payload, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, bytes);
  const sigHex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${sigHex}`;
}

export async function verifyShareTicket(ticket, secret) {
  if (!ticket || typeof ticket !== 'string' || ticket.length > 180 || !secret) return null;
  const parts = ticket.split('.');
  if (parts.length !== 4) return null;
  const [tsRaw, cardId, nonce, sigHex] = parts;
  const ts = Number(tsRaw);
  const now = Date.now();
  if (!Number.isSafeInteger(ts) || ts > now + MAX_CLOCK_SKEW_MS || now > ts + SHARE_TICKET_TTL_MS) return null;
  if (!CARD_ID_RE.test(cardId) || nonce.length !== 32 || !HEX_RE.test(nonce)) return null;
  if (sigHex.length !== 64 || !HEX_RE.test(sigHex)) return null;

  try {
    const payload = `${tsRaw}.${cardId}.${nonce}`;
    const { key, bytes } = await hmac(secret, payload, 'verify');
    const sig = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    return await crypto.subtle.verify('HMAC', key, sig, bytes) ? { cardId, ts } : null;
  } catch {
    return null;
  }
}
