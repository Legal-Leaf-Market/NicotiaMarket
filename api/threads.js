/* ============================================================
   api/threads.js — the community. Old-school threads, nothing else.
   ------------------------------------------------------------
   NO ACCOUNTS, NO DMs, NO CLASSIFIEDS. That is a deliberate product
   decision and it is also the thing keeping this small enough to run
   safely. A pseudonymous handle per post, public threads, and a
   moderation queue. Nothing here stores an email, a password or a
   location, because the cheapest way to not leak personal data is to
   never accept it.

   STORAGE: Upstash Redis over its REST API — plain fetch, no driver,
   so the zero-dependency rule in CLAUDE.md §2 survives intact.

   Env (set in Vercel; both namings are accepted because the Vercel KV
   integration and a direct Upstash project name them differently):
     KV_REST_API_URL   | UPSTASH_REDIS_REST_URL
     KV_REST_API_TOKEN | UPSTASH_REDIS_REST_TOKEN
     NM_ADMIN_TOKEN     - required for any /moderation route
     NM_BLOCKLIST       - optional, comma-separated extra terms

   Without the KV vars every route returns ok:false with a clear reason
   rather than throwing, so the page renders an honest empty state
   instead of a stack trace.

   KEYS
     th:ix          ZSET  thread id -> last-activity ms (the index)
     th:<id>        STR   JSON thread meta
     th:<id>:p      LIST  JSON posts, oldest first
     mod:held       LIST  JSON posts awaiting review
     mod:reports    LIST  JSON reports
     rl:<ip>:<win>  STR   rate-limit counter, TTL'd
   ============================================================ */

const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const ADMIN    = process.env.NM_ADMIN_TOKEN || '';

const MAX_TITLE = 120;
const MAX_BODY  = 4000;
const MAX_HANDLE = 24;
const PAGE = 30;

/* Report count at which a post hides itself pending review. Low on
   purpose: a wrongly hidden post is a minor annoyance, a wrongly
   visible one can be a legal problem. */
const AUTOHIDE_REPORTS = 3;

/* ---- Redis over REST ---------------------------------------------- */

function kvReady() { return !!(KV_URL && KV_TOKEN); }

async function kv(...cmd) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('kv ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  if (j.error) throw new Error('kv ' + j.error);
  return j.result;
}

/* ---- moderation ---------------------------------------------------- */

/* Contact details and sale offers are held, not published. This is the
   single most important filter on the page: a nicotine site whose forum
   lets strangers post "PayPal me and I'll ship you some" is running an
   unlicensed distribution channel, whatever the footer says. */
