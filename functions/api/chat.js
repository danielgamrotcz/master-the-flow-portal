const SITE_ORIGIN = 'https://master-the-flow-portal.pages.dev';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 40;
const MAX_USER_MSG_LEN = 4000;
const MAX_ITERATIONS = 4;
const CHAT_RATE_LIMIT = 30; // requests per IP per 24 hours
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const enc = new TextEncoder();

function corsHeaders(origin) {
  const allowed = origin && (origin === SITE_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-mtf-token',
    'Vary': 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function verifyToken(token, gateCode, env) {
  if (!token || typeof token !== 'string') return false;
  const lastColon = token.lastIndexOf(':');
  if (lastColon < 1) return false;
  const payload = token.slice(0, lastColon);
  const sigHex = token.slice(lastColon + 1);
  if (sigHex.length !== 64) return false;
  const parts = payload.split(':');
  const ts = parseInt(parts[0], 10);
  if (isNaN(ts) || Date.now() > ts + TOKEN_TTL_MS) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(gateCode),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));
    if (!valid) return false;
    if (env?.MTF_DATA) {
      const nonce = parts[1];
      const stored = await env.MTF_DATA.get('token:' + nonce);
      if (!stored) return false;
    }
    return true;
  } catch { return false; }
}

async function checkChatRateLimit(env, ip) {
  if (!env.MTF_DATA) return false;
  const key = 'ratelimit:chat:' + ip;
  const raw = await env.MTF_DATA.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= CHAT_RATE_LIMIT) return true;
  await env.MTF_DATA.put(key, String(count + 1), { expirationTtl: 86400 });
  return false;
}

const TOOLS = [
  {
    name: 'search_transcripts',
    description: 'Prohledá přepisy WhatsApp diskuzí komunity podle klíčového slova nebo fráze. Použij, když uživatel chce doslovné citace nebo detail z diskuze a datum není známé.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Klíčové slovo nebo fráze k hledání.' },
        limit: { type: 'number', description: 'Max výsledků (výchozí 12).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_transcript',
    description: 'Vrátí celý přepis WhatsApp diskuze pro konkrétní den. Použij, když je datum jasně zmíněno.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Datum ve formátu YYYY-MM-DD.' },
      },
      required: ['date'],
    },
  },
];

const SYSTEM_INSTRUCTIONS = `Jsi asistent komunity Master the Flow. Pomáháš členům najít a pochopit poznatky z jejich vlastních WhatsApp diskuzí o AI, Claude Code, nástrojích a produktivitě.

PRAVIDLA (striktní):
- Odpovídej VÝHRADNĚ na základě karet a přepisů komunity poskytnutých níže. Nečerpej z obecných znalostí.
- Když odpověď v podkladech není, řekni to přímo a navrhni příbuzné téma, které v komunitě zaznělo.
- Když se uživatel ptá mimo zaměření komunity, zdvořile odmítni a nasměruj zpět.

NÁSTROJE:
- Karty komunity jsou v kontextu níže — hledej v nich přímo, nástroje na ně nepotřebuješ.
- search_transcripts: použij, když uživatel chce doslovné citace z diskuze a datum není známé.
- get_transcript: použij, když je datum konkrétně zmíněno.

CITACE:
- Pokud odpověď vychází z konkrétních karet, uveď jejich id na ÚPLNĚ POSLEDNÍM řádku odpovědi:
  [[CARDS: 2026-06-07-01, 2026-05-18-03]]
- Použij přesná id karet. Neuváděj blok, když odpověď z karet nevychází.

HLAS:
- Čeština, vykání. Hovorová Praha, ne korporátní fráze. Žádné emoji. České uvozovky „...".
- Stručně k věci — shrni podstatu, necituj celé karty doslova.`;

