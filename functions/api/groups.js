import { rateLimit, ipKey } from './_ratelimit.js';
import { buildBalancedGroups } from './_groups.js';

const DEFAULT_EVENT_ID = 'master-the-flow-2026-08-29';
const ADMIN_HEADER = 'x-groups-admin';
const PARTICIPANT_HEADER = 'x-groups-participant';
const MAX_BODY_BYTES = 4096;
const MAX_NICKNAME_LENGTH = 40;
const REGISTER_LIMIT_PER_TOKEN_10_MINUTES = 10;
const REGISTER_LIMIT_PER_IP_10_MINUTES = 200;
const ADMIN_FAILURE_LIMIT_PER_HOUR = 30;
const SCHEMA_READY = new WeakSet();

const CREATE_EVENT_SQL = `CREATE TABLE IF NOT EXISTS group_events (
  event_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('open', 'locking', 'finalized', 'expired')),
  groups_json TEXT,
  created_at INTEGER NOT NULL,
  finalized_at INTEGER
)`;

const CREATE_PARTICIPANTS_SQL = `CREATE TABLE IF NOT EXISTS group_participants (
  event_id TEXT NOT NULL,
  participant_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL,
  experience INTEGER NOT NULL CHECK (experience BETWEEN 1 AND 10),
  has_laptop INTEGER NOT NULL CHECK (has_laptop IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, participant_hash),
  FOREIGN KEY (event_id) REFERENCES group_events(event_id) ON DELETE CASCADE
)`;

const CREATE_NICKNAME_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS idx_group_participants_event_nickname
ON group_participants(event_id, nickname_key)`;

function eventId(env) {
  const configured = typeof env.GROUPS_EVENT_ID === 'string' ? env.GROUPS_EVENT_ID.trim() : '';
  return configured || DEFAULT_EVENT_ID;
}

async function ensureSchema(env) {
  const db = env.VOTES_DB;
  if (!db) throw new Error('Storage unavailable');
  if (SCHEMA_READY.has(db)) return;
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(CREATE_EVENT_SQL),
    db.prepare(CREATE_PARTICIPANTS_SQL),
    db.prepare(CREATE_NICKNAME_INDEX_SQL),
    db.prepare(`INSERT OR IGNORE INTO group_events (event_id, status, created_at)
      VALUES (?1, 'open', ?2)`).bind(eventId(env), now),
  ]);
  SCHEMA_READY.add(db);
}

function responseHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Vary': `Origin, ${ADMIN_HEADER}, ${PARTICIPANT_HEADER}`,
  };
}

function json(data, init = {}) {
  return Response.json(data, { ...init, headers: { ...responseHeaders(), ...(init.headers || {}) } });
}

function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const url = new URL(request.url);
  if (origin === `${url.protocol}//${url.host}`) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

async function timingSafeEqual(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string' || !first || !second) return false;
  const encoder = new TextEncoder();
  const [firstHash, secondHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(first)),
    crypto.subtle.digest('SHA-256', encoder.encode(second)),
  ]);
  const firstBytes = new Uint8Array(firstHash);
  const secondBytes = new Uint8Array(secondHash);
  let difference = 0;
  for (let index = 0; index < firstBytes.length; index++) difference |= firstBytes[index] ^ secondBytes[index];
  return difference === 0;
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

function cleanNickname(value) {
  if (typeof value !== 'string') return null;
  const nickname = value.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!nickname || nickname.length > MAX_NICKNAME_LENGTH || /[<>]/.test(nickname)) return null;
  return nickname;
}

function publicGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.map(group => ({
    number: group.number,
    members: Array.isArray(group.members) ? group.members.map(member => member.nickname) : [],
  }));
}

