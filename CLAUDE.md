# CLAUDE.md — Operating guide for Nicotia Market

Read this fully before editing. Sister project to **Legal-Leaf Market** and
**Herbal-Leaf Market**; it deliberately copies their architecture, and deliberately
does *not* copy one part of it (§5).

---

## 1. What this is

A **static site + serverless API** for `nicotiamarket.com`. It compares nicotine
pouches, disposables, devices, e-liquid, cigars and gear across every store in the
registry, and prices each one **by the unit** — per pouch, per 1,000 puffs, per ml,
per stick. That unit chip is the entire product; everything else is packaging.

No framework, no build step, no bundler. Plain HTML/CSS/JS in `public/`, zero-dependency
Node functions in `api/`. Node ≥ 18, native `fetch`, `"type": "module"`.

```
vercel.json      Routing + headers. THE source of truth for routes.
server.mjs       Local preview only. READS vercel.json (see §3).
package.json     Node ≥18, zero deps.
api/
  products.js    Live scraper -> /api/products   (the registry lives here)
  subscribe.js   Email capture -> /api/subscribe (POST)
  track.js       Event sink   -> /api/track      (POST)
public/
  index.html     The page. 14KB — markup only.
  css/tokens.css Design system shared with the sister sites (§4)
  css/app.css    Components
  js/config.js   API url + PREVIEW MODE. The file you actually edit.
  js/app.js      Engine: grouping, filters, cards, cart, routing.
  assets/mark.svg
```

---

## 2. Deploy model

```
edit -> PR to GitHub -> Vercel auto-deploys
```

`vercel.json` sets `framework: null` + `outputDirectory: public`, so Vercel serves
`public/` statically and runs each file in `api/` as a serverless function.
**Do not add Next.js / Vite / any build pipeline** — it breaks this setup and produces
the "No Next.js version detected" failure Legal-Leaf hit. If a deploy fails, check
`vercel.json` first.

---

## 3. Routing — ONE file, unlike Legal-Leaf

Legal-Leaf keeps routes in **both** `vercel.json` and a hardcoded map in `server.mjs`,
and its own `CLAUDE.md` documents an outage caused by those two drifting apart.

**We do not do that here.** `server.mjs` parses `vercel.json` at startup. Add a route to
`vercel.json` and the local preview picks it up automatically. Never hardcode a route in
`server.mjs`.

`cleanUrls: true` means `public/foo.html` serves at `/foo`. Department URLs
(`/pouches`, `/disposables`, `/devices`, `/e-liquid`, `/cigars`, `/gear`) all rewrite to
`index.html` — the department is chosen client-side from the path.

---

## 4. The design system is shared — do not drift it

`public/css/tokens.css` holds values **read off the live sister sites** so all three read
as one house. `--gold: #f0b93c`, `--red: #ef5350`, `--sage: #4ade80` and the three font
families (Fraunces / Cormorant Garamond / Jost) are **shared**. Change one here and you
must change it on Legal-Leaf and Herbal-Leaf too, or the family stops looking like a family.

`--ember` and the six department hues are ours alone.

The Google Fonts request is byte-identical to Herbal-Leaf's on purpose: a visitor crossing
between sister sites gets a cache hit.

---

## 5. NO BASE64 ENGINE BLOB — this is deliberate

Legal-Leaf's `index.html` contains a ~250KB base64 string that decodes at runtime into its
render engine. Its own `CLAUDE.md` calls this "the single most fragile thing in the repo"
and warns that one stray character renders the page blank.

**Nicotia does not do this.** The engine is `public/js/app.js`, a normal file you can read,
diff, review in a PR and syntax-check. `index.html` is 14KB of markup.

If you are tempted to inline or minify-into-a-blob for any reason: don't. The whole reason
this repo exists is that the previous version was unmaintainable.

---

## 6. Departments — six, each with an honest unit

| dept | unit | what belongs |
|---|---|---|
| `pouch` | per pouch | pouches, snus, lozenges, chew |
| `disposable` | per 1,000 puffs | Foger, Geek Bar, disposable vapes |
| `device` | flat | mods, kits, pods, tanks, coils |
| `liquid` | per ml | juice, shortfills |
| `cigar` | per stick | actual cigars only |
| `gear` | flat | humidors, cutters, cases, pipe gear |

Two of these exist because of real bugs. **`disposable`** was previously folded into a
`vape` department priced `flat` — no unit at all — on what is now the biggest shelf; a
Foger 30K at $16.99 is $0.57/1k puffs and a Geek Bar Mate 60K at $19.99 is $0.33, a 42%
gap invisible on the shelf price. **`gear`** exists because a $199 humidor filed under
cigars was priced per stick and rendered "$199.00 per stick".

`classify()` in `api/products.js` routes each product by its own text; the store's `dept`
is only a fallback. A store can span shelves.

---

## 7. `api/products.js` — the scraper

**Why it left Apps Script:** Apps Script fetches from Google egress IPs, which storefront
WAFs treat as bots and 403. Only 2 of 11 stores were coming through. Node on Vercel gets
ordinary egress, a real UA, and fans out across every store concurrently instead of
sleeping between doors on a 6-minute clock.

