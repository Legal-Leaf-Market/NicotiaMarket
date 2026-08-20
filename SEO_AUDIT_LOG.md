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

### 1. Path-based routing for store spotlight pages
- **Problem:** `#/store/nicokick` is a hash route with no server path — invisible
  to every crawler (department shelves already solved this the right way with real
  paths + `vercel.json` rewrites; spotlights never got the same fix).
- **Proposed fix:** real path (e.g. `/store/nicokick`), a `vercel.json` rewrite to
  `/`, `location.pathname`-based routing and per-store SEO meta, mirroring the
  existing `DEPT_PATH`/`setRouteMeta()` pattern in `app.js`.
- **Priority:** High
- **Status:** Proposed
- **Approved by:** —

### 2. Compress OG/share images
- **Problem:** `og-default.png` and siblings are 680KB–1.3MB for 1200×630 social
  cards — fine for visitors (not loaded on normal pages), costly for crawlers and
  link-unfurl bots.
- **Proposed fix:** re-export at proper compression, target <150KB, no visible
  quality loss.
- **Priority:** Low (quick win)
- **Status:** Proposed
- **Approved by:** —

### 3. "Best of" buying-guide content
- **Problem:** every competitor sampled (Nicokick's Northerner hub, Vaping360,
  VapeCityUSA, SnusDaddy) runs refreshed, dated "Best of 2026" ranked-list content
  targeting commercial-intent queries. The library is etymology/culture only —
  no page targets a single buying-decision query.
- **Proposed fix:** 1–2 pieces to start (e.g. "Best Nicotine Pouches of 2026"),
  same static-HTML + Article JSON-LD pipeline as `/story` etc.
- **Priority:** Medium
- **Status:** Proposed
- **Approved by:** —

### 4. On-site vendor trust/review aggregation page
- **Problem:** no on-site trust signal beyond the footer's "how we make money"
  note. Nicokick republishes its own Trustpilot reviews at `/us/customer-stories`.
- **Proposed fix:** a page honestly citing each vendor's own public reputation
  (Trustpilot/BBB scores, sourced and linked, never fabricated), in the site's
  existing "honest broker" voice.
- **Priority:** Medium
- **Status:** Proposed
- **Approved by:** —

### 5. FAQ content block + FAQPage schema on department shelves
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

*(none yet)*