function parseGroups(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readEvent(env) {
  return env.VOTES_DB.prepare(
    'SELECT status, groups_json, finalized_at FROM group_events WHERE event_id = ?1'
  ).bind(eventId(env)).first();
}

async function participantCount(env) {
  const row = await env.VOTES_DB.prepare(
    'SELECT COUNT(*) AS count FROM group_participants WHERE event_id = ?1'
  ).bind(eventId(env)).first();
  return Number(row?.count || 0);
}

async function participantFromRequest(request, env) {
  const participantHandle = request.headers.get(PARTICIPANT_HEADER);
  if (!validToken(participantHandle)) return null;
  const participantHash = await hashToken(participantHandle);
  const participant = await env.VOTES_DB.prepare(
    `SELECT nickname, experience, has_laptop FROM group_participants
     WHERE event_id = ?1 AND participant_hash = ?2`
  ).bind(eventId(env), participantHash).first();
  return participant ? {
    nickname: participant.nickname,
    experience: Number(participant.experience),
    hasLaptop: Boolean(participant.has_laptop),
    hash: participantHash,
  } : { hash: participantHash };
}

function participantGroupNumber(groups, participantHash) {
  if (!participantHash) return null;
  const group = groups.find(candidate => candidate.members?.some(member => member.id === participantHash));
  return group?.number || null;
}

async function isAdmin(request, env) {
  return timingSafeEqual(request.headers.get(ADMIN_HEADER), env.GROUPS_ADMIN_SECRET);
}

async function rejectAdmin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const blocked = await rateLimit(env, `groups-admin:${ipKey(ip)}`, ADMIN_FAILURE_LIMIT_PER_HOUR, 3600);
  return json({ error: blocked ? 'Příliš mnoho pokusů.' : 'Neplatný kód organizátora.' }, { status: blocked ? 429 : 401 });
}

async function handlePublicGet(request, env) {
  const [event, count, participant] = await Promise.all([
    readEvent(env),
    participantCount(env),
    participantFromRequest(request, env),
  ]);
  const groups = parseGroups(event?.groups_json);
  const response = { status: event?.status || 'open', count };
  if (event?.status === 'finalized') {
    response.groups = publicGroups(groups);
    response.participantGroup = participantGroupNumber(groups, participant?.hash);
  } else if (participant?.nickname) {
    response.participant = {
      nickname: participant.nickname,
      experience: participant.experience,
      hasLaptop: participant.hasLaptop,
    };
  }
  return json(response);
}

async function handleAdminGet(request, env) {
  if (!await isAdmin(request, env)) return rejectAdmin(request, env);
  const [event, rows] = await Promise.all([
    readEvent(env),
    env.VOTES_DB.prepare(
      `SELECT nickname, experience, has_laptop FROM group_participants
       WHERE event_id = ?1 ORDER BY created_at, nickname_key`
    ).bind(eventId(env)).all(),
  ]);
  const groups = parseGroups(event?.groups_json);
  return json({
    status: event?.status || 'open',
    count: rows.results.length,
    participants: rows.results.map(row => ({
      nickname: row.nickname,
      experience: Number(row.experience),
      hasLaptop: Boolean(row.has_laptop),
    })),
    groups: event?.status === 'finalized' ? publicGroups(groups) : undefined,
  });
}

async function registerParticipant(request, env, payload) {
  const participantHandle = request.headers.get(PARTICIPANT_HEADER);
  const nickname = cleanNickname(payload.nickname);
  const experience = Number(payload.experience);
  const hasLaptop = payload.hasLaptop;
  if (!validToken(participantHandle) || !nickname || !Number.isSafeInteger(experience)
      || experience < 1 || experience > 10 || typeof hasLaptop !== 'boolean') {
    return json({ error: 'Zkontroluj jméno, zkušenost a notebook.' }, { status: 400 });
  }

  const participantHash = await hashToken(participantHandle);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  // Na eventu budou telefony typicky za jednou Wi-Fi/NAT adresou. Nízký limit
  // jen podle IP by tedy zablokoval legitimní sál. Jemný limit je na anonymním
  // tokenu zařízení, vyšší IP limit zůstává jako pojistka proti hromadnému spamu.
  if (await rateLimit(env, `groups-register-token:${participantHash.slice(0, 32)}`, REGISTER_LIMIT_PER_TOKEN_10_MINUTES, 600)
      || await rateLimit(env, `groups-register-ip:${ipKey(ip)}`, REGISTER_LIMIT_PER_IP_10_MINUTES, 600)) {
    return json({ error: 'Příliš mnoho pokusů. Zkus to za chvíli.' }, { status: 429 });
  }

  const now = Math.floor(Date.now() / 1000);
  const nicknameKey = nickname.toLocaleLowerCase('cs-CZ');
  try {
    const stored = await env.VOTES_DB.prepare(
      `INSERT INTO group_participants (
         event_id, participant_hash, nickname, nickname_key, experience, has_laptop, created_at, updated_at
       )
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
       WHERE EXISTS (
         SELECT 1 FROM group_events WHERE event_id = ?1 AND status = 'open'
       )
       ON CONFLICT(event_id, participant_hash) DO UPDATE SET
         nickname = excluded.nickname,
         nickname_key = excluded.nickname_key,
         experience = excluded.experience,
         has_laptop = excluded.has_laptop,
         updated_at = excluded.updated_at
       WHERE EXISTS (
         SELECT 1 FROM group_events WHERE event_id = ?1 AND status = 'open'
       )
       RETURNING nickname`
    ).bind(eventId(env), participantHash, nickname, nicknameKey, experience, hasLaptop ? 1 : 0, now).first();
    if (!stored) return json({ error: 'Odpovědi už jsou uzamčené.' }, { status: 409 });
    return json({ ok: true, participant: { nickname, experience, hasLaptop }, count: await participantCount(env) });
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return json({ error: 'Tuhle přezdívku už někdo používá.' }, { status: 409 });
    }
    return json({ error: 'Odpověď se nepodařilo uložit.' }, { status: 500 });
  }
}

