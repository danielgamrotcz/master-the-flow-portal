import { rateLimit, ipKey } from './_ratelimit.js';

const KEY = 'event:2026-10-21:registration-count';
const MAX_AGE_MS = 15 * 60 * 1000;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const json = (data, status = 200) => Response.json(data, { status, headers });

async function equalSecret(a, b) {
  const encoder = new TextEncoder();
  const hashes = await Promise.all([a, b].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const [left, right] = hashes.map(value => new Uint8Array(value));
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function onRequestGet({ env }) {
  const unknown = { registeredCount: null, updatedAt: null };
  try {
    const raw = env.MTF_DATA ? await env.MTF_DATA.get(KEY) : null;
    const data = raw ? JSON.parse(raw) : null;
    const age = data ? Date.now() - Date.parse(data.updatedAt) : NaN;
    if (!data || !validCount(data.registeredCount) || !Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) return json(unknown);
    return json({ registeredCount: data.registeredCount, updatedAt: data.updatedAt });
  } catch { return json(unknown); }
}

export async function onRequestPost({ request, env }) {
  const supplied = request.headers.get('x-attendees-secret');
  if (!supplied || !env.VIBE_CODING_SYNC_SECRET || !await equalSecret(supplied, env.VIBE_CODING_SYNC_SECRET)) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (await rateLimit(env, 'vibe-count-sync:' + ipKey(ip), 120, 3600)) return json({ error: 'Too many requests' }, 429);
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Bad request' }, 400);
  if (!env.MTF_DATA) return json({ error: 'Storage unavailable' }, 503);
  // Bound actual bytes, not only the optional/untrusted Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Bad request' }, 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128) { await reader.cancel(); return json({ error: 'Payload too large' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || Object.keys(data).join(',') !== 'registeredCount' || !validCount(data.registeredCount)) return json({ error: 'Invalid count' }, 400);
    const stored = { registeredCount: data.registeredCount, updatedAt: new Date().toISOString() };
    await env.MTF_DATA.put(KEY, JSON.stringify(stored));
    return json({ ok: true });
  } catch (error) { return json({ error: error instanceof SyntaxError ? 'Bad request' : 'Sync failed' }, error instanceof SyntaxError ? 400 : 500); }
}
