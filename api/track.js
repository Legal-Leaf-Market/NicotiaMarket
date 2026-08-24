/* ============================================================
   api/track.js — event sink (POST) + popularity read-back (GET)
   ------------------------------------------------------------
   POST: outbound clicks, add-to-cart, checkout handoffs, and every
   per-card interaction app.js fires (flip, flavour/strength pick,
   save, chip click, lane expand, cart/board open). Fire and forget —
   always 200, never blocks the shopper.

   This is OUR click data, not the vendors' sales data — we have no
   way to see what actually sells on their sites, only what shoppers
   do on ours. That's the ceiling on what "popular" can mean here:
   most-viewed/most-clicked on Nicotia Market, rolled up by item,
   department, brand and store.

   STORAGE: same Upstash Redis over REST that api/threads.js already
   uses for the community board — no new service, no new cost. Counts
   pipeline into it as plain ZINCRBY/HSET commands; a missing KV_URL
   silently skips storage (the beacon still 200s) rather than throwing,
   same convention as threads.js.

   GET ?action=pop:top&kind=item|dept|brand|store&n=25 : admin-token
   gated, same NM_ADMIN_TOKEN /moderation already uses. Returns the
   top N by all-time click count. public/popularity.html is the UI.

   KEYS
     pop:event          ZSET  event name -> count (what kind of click)
     pop:dept           ZSET  department -> count
     pop:brand          ZSET  brand (lowercased) -> count
     pop:store          ZSET  store key -> count
     pop:item           ZSET  gid -> count, all time
     pop:item:d:<date>  ZSET  gid -> count, that UTC day, TTL'd
     pop:labels         HASH  gid -> JSON {brand,dept,store,title},
                               last-seen wins, so item rows are
                               readable without a second products.js
                               lookup that might have since re-grouped
   ============================================================ */

const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const ADMIN    = process.env.NM_ADMIN_TOKEN || ''

/* 90 days of daily buckets is enough for a "trending this month" view
   later without keys accumulating forever. Reset on every write to
   that day's key rather than set-once, which is harmless: a key gets
   pushed further from expiry only while it's still being written to. */
const DAY_TTL = 90 * 86400

function kvReady() { return !!(KV_URL && KV_TOKEN) }

async function kv(...cmd) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error('kv ' + (j.error || r.status))
  return j.result
}

async function kvPipeline(cmds) {
  const r = await fetch(KV_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  })
  const j = await r.json()
  if (!r.ok) throw new Error('kv pipeline ' + r.status)
  return j
}

function send(res, code, body) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function safeParse(s) { try { return JSON.parse(s) } catch { return {} } }

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  const q = url.searchParams

  if (req.method === 'GET') return getPopularity(req, res, q)
  if (req.method !== 'POST') return send(res, 405, { ok: false })

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {})
  const event = String(body.event || 'unknown').slice(0, 40)
  const gid   = String(body.gid   || '').slice(0, 160)
  const dept  = String(body.dept  || '').slice(0, 24)
  const brand = String(body.brand || '').trim().slice(0, 80)
  const store = String(body.store || '').slice(0, 40)
  const product = String(body.product || '').slice(0, 160)
  const value = body.value ?? ''
  const country = String(body.country || '').slice(0, 8)

  if (kvReady()) {
    const day = new Date().toISOString().slice(0, 10)
    const cmds = [['ZINCRBY', 'pop:event', 1, event]]
    if (dept)  cmds.push(['ZINCRBY', 'pop:dept', 1, dept])
    if (brand) cmds.push(['ZINCRBY', 'pop:brand', 1, brand.toLowerCase()])
    if (store) cmds.push(['ZINCRBY', 'pop:store', 1, store])
    if (gid) {
      cmds.push(['ZINCRBY', 'pop:item', 1, gid])
      cmds.push(['ZINCRBY', 'pop:item:d:' + day, 1, gid])
      cmds.push(['EXPIRE', 'pop:item:d:' + day, DAY_TTL])
      cmds.push(['HSET', 'pop:labels', gid, JSON.stringify({ brand, dept, store, title: product })])
    }
    try { await kvPipeline(cmds) } catch { /* analytics must never break the page */ }
  }

  const hook = process.env.NM_EVENTS_WEBHOOK
  if (hook) {
    try {
      await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, store, product, value, country, dept, brand, gid, at: new Date().toISOString() }),
      })
    } catch { /* swallow — same reason */ }
  }

  return send(res, 200, { ok: true })
}

async function getPopularity(req, res, q) {
  if (q.get('action') !== 'pop:top') return send(res, 405, { ok: false })
  const token = req.headers['x-admin-token'] || q.get('token') || ''
  if (!ADMIN || token !== ADMIN) return send(res, 403, { ok: false, error: 'forbidden' })
  if (!kvReady()) return send(res, 200, { ok: false, reason: 'no-store' })

  const kind = (q.get('kind') || 'item').replace(/[^a-z]/g, '') || 'item'
  const n = Math.max(1, Math.min(Number(q.get('n')) || 25, 100))

  try {
    const rows = await kv('ZREVRANGE', 'pop:' + kind, 0, n - 1, 'WITHSCORES')
    const out = []
    for (let i = 0; i < rows.length; i += 2) out.push({ key: rows[i], count: Number(rows[i + 1]) || 0 })

    let labels = {}
    if (kind === 'item' && out.length) {
      const raw = await kv('HMGET', 'pop:labels', ...out.map(r => r.key))
      out.forEach((r, i) => { try { labels[r.key] = JSON.parse(raw[i]) } catch { /* no label yet */ } })
    }
    return send(res, 200, { ok: true, kind, rows: out, labels })
  } catch (e) {
    return send(res, 200, { ok: false, error: String(e.message || e) })
  }
}