async function finalizeGroups(request, env) {
  if (!await isAdmin(request, env)) return rejectAdmin(request, env);
  const id = eventId(env);
  await env.VOTES_DB.prepare(
    `UPDATE group_events SET status = 'locking'
     WHERE event_id = ?1 AND status = 'open'`
  ).bind(id).run();

  const event = await readEvent(env);
  if (event?.status === 'finalized') {
    return json({ ok: true, alreadyFinalized: true, groups: publicGroups(parseGroups(event.groups_json)) });
  }
  if (event?.status !== 'locking') return json({ error: 'Hlasování už není otevřené.' }, { status: 409 });

  const rows = await env.VOTES_DB.prepare(
    `SELECT participant_hash, nickname, experience, has_laptop
     FROM group_participants WHERE event_id = ?1 ORDER BY created_at, participant_hash`
  ).bind(id).all();
  let groups;
  try {
    groups = buildBalancedGroups(rows.results.map(row => ({
      id: row.participant_hash,
      nickname: row.nickname,
      experience: Number(row.experience),
      hasLaptop: Boolean(row.has_laptop),
    })));
  } catch (error) {
    await env.VOTES_DB.prepare(
      `UPDATE group_events SET status = 'open'
       WHERE event_id = ?1 AND status = 'locking' AND groups_json IS NULL`
    ).bind(id).run();
    return json({
      error: rows.results.length === 5
        ? 'Pět lidí nejde rozdělit jen do týmů po třech až čtyřech.'
        : 'Pro rozdělení jsou potřeba alespoň tři lidé, nejvýše třicet dva.',
    }, { status: 409 });
  }

  const finalizedAt = Math.floor(Date.now() / 1000);
  await env.VOTES_DB.prepare(
    `UPDATE group_events
     SET status = 'finalized', groups_json = ?2, finalized_at = ?3
     WHERE event_id = ?1 AND status = 'locking'`
  ).bind(id, JSON.stringify(groups), finalizedAt).run();
  return json({ ok: true, groups: publicGroups(groups) });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': `Content-Type, ${ADMIN_HEADER}, ${PARTICIPANT_HEADER}`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet({ request, env }) {
  if (!isAllowedOrigin(request)) return json({ error: 'Cizí origin není povolený.' }, { status: 403 });
  try {
    await ensureSchema(env);
    return new URL(request.url).searchParams.get('admin') === '1'
      ? handleAdminGet(request, env)
      : handlePublicGet(request, env);
  } catch {
    return json({ error: 'Úložiště teď není dostupné.' }, { status: 503 });
  }
}

export async function onRequestPost({ request, env }) {
  if (!isAllowedOrigin(request)) return json({ error: 'Cizí origin není povolený.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return json({ error: 'Požadavek musí být JSON.' }, { status: 400 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return json({ error: 'Požadavek je příliš velký.' }, { status: 413 });
  }
  try {
    await ensureSchema(env);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'Požadavek je příliš velký.' }, { status: 413 });
    }
    const payload = JSON.parse(rawBody);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ error: 'Neplatný požadavek.' }, { status: 400 });
    }
    if (payload.action === 'finalize') return finalizeGroups(request, env);
    if (payload.action === 'register') return registerParticipant(request, env, payload);
    return json({ error: 'Neznámá akce.' }, { status: 400 });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Neplatný JSON.' }, { status: 400 });
    return json({ error: 'Úložiště teď není dostupné.' }, { status: 503 });
  }
}