- **STORES registry** at the top of the file drives everything. It is server-side so
  commission notes never reach a browser; `publicStores()` whitelists what does.
- **Strategy ladder** per platform — first door returning rows wins. Shopify:
  products.json → collections → JSON-LD. Woo: Store API → JSON-LD.
- **`cartPath`** is load-bearing. Woo carts are not all at `/cart/` — Wave Vape's is
  `/cart-2/` and its own buttons post to `/store/?add-to-cart=`. Without it the handoff 404s.
- Response shape is `{ ok, stores, meta, items, updated }`. **Keep it stable** — `app.js`
  depends on it.
- `?refresh` forces a fresh scrape, `?debug` returns per-store counts and which door worked.

---

## 7b. Vendor shipping & age-verification audit (Aug 2026)

Every vendor's published policy was read directly. `ships`, `only`, `from`,
`days` and `ageCheck` in the registry come from that, not from inference —
anything still inferred keeps `guess: 1`. **Re-check quarterly.**

**Age verification is wildly inconsistent**, and that inconsistency is itself
the liability: aggregating ten vendors behind ten identical Buy buttons implies
they are interchangeable on age control, and they are not. Hence the `ageCheck`
chip in the cart, shown immediately above each store's checkout button.

| Store | Ships | Age check at their checkout |
|---|---|---|
| Montero | US + intl w/ disclaimers | **ID** — Bluecheck 21+, signature, billing address only, no PO boxes |
| NikoPouches | **Denmark only** | **ID** — MitID via VerifyID.dk |
| Wave Vape | US | **ID** — AgeChecker.net 21+, ID-upload fallback |
| EightVape | US 50 states, no APO | **Signature** — 21+ ID at the door, ships from Las Vegas |
| RELX UK | UK only | **DOB** — drivers "might" verify 18+, not must |
| Vaporesso | Worldwide | **DOB** — prompted at checkout, not in policy |
| Snus O'Clock | "Internationally", no exclusions | **None** |
| Europesnus | ~150 destinations, no exclusions | **None** |
| Geekvape | Worldwide | **None** |
| XIFEI | US + intl | **None** — accessories, no nicotine |

### Two open compliance questions — not code, needs a human

1. **Geekvape / PACT Act.** Their policy says US orders ship via "USPS or UPS".
   The PACT Act's 2021 ENDS amendment bars **USPS** from delivering vapour
   products to consumers. Either the policy text is stale or the practice is
   non-compliant. Raise it with them before this store carries real US volume.

2. **RELX UK / disposables ban.** The UK banned sale of single-use disposable
   vapes from June 2025. Their "MaxGO 12K/33K Final Clearance" SKUs are branded
   and puff-rated like disposables. Many brands rebadged to refillable
   post-ban; whether these particular SKUs did is not answerable from the
   policy text. Confirm before featuring them.

### Fixed as a result

`nikopouches` was `ships:['EU']`, so it was offered to every EU shopper —
while its own terms say *"Vi leverer ikke til udlandet"* (no delivery abroad,
Faroes and Greenland included). The `only:['DK']` field exists for exactly
this: a store narrower than its zone. `storeShipsHere()` checks `only` first.

Note the general pattern: **a vendor's willingness to ship somewhere is not
evidence that it is legal to receive it there.** Several ship to large
unrestricted country lists covering places where these products are banned.
Their buyer-assumes-all-risk disclaimers do not transfer that exposure to us,
which is why `LEGAL[]` in the browser — not the vendor's dropdown — decides
what a shopper is shown.

## 7c. Cold starts — why the first visitor used to see an error

A full scrape of the 17 active stores measures **41.6 seconds**. `maxDuration`
is 60s and `BUDGET_MS` is 45s, so it fits, but only just. One slow store tips it
over and the visitor gets a **504** and a dead "Can't load products right now".
Even when it succeeded, the first visitor after a quiet spell waited 42 seconds.

Three layers now stand between a visitor and that scrape. They are independent
on purpose, because each covers a case the others do not:

1. **In-memory `CACHE`** — 30 min TTL, but only helps a *warm* instance.
2. **Shared KV cache** (`nm:catalogue:v1`) — a cold instance reads the last good
   payload and serves it instantly instead of scraping. Written **only after a
   complete scrape**: caching a truncated read would hand every later visitor
   the gap this one instance happened to hit. The write is **awaited**, because
   a serverless function is frozen the moment its response is sent and a
   fire-and-forget write would simply never land.
3. **CDN** — `s-maxage=600, stale-while-revalidate=86400`. The long SWR is the
   point: past 10 minutes the edge serves a **stale copy instantly** and
   revalidates behind it, so the window where nobody has anything to serve is
   tiny. It was `3600`, which left an hour-plus hole every quiet night.

The client backs all that up: `loadCatalogue()` retries on failure at 4s, 12s
and 25s. A 504 warms the function, so the retry almost always lands. The old
code dead-ended one moment before it would have worked.

**Do not "simplify" any of this to a single cache.** The in-memory one dies with
the instance, the CDN entry is per query string, and KV is the only layer that
survives both.

