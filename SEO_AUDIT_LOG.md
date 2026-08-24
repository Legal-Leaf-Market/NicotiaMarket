# SEO / UX Change Log

Living tracker for the SEO & UX audit (started 2026-08-20). Nick has free rein to
propose changes here; nothing gets implemented until Jacob (jake@nicotiamarket.com)
marks it **Approved**. No email/Slack integration is wired up yet — approval is
recorded here by whoever has Jacob's go-ahead, however it reached them.

Status values: `Proposed` → `Approved` → `In progress` → `Shipped` (or `Rejected` /
`On hold`, with a one-line reason).

Full findings behind these items: see the audit report Claude produced on
2026-08-20 (competitor research: Nicokick, EightVape, and other pouch/vape
comparison sites).

---

## Open items

### 1. "Best of" buying-guide content
- **Problem:** every competitor sampled (Nicokick's Northerner hub, Vaping360,
  VapeCityUSA, SnusDaddy) runs refreshed, dated "Best of 2026" ranked-list content
  targeting commercial-intent queries. The library is etymology/culture only —
  no page targets a single buying-decision query.
- **Proposed fix:** 1–2 pieces to start (e.g. "Best Nicotine Pouches of 2026"),
  same static-HTML + Article JSON-LD pipeline as `/story` etc.
- **Priority:** Medium
- **Status:** Proposed
- **Approved by:** —

### 2. On-site vendor trust/review aggregation page
- **Problem:** no on-site trust signal beyond the footer's "how we make money"
  note. Nicokick republishes its own Trustpilot reviews at `/us/customer-stories`.
- **Proposed fix:** a page honestly citing each vendor's own public reputation
  (Trustpilot/BBB scores, sourced and linked, never fabricated), in the site's
  existing "honest broker" voice.
- **Priority:** Medium
- **Status:** Proposed
- **Approved by:** —

### 3. FAQ content block + FAQPage schema on department shelves
- **Problem:** Nicokick has a dedicated indexed `/us/faq`; department shelves here
  are pure product grids with no Q&A content, so there's nothing for FAQPage
  schema to attach to.
- **Proposed fix:** an accordion under each shelf (or a standalone `/faq`) with
  real Q&A content, then matching FAQPage JSON-LD.
- **Priority:** Medium
- **Status:** Proposed
- **Approved by:** —

---

## Documented, not actionable

### A. Client-rendered SEO metadata is a structural ceiling
`app.js` already flags this in its own comments: per-route title/description/
canonical is set by JS on route change, which Google's renderer sees on a delayed
second pass and many other crawlers/unfurlers don't see at all. Competitor product
pages (e.g. Nicokick baking the live price into a server-rendered `<title>`) can't
be matched without per-product server-rendered pages — which CLAUDE.md §2/§5
deliberately rule out (no build step, no framework, no generated blob). Recorded
here so it isn't "rediscovered" as a bug later; changing it means revisiting §2/§5
on purpose, not by accident.

### B. No Product/Offer/AggregateRating schema
Deliberate, not missing. The site owns no inventory and no reviews (CLAUDE.md
§5/§11 ethos), so claiming that schema would assert something untrue. Leave it out.

---

## Shipped

### Path-based routing for store spotlight pages  *(was #1, High)*
- **Shipped:** 2026-08-24. **Approved by:** Jacob, in conversation.
- `#/store/nicokick` is now `/store/nicokick`: a `/store/:key` rewrite in
  `vercel.json`, `location.pathname` routing in `app.js`, and per-store
  title/description/canonical/og off the `SPOTLIGHT` entry rather than the
  homepage's. Listed in `sitemap.xml` — which is only possible now, since a
  hash never reaches the server for a crawler to see.
- Old `#/store/*` links are rewritten to the path on arrival, so anything
  already shared keeps working and any re-share carries the crawlable form.
- `server.mjs` now compiles rewrite sources to regexes so a `:param` route
  matches locally. Still parsing the real `vercel.json` — no second list
  (CLAUDE.md §3).
- Adding a `SPOTLIGHT` entry now wants a matching `sitemap.xml` line.

### Compress OG/share images  *(was #2, Low)*
- **Shipped:** 2026-08-24. **Approved by:** Jacob, in conversation.
- All eight cards: **6,310 KB → 296 KB, 95.3% smaller.** Largest file is now
  51 KB against the 150 KB target. Filenames and `.png` extensions unchanged,
  so nothing needed re-referencing and no shared card lost its cached image.
- Every one was RGBA with a **fully opaque alpha channel** — a wasted fourth
  channel on every pixel — and only 4–8k distinct colours, so these were flat
  designed cards being stored as though they were photographs.
- Quantised to a 256-colour palette with **FASTOCTREE, not MEDIANCUT**. This
  matters and is worth not re-litigating: median-cut allocates palette slots
  by population, so the leaf mark's sage veins — a few hundred pixels of
  `--sage`, one of the three tokens shared with the sister sites — drifted to
  grey-blue (measured colour drift 56.9). Octree subdivides colour space
  instead and holds them at drift 0.5, while also producing a file a quarter
  the size. WebP drifted them too (36.7). Overall RMSE ≤ 2.2 everywhere.
- **If these are ever re-exported, check the sage veins on the leaf mark.**
