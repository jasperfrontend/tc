// Shared by the Worker (src/worker.js) and the Pages Functions
// (functions/api/sessions.js, functions/s/[id].js).

const UPSTREAM = 'https://api.twitchcon.com/sessions?eventName=san-diego-2026';
const KV_KEY = 'sessions';
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;  // hourly cron missed a few runs = flag as stale and retry on request
const MEMO_MS = 60 * 1000;                 // per-isolate memory cache, saves KV reads
const RETRY_MS = 15 * 60 * 1000;           // min gap between on-request refresh attempts per isolate
export const REFRESH_UNTIL = Date.UTC(2026, 10, 18); // stop polling TwitchCon a few days after the event

let memo = null;        // { body, fetchedAt, at, byId? }
let lastAttempt = 0;

/** The stored copy ({ body, fetchedAt, at }), fetching it first if KV is still empty. Null if unavailable. */
async function loadEntry(env) {
  const now = Date.now();
  if (memo && now - memo.at < MEMO_MS) return memo;

  const { value, metadata } = await env.SCHEDULE.getWithMetadata(KV_KEY);
  if (value) return (memo = { body: value, fetchedAt: metadata?.fetchedAt ?? 0, at: now });

  // nothing stored yet (first deploy), so fetch it right now
  lastAttempt = now;
  const fresh = await refresh(env);
  return fresh ? (memo = { body: fresh.body, fetchedAt: fresh.fetchedAt, at: now }) : null;
}

/** One trimmed session by id, or null. */
export async function getSession(env, id) {
  const entry = await loadEntry(env);
  if (!entry) return null;
  if (!entry.byId) {
    entry.byId = new Map();
    for (const s of JSON.parse(entry.body).sessions) entry.byId.set(s.id, s);
  }
  return entry.byId.get(id) ?? null;
}

export async function serveSessions(env, ctx) {
  const now = Date.now();
  const entry = await loadEntry(env);
  if (!entry) {
    return json('{"error":"Could not reach the TwitchCon schedule. Try again in a minute."}', 502, 'no-store');
  }

  let body = entry.body;
  if (now - entry.fetchedAt > STALE_AFTER_MS) {
    // the cron should have refreshed by now; try in the background and say it's stale
    if (now < REFRESH_UNTIL && now - lastAttempt > RETRY_MS) {
      lastAttempt = now;
      ctx.waitUntil(refresh(env).then((fresh) => { if (fresh) memo = null; }));
    }
    if (now < REFRESH_UNTIL) body = body.replace('"stale":false', '"stale":true');
  }
  return json(body, 200, 'public, max-age=300');
}

/** Fetch TwitchCon, trim, store in KV. Returns { body, fetchedAt } or null on failure. */
export async function refresh(env) {
  let raw;
  try {
    const res = await fetch(UPSTREAM, {
      headers: { Accept: 'application/json', 'User-Agent': 'tc.jasper.stream schedule viewer (+https://github.com/jasperfrontend/tc)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    raw = await res.json();
  } catch (err) {
    console.error('TwitchCon fetch failed:', String(err));
    return null;
  }

  const sessions = trimSessions(raw);
  if (!sessions) {
    console.error('TwitchCon returned no usable sessions, keeping the old copy');
    return null;
  }
  const avatars = collectAvatars(raw);

  const fetchedAt = Date.now();
  const version = await shortHash(JSON.stringify([sessions, avatars]));
  const body = JSON.stringify({ fetchedAt, version, stale: false, sessions, avatars });
  await env.SCHEDULE.put(KV_KEY, body, { metadata: { fetchedAt, version } });
  return { body, fetchedAt };
}

/** Trim the raw API response to the compact shape the page reads. Null if it looks wrong. */
function trimSessions(json) {
  if (!json || !Array.isArray(json.sessions)) return null;
  const out = [];
  const seen = new Set();
  for (const row of json.sessions) {
    const d = row && row.data;
    const id = row && row.sessionId;
    if (!d || typeof id !== 'string' || d.private) continue;
    const s = Date.parse(d.startTimestamp);
    const e = Date.parse(d.endTimestamp);
    const title = String(d.title ?? '').trim();
    const loc = String(d.location ?? '').trim();
    if (!Number.isFinite(s) || !Number.isFinite(e) || !title) continue;

    // TwitchCon lists a few sessions twice under different IDs
    const key = [title, loc, s, e].join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const item = {
      id,
      t: title,
      d: String(d.description ?? '').trim(),
      p: String(d.program ?? '').trim(),
      l: loc,
      s,
      e,
      g: (Array.isArray(d.tags) ? d.tags : []).map(String).filter(Boolean),
      sp: (Array.isArray(d.speakers) ? d.speakers : [])
        .map((sp) => String(sp?.name ?? '').trim())
        .filter(Boolean),
    };
    if (d.mobileOnly) item.m = 1;
    out.push(item);
  }
  return out.length ? out : null;
}

/**
 * Streamer name -> avatar URL, once per streamer (not per session). TwitchCon's data
 * links the 300x300 image on Twitch's CDN; the page shows them at ~24px, so ask the
 * CDN for its 70x70 variant (about 10 KB instead of 135 KB). Only Twitch CDN URLs
 * are accepted.
 */
function collectAvatars(json) {
  const out = {};
  for (const row of json.sessions) {
    for (const sp of (Array.isArray(row?.data?.speakers) ? row.data.speakers : [])) {
      const name = String(sp?.name ?? '').trim();
      const img = String(sp?.image ?? '');
      if (!name || out[name]) continue;
      const m = img.match(/^https:\/\/static-cdn\.jtvnw\.net\/([\w./-]+?)-\d+x\d+\.(png|jpe?g)$/i);
      if (m) out[name] = `https://static-cdn.jtvnw.net/${m[1]}-70x70.${m[2]}`;
    }
  }
  return out;
}

async function shortHash(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status, cacheControl) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
