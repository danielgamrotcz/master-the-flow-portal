// Sdílené ověření přístupového tokenu (HMAC + nonce v KV).
//
// Token se vydává v /api/auth a putuje dvěma cestami:
//   1. v JSON odpovědi → localStorage → hlavička x-mtf-token (API volání)
//   2. v HttpOnly cookie → automaticky u všech same-origin requestů
//
// Cookie je tu kvůli datovým souborům. Ty načítá i service worker a ten do
// requestu vlastní hlavičku nepřidá, takže hlavičkou by se offline režim
// rozbil. Cookie prohlížeč připojí sám, včetně fetchů ze service workeru.

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const COOKIE_NAME = 'mtf_gate';

export async function verifyToken(token, gateCode, env) {
  if (!token || typeof token !== 'string' || !gateCode) return null;
  const lastColon = token.lastIndexOf(':');
  if (lastColon < 1) return null;
  const payload = token.slice(0, lastColon);
  const sigHex = token.slice(lastColon + 1);
  if (sigHex.length !== 64 || !/^[0-9a-f]+$/.test(sigHex)) return null;
  const parts = payload.split(':');
  const ts = parseInt(parts[0], 10);
  if (isNaN(ts) || Date.now() > ts + TOKEN_TTL_MS) return null;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(gateCode),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const ok = await crypto.subtle.verify(
      'HMAC', key, sigBytes, new TextEncoder().encode(payload));
    if (!ok) return null;
    const nonce = parts[1];
    // Nonce v KV dělá token odvolatelným. Chybí-li, token byl zneplatněn.
    if (env?.MTF_DATA && !(await env.MTF_DATA.get('token:' + nonce))) return null;
    return nonce || null;
  } catch { return null; }
}

export function readCookie(request, name) {
  const raw = request.headers.get('Cookie');
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

/** Set-Cookie pro přístupový token. Secure jen přes https, jinak by cookie
 *  nefungovala ve wrangler dev na http a rozbila by lokální testy. */
export function gateCookie(request, token) {
  const https = new URL(request.url).protocol === 'https:';
  const bits = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`,
  ];
  if (https) bits.push('Secure');
  return bits.join('; ');
}