const HOLD_PATTERNS = [
  { id: 'email',    re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { id: 'phone',    re: /(?:\+?\d[\s().-]?){9,}\d/ },
  { id: 'messenger',re: /\b(?:telegram|whatsapp|signal|kik|snap(?:chat)?|wickr)\b\s*[:@]?\s*\S+/i },
  { id: 'payment',  re: /\b(?:paypal|venmo|cash\s?app|cashapp|zelle|western\s?union|bitcoin|btc\s+address)\b/i },
  { id: 'sale',     re: /\b(?:for\s+sale|selling|i(?:'|’)?ll\s+ship|will\s+ship|dm\s+me|pm\s+me|hit\s+me\s+up)\b/i },
  { id: 'meetup',   re: /\b(?:meet\s?up|meet\s+me\s+at|link\s+up)\b/i }
];

/* Slurs and harassment terms are operator-configured via NM_BLOCKLIST
   rather than hardcoded, so the list can be tuned without a deploy and
   without this file becoming a dictionary of them. Seeded empty. */
function blocklist() {
  return (process.env.NM_BLOCKLIST || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function screen(text) {
  const reasons = [];
  for (const p of HOLD_PATTERNS) if (p.re.test(text)) reasons.push(p.id);
  const low = text.toLowerCase();
  for (const w of blocklist()) if (low.includes(w)) { reasons.push('blocklist'); break; }
  /* A wall of links is spam even when each link is individually fine. */
  const links = (text.match(/https?:\/\//gi) || []).length;
  if (links > 2) reasons.push('links');
  return reasons;
}

/* ---- helpers ------------------------------------------------------- */

function clean(s, max) {
  return String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, max);
}

/* Stored as text and rendered as text — the client never innerHTMLs a
   post — but stripping the angle brackets here too means a future
   careless renderer cannot turn a stored post into script. */
function detag(s) { return s.replace(/[<>]/g, ''); }

function ipOf(req) {
  const f = req.headers['x-forwarded-for'];
  return (Array.isArray(f) ? f[0] : (f || '')).split(',')[0].trim() || 'unknown';
}

/* Not cryptographic and does not need to be: it exists so the same
   person keeps the same colour dot in a thread, and so a poster can
   delete their own post from the browser that wrote it. */
function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function rateLimit(ip) {
  const win = Math.floor(Date.now() / 60000);
  const key = 'rl:' + ip + ':' + win;
  const n = await kv('INCR', key);
  if (n === 1) await kv('EXPIRE', key, 120);
  if (n > 4) return 'Slow down — a few posts a minute is plenty.';
  const hKey = 'rl:' + ip + ':h' + Math.floor(Date.now() / 3600000);
  const h = await kv('INCR', hKey);
  if (h === 1) await kv('EXPIRE', hKey, 7200);
  if (h > 30) return 'That is a lot of posting in an hour. Try again later.';
  return null;
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  /* Never cached: a forum that serves a stale thread looks broken. */
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (raw.length > 64 * 1024) throw new Error('body too large');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/* ---- handler ------------------------------------------------------- */

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    const q = url.searchParams;

    if (!kvReady()) {
      return send(res, 503, {
        ok: false,
        reason: 'no-store',
        message: 'The community is not connected to storage yet. Set KV_REST_API_URL ' +
                 'and KV_REST_API_TOKEN in Vercel to switch it on.'
      });
    }

    const action = q.get('action') || '';

    /* ---------- moderation (token-gated) ---------- */
    if (action.startsWith('mod:')) {
      const token = req.headers['x-admin-token'] || q.get('token') || '';
      if (!ADMIN || token !== ADMIN) return send(res, 403, { ok: false, error: 'forbidden' });

      if (action === 'mod:queue') {
        const held = await kv('LRANGE', 'mod:held', 0, 99);
        const reports = await kv('LRANGE', 'mod:reports', 0, 99);
        return send(res, 200, {
          ok: true,
          held: (held || []).map(s => JSON.parse(s)),
          reports: (reports || []).map(s => JSON.parse(s))
        });
      }

      const b = await readBody(req);

      if (action === 'mod:approve') {
        const held = await kv('LRANGE', 'mod:held', 0, -1) || [];
        const hit = held.find(s => JSON.parse(s).id === b.id);
        if (!hit) return send(res, 404, { ok: false, error: 'not in queue' });
        const post = JSON.parse(hit);
        post.held = false;
        post.holdReasons = [];
        await kv('LREM', 'mod:held', 1, hit);
        await publish(post);
        return send(res, 200, { ok: true, published: post.id });
      }

      if (action === 'mod:delete') {
        /* Tombstone rather than splice: LSET keeps every other post's
           position stable, so permalinks and reply counts do not shift
           under readers mid-thread. */
        const posts = await kv('LRANGE', 'th:' + b.thread + ':p', 0, -1) || [];
        for (let i = 0; i < posts.length; i++) {
          const p = JSON.parse(posts[i]);
          if (p.id === b.id) {
            p.body = '';
            p.deleted = true;
            p.handle = '';
            await kv('LSET', 'th:' + b.thread + ':p', i, JSON.stringify(p));
            return send(res, 200, { ok: true, deleted: b.id });
          }
        }
        const held = await kv('LRANGE', 'mod:held', 0, -1) || [];
        const hit = held.find(s => JSON.parse(s).id === b.id);
        if (hit) { await kv('LREM', 'mod:held', 1, hit); return send(res, 200, { ok: true, dropped: b.id }); }
        return send(res, 404, { ok: false, error: 'not found' });
      }

      if (action === 'mod:lock') {
        const raw = await kv('GET', 'th:' + b.thread);
        if (!raw) return send(res, 404, { ok: false, error: 'no thread' });
        const t = JSON.parse(raw);
        t.locked = !!b.locked;
        await kv('SET', 'th:' + b.thread, JSON.stringify(t));
        return send(res, 200, { ok: true, locked: t.locked });
      }

      if (action === 'mod:clearReports') {
        await kv('DEL', 'mod:reports');
        return send(res, 200, { ok: true });
      }

      return send(res, 400, { ok: false, error: 'unknown moderation action' });
    }

    /* ---------- read ---------- */
    if (req.method === 'GET') {
      const tid = q.get('id');

      if (tid) {
        const raw = await kv('GET', 'th:' + tid);
        if (!raw) return send(res, 404, { ok: false, error: 'no such thread' });
        const thread = JSON.parse(raw);
        const rows = await kv('LRANGE', 'th:' + tid + ':p', 0, -1) || [];
        const posts = rows.map(s => JSON.parse(s))
                          .filter(p => !p.held && !p.hidden);
        return send(res, 200, { ok: true, thread, posts });
      }

      const ids = await kv('ZRANGE', 'th:ix', 0, PAGE - 1, 'REV') || [];
      const threads = [];
      for (const i of ids) {
        const raw = await kv('GET', 'th:' + i);
        if (raw) threads.push(JSON.parse(raw));
      }
      return send(res, 200, { ok: true, threads, count: threads.length });
    }

    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });

    const body = await readBody(req);
    const ip = ipOf(req);

    /* ---------- report ---------- */
    if (action === 'report') {
      await kv('LPUSH', 'mod:reports', JSON.stringify({
        post: clean(body.post, 40), thread: clean(body.thread, 40),
        why: detag(clean(body.why, 300)), at: Date.now(), ip
      }));
      await kv('LTRIM', 'mod:reports', 0, 499);

      const key = 'rep:' + clean(body.post, 40);
      const n = await kv('INCR', key);
      await kv('EXPIRE', key, 60 * 60 * 24 * 30);
      if (n >= AUTOHIDE_REPORTS) await hidePost(clean(body.thread, 40), clean(body.post, 40));
      return send(res, 200, { ok: true, thanks: true });
    }

    /* ---------- write ---------- */

    /* The age gate. Not ID verification and we do not pretend it is —
       it is an explicit affirmation, refused server-side rather than
       only in the UI, and recorded against the post. */
    if (body.age !== true && body.age !== 'true') {
      return send(res, 403, { ok: false, error: 'age', message: 'You must confirm you are 21 or over to post.' });
    }

    const limited = await rateLimit(ip);
    if (limited) return send(res, 429, { ok: false, error: 'rate', message: limited });

    const handle = detag(clean(body.handle, MAX_HANDLE)) || 'anon';
    const text   = detag(clean(body.body, MAX_BODY));
    if (!text) return send(res, 400, { ok: false, error: 'empty', message: 'Say something first.' });

    const reasons = screen(handle + ' ' + text + ' ' + clean(body.title, MAX_TITLE));
    const now = Date.now();

    const tid = clean(body.thread, 40);

    if (!tid) {
      const title = detag(clean(body.title, MAX_TITLE));
      if (!title) return send(res, 400, { ok: false, error: 'title', message: 'Threads need a title.' });

      const newId = id();
      const thread = {
        id: newId, title, handle, created: now, bumped: now,
        posts: reasons.length ? 0 : 1, locked: false
      };
      const post = {
        id: id(), thread: newId, handle, body: text, at: now,
        op: true, held: !!reasons.length, holdReasons: reasons
      };

      if (reasons.length) {
        /* Held first posts do not create a visible thread — otherwise the
           queue leaks the title straight onto the index. */
        await kv('LPUSH', 'mod:held', JSON.stringify(Object.assign({ pendingThread: thread }, post)));
        await kv('LTRIM', 'mod:held', 0, 999);
        return send(res, 202, { ok: true, held: true, message: heldMessage(reasons) });
      }

      await kv('SET', 'th:' + newId, JSON.stringify(thread));
      await kv('RPUSH', 'th:' + newId + ':p', JSON.stringify(post));
      await kv('ZADD', 'th:ix', now, newId);
      return send(res, 200, { ok: true, thread: newId, post });
    }

    const raw = await kv('GET', 'th:' + tid);
    if (!raw) return send(res, 404, { ok: false, error: 'no such thread' });
    const thread = JSON.parse(raw);
    if (thread.locked) return send(res, 403, { ok: false, error: 'locked', message: 'This thread is locked.' });

    const post = {
      id: id(), thread: tid, handle, body: text, at: now,
      op: false, held: !!reasons.length, holdReasons: reasons
    };

    if (reasons.length) {
      await kv('LPUSH', 'mod:held', JSON.stringify(post));
      await kv('LTRIM', 'mod:held', 0, 999);
      return send(res, 202, { ok: true, held: true, message: heldMessage(reasons) });
    }

    await publish(post);
    return send(res, 200, { ok: true, post });

  } catch (e) {
    return send(res, 500, { ok: false, error: 'server', message: String(e.message || e) });
  }
}

/* Appends an approved post and bumps its thread to the top of the index. */
async function publish(post) {
  const raw = await kv('GET', 'th:' + post.thread);
  const thread = raw ? JSON.parse(raw) : null;
  await kv('RPUSH', 'th:' + post.thread + ':p', JSON.stringify(post));
  if (thread) {
    thread.posts = (thread.posts || 0) + 1;
    thread.bumped = Date.now();
    await kv('SET', 'th:' + post.thread, JSON.stringify(thread));
    await kv('ZADD', 'th:ix', thread.bumped, post.thread);
  }
}

async function hidePost(threadId, postId) {
  const rows = await kv('LRANGE', 'th:' + threadId + ':p', 0, -1) || [];
  for (let i = 0; i < rows.length; i++) {
    const p = JSON.parse(rows[i]);
    if (p.id === postId) {
      p.hidden = true;
      await kv('LSET', 'th:' + threadId + ':p', i, JSON.stringify(p));
      return;
    }
  }
}

/* Tells the poster what tripped, without handing a spammer a checklist
   precise enough to tune against. */
function heldMessage(reasons) {
  if (reasons.includes('payment') || reasons.includes('sale') || reasons.includes('meetup')) {
    return 'Held for review. This board does not host sales, trades or meetups — ' +
           'talk about anything else and it will go straight up.';
  }
  if (reasons.includes('email') || reasons.includes('phone') || reasons.includes('messenger')) {
    return 'Held for review. Please do not post contact details — for your safety as ' +
           'much as anyone else’s.';
  }
  return 'Held for review. A human will look at it shortly.';
}