---

## 8. PREVIEW MODE

`js/config.js` → `previewMode`. While `true` the site ignores shipping limits and local
law so you can see every catalogue from anywhere, and shows a loud amber bar saying so.
While `false` the toggle is not rendered at all, so it cannot be switched back on from the UI.

**It is currently `true`** because the registry has no US pouch store; with it `false` a US
visitor sees an empty Pouches shelf. Flip it once that gap is filled.

---

## 9. Environment variables (all optional; the site works without them)

| Var | Purpose |
|---|---|
| `AWIN_API_KEY` | **Required for `platform:'feedcsv'` stores.** One key covers every AWIN advertiser; each store then needs its own `feedId`. Without it those stores throw a clear error and fall through to their storefront-scrape fallback. |
| `NM_CRM_WEBHOOK` | Forward `/api/subscribe` signups to an Apps Script `/exec` URL. |
| `NM_EVENTS_WEBHOOK` | Forward `/api/track` events. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | **Required for `/community`, and strongly wanted by `/api/products`.** Upstash Redis over REST. `UPSTASH_REDIS_REST_URL` / `_TOKEN` are accepted as aliases. Without them the board returns `ok:false, reason:'no-store'`, and the scraper falls back to making the first visitor wait ~42s for a live scrape (see §7c). |
| `NM_ADMIN_TOKEN` | **Required for `/moderation`.** Without it every `action=mod:*` route 403s, so the queue is unreachable rather than open. |
| `NM_BLOCKLIST` | Optional, comma-separated. Extra terms that send a post to the hold queue. Deliberately not hardcoded so it can be tuned without a deploy. |

Never commit secrets. `.env*` is gitignored; see `.env.example`.

### Bringing a CSV-feed store live

1. Set `AWIN_API_KEY` in Vercel (once, covers all of them).
2. Get the **feed id** from AWIN → Toolbox → Create-a-Feed. It is **not**
   the advertiser id already recorded in the registry — they are different
   numbers, and swapping them returns a different merchant's catalogue.
3. Put it in `feedId`, uncomment the entry, deploy.

Leave `ref` empty on feed stores. The feed's `aw_deep_link` **is** the tracked
link; appending `?ref=` would be a second, conflicting attribution. `get()`
refuses to fetch any URL carrying a tracking param, so the scraper can never
click our own links and manufacture phantom conversions.

Feed stores keep a storefront fallback in their ladder, so a missing key or an
offline feed degrades to scraping rather than to zero products.

---

## 10. Verify before you merge

No test suite, so verify by hand:

1. `npm run check` — syntax-checks `server.mjs` and every `api/*.js`.
2. `npm run dev`, then **restart it after any `api/` edit** — modules are cached.
3. Load `/` and each department route; confirm real content, not a page containing "404".
4. `GET /api/products?debug` — per-store counts sane, `byDept` populated across all six.
5. Anything user-facing: check desktop **and** mobile widths.

---

## 11. The community — `/community` ("The Back Door")

Public threads. `api/threads.js` + `public/community.html` + `public/js/community.js`,
moderated from `public/moderation.html`.

**Scope was chosen deliberately and narrowing it is not a limitation to "fix":**

- **No accounts, no sign-up, no email, no passwords.** Identity is a handle you type,
  kept in `localStorage` for convenience. The cheapest way to never leak personal data
  is to never accept it.
- **No DMs.** Everything is public.
- **NO SALES, TRADES OR MEETUPS.** This is the load-bearing one. A board that lets
  strangers arrange to ship each other nicotine is an unlicensed distribution channel
  regardless of what the footer says — PACT Act and state law both apply. `HOLD_PATTERNS`
  in `api/threads.js` auto-holds posts matching payment, sale, contact-detail and meetup
  language. **Do not weaken those patterns.**

Moderation, all four on by default: report button → `mod:reports`; auto-hide at
`AUTOHIDE_REPORTS` (3); 21+ affirmation enforced **server-side**, not just in the UI;
per-IP rate limits (4/min, 30/hr); blocklist + auto-hold queue.

Deletion is a **tombstone**, not a splice — `LSET` keeps every other post's index stable
so permalinks and reply counts don't shift under readers mid-thread.

**Posts are rendered with `textContent`, never `innerHTML`**, and the API strips angle
brackets on the way in. Two locks on the same door. On a board with no accounts a
stored-XSS bug would be the whole ballgame — do not "simplify" this to `innerHTML`.

`/community` and `/moderation` are both `noindex, nofollow`.

---

## 12. Hard "do not" list

- Do NOT reintroduce a base64 engine blob (§5).
- Do NOT hardcode routes in `server.mjs` — `vercel.json` only (§3).
- Do NOT add a build step or framework (§2).
- Do NOT change a shared design token without changing the sister sites (§4).
- Do NOT commit `node_modules`, `.env*`, `.vercel`, `*.log`.
- Do NOT hardcode product data into pages — always source from `/api/products`.
- Do NOT push directly to the production branch; open a PR.
- Do NOT ship with `previewMode: true` (§8).
