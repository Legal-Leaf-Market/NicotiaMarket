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

*(none — all five audit items are shipped. New findings go here.)*

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

### "Best of" buying-guide content  *(was #1 of the content items, Medium)*
- **Shipped:** 2026-08-24. **Approved by:** Jacob, in conversation.
- `/best-nicotine-pouches` — "Best Nicotine Pouches of 2026", static HTML +
  Article JSON-LD, linked from the footer's new **Before you buy** column and
  from the top of `/library`.
- **It names no winner, deliberately, and this is not an oversight to "fix".**
  Competitors mark these pages up as a ranked `ItemList` of `Product` +
  `AggregateRating`. We own no stock and have no reviewers, so any ranking we
  published would be invented — see item B below, which applies here hardest.
  The page teaches the comparison (count trap, mg/pouch vs mg/g, format,
  who owns the big four) and hands the ranking to the live per-pouch shelf,
  which is arithmetic and changes hourly.
- Marked up as `Article`, not a product roundup. `dateModified` is what a
  "2026" page lives on — bump it when the content genuinely changes, not on
  every deploy.

### On-site vendor trust page  *(was #2 of the content items, Medium)*
- **Shipped:** 2026-08-24. **Approved by:** Jacob, in conversation.
- `/trust` — what each shop does about age at its own checkout, where it ships
  from and how long it takes, with a key explaining that ID, Signature, Date of
  birth and None are four genuinely different things.
- **The per-vendor table is generated from `/api/products`, not hand-written.**
  Copying nineteen vendors' values into the HTML would be the second list
  CLAUDE.md §3 warns about, on the page where being out of date is worst. The
  page's substance — the key, what we refuse to publish — is static HTML and is
  what a crawler indexes; only the rows need JS.
- An empty `ageCheck` renders **"Not established"**, never "None". Those are
  different claims and "none" is the flattering direction to guess wrong in.
- **The Trustpilot/BBB scores this item asked for are NOT on the page**, and
  that gap is stated on the page itself. They could not be sourced first-hand
  from the build environment, and quoting an unverified score on the page whose
  job is saying what has been verified would be self-defeating. Add them with
  their links when they can be read directly — or not at all.

### FAQ content + FAQPage schema  *(was #3 of the content items, Medium)*
- **Shipped:** 2026-08-24. **Approved by:** Jacob, in conversation.
- `/faq` — ten questions, `<details>`/`<summary>`, no JavaScript.
- **Standalone page, not an accordion under each shelf, because of item A
  below.** The shelves all rewrite to `index.html` and pick their department in
  JS, so per-shelf FAQPage schema would have to be injected client-side —
  exactly the structural ceiling item A records. Schema describing questions a
  crawler cannot see is worse than none, because it looks handled.
- All ten schema answers are byte-identical to the visible copy, and all ten
  `name`s to their `<summary>`. **If you edit one, edit the other** — mismatched
  FAQPage content is a manual action, not a technicality.

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