async function* parseAnthropicSSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw && raw !== '[DONE]') {
            try { yield JSON.parse(raw); } catch { /* skip malformed SSE frame */ }
          }
        }
      }
    }
    if (buf.startsWith('data: ')) {
      const raw = buf.slice(6).trim();
      if (raw && raw !== '[DONE]') {
        try { yield JSON.parse(raw); } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function sseWrite(writer, obj) {
  return writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
}

async function searchTranscripts(transcripts, query, limit = 12) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 12), 20);
  const q = query.toLowerCase();
  const results = [];
  const days = transcripts.days || {};
  for (const [date, messages] of Object.entries(days)) {
    for (const msg of messages) {
      if (msg.text.toLowerCase().includes(q)) {
        results.push({ date, time: msg.time, author: msg.author, text: msg.text, group: msg.group || '' });
        if (results.length >= safeLimit) return results;
      }
    }
  }
  return results;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, { headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin);

  if (!env.GATE_CODE || !env.ANTHROPIC_API_KEY) {
    return new Response('Server misconfigured', { status: 500, headers: cors });
  }

  const token = request.headers.get('x-mtf-token');
  if (!await verifyToken(token, env.GATE_CODE, env)) {
    return new Response('Unauthorized', { status: 401, headers: cors });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await checkChatRateLimit(env, ip)) {
    return new Response('Too Many Requests', { status: 429, headers: cors });
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return new Response('Bad Request', { status: 400, headers: cors });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response('Bad Request', { status: 400, headers: cors });
  }

  // Accept only user messages from client — server generates its own assistant turns
  let messages = Array.isArray(body.messages) ? body.messages : [];
  messages = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0)
    .slice(-MAX_MESSAGES);

  // Enforce role alternation starting with user
  messages = messages.reduce((acc, msg) => {
    if (acc.length === 0) {
      if (msg.role === 'user') acc.push(msg);
    } else {
      const expected = acc[acc.length - 1].role === 'user' ? 'assistant' : 'user';
      if (msg.role === expected) acc.push(msg);
    }
    return acc;
  }, []);

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return new Response('Bad Request', { status: 400, headers: cors });
  }

  // Enforce length limit on all user messages
  if (messages.some(m => m.role === 'user' && m.content.length > MAX_USER_MSG_LEN)) {
    return new Response('Message too long', { status: 400, headers: cors });
  }

  const base = new URL(request.url).origin;

  let corpus;
  try {
    const r = await fetch(`${base}/data/chat-corpus.json`);
    if (!r.ok) throw new Error('corpus not found');
    corpus = await r.json();
  } catch {
    return new Response('Corpus unavailable', { status: 503, headers: cors });
  }

  const corpusText = `=== KARTY KOMUNITY (${corpus.length} karet) ===\n${JSON.stringify(corpus)}`;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const sseHeaders = {
    ...cors,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  };

  (async () => {
    const loopMessages = messages.map(m => ({ role: m.role, content: m.content }));
    let transcriptsCache = null;
    let sentDone = false;

    try {
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const apiResp = await fetch(ANTHROPIC_API, {
          method: 'POST',
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: [
              { type: 'text', text: SYSTEM_INSTRUCTIONS },
              { type: 'text', text: corpusText, cache_control: { type: 'ephemeral' } },
            ],
            tools: TOOLS,
            messages: loopMessages,
            stream: true,
          }),
        });

        if (!apiResp.ok) {
          await sseWrite(writer, { type: 'error', message: 'Chyba při komunikaci se serverem' });
          break;
        }

        const assistantContent = [];
        let currentBlock = null;
        let stopReason = null;

        for await (const ev of parseAnthropicSSE(apiResp.body)) {
          switch (ev.type) {
            case 'content_block_start':
              if (ev.content_block?.type === 'text') {
                currentBlock = { type: 'text', text: '' };
                assistantContent.push(currentBlock);
              } else if (ev.content_block?.type === 'tool_use') {
                currentBlock = { type: 'tool_use', id: ev.content_block.id, name: ev.content_block.name, inputJson: '' };
                assistantContent.push(currentBlock);
              }
              break;
            case 'content_block_delta':
              if (!currentBlock) break;
              if (ev.delta?.type === 'text_delta') {
                currentBlock.text += ev.delta.text;
                await sseWrite(writer, { type: 'text', delta: ev.delta.text });
              } else if (ev.delta?.type === 'input_json_delta') {
                currentBlock.inputJson += ev.delta.partial_json || '';
              }
              break;
            case 'content_block_stop':
              currentBlock = null;
              break;
            case 'message_delta':
              if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
              break;
          }
        }

        if (stopReason === 'tool_use') {
          const assistantMsg = {
            role: 'assistant',
            content: assistantContent.map(b => {
              if (b.type === 'tool_use') {
                let input = {};
                try { input = JSON.parse(b.inputJson || '{}'); } catch {}
                return { type: 'tool_use', id: b.id, name: b.name, input };
              }
              return { type: 'text', text: b.text };
            }),
          };
          loopMessages.push(assistantMsg);

          const toolResults = [];
          for (const block of assistantMsg.content.filter(b => b.type === 'tool_use')) {
            let result;
            try {
              if (block.name === 'search_transcripts') {
                if (!transcriptsCache) {
                  const r = await fetch(`${base}/data/chat-transcripts.json`);
                  transcriptsCache = await r.json();
                }
                const hits = await searchTranscripts(transcriptsCache, block.input.query || '', block.input.limit);
                result = hits.length
                  ? JSON.stringify(hits)
                  : `Žádné výsledky pro: "${block.input.query}"`;
              } else if (block.name === 'get_transcript') {
                const date = block.input.date || '';
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                  result = 'Neplatné datum.';
                } else {
                  const r = await fetch(`${base}/data/archive/${date}.json`);
                  if (!r.ok) {
                    result = `Přepis pro ${date} nenalezen.`;
                  } else {
                    const data = await r.json();
                    const groups = (data.transcript?.groups || []).map(g =>
                      `=== ${g.name} ===\n` + (g.messages || []).map(m => `[${m.time}] ${m.author}: ${m.text}`).join('\n')
                    );
                    result = groups.join('\n\n') || 'Přepis je prázdný.';
                  }
                }
              } else {
                result = 'Neznámý nástroj.';
              }
            } catch {
              result = 'Chyba při spuštění nástroje.';
            }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }

          loopMessages.push({ role: 'user', content: toolResults });

        } else {
          await sseWrite(writer, { type: 'done' });
          sentDone = true;
          break;
        }
      }

      if (!sentDone) {
        await sseWrite(writer, { type: 'done' });
      }
    } catch (e) {
      console.error('chat error:', e);
      await sseWrite(writer, { type: 'error', message: 'Interní chyba' }).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: sseHeaders });
}
