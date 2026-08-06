/* ============================================================
   /api/products — the live scraper
   ------------------------------------------------------------
   Port of the Apps Script Code.gs pipeline. Why it moved:

   Apps Script fetches from Google's egress IPs, which a lot of
   storefront WAFs treat as a bot and 403. That is why only 2 of 11
   stores were coming through. Node on Vercel gets ordinary datacentre
   egress, a real User-Agent, and — the big one — it can fan out across
   every store CONCURRENTLY instead of sleeping 400ms between doors on
   a 6-minute execution clock.

   Response shape is `{ ok, stores, meta, items, updated }` and the
   front end depends on it. Keep it stable.

     GET /api/products           cached
     GET /api/products?refresh   force a fresh scrape
     GET /api/products?debug     per-store counts and which door worked
   ============================================================ */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
           'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/* ============================================================
   THE REGISTRY — the only thing you routinely edit.
   Lives server-side so commission notes never reach a browser.
     ref     the affiliate code that store issued you
     ships   US | UK | EU | INTL   (INTL means anywhere)
     guess   1 = inferred, not verified against their shipping policy
     perPack pouches per can, for the per-pouch price
     cartPath Woo carts are not all at /cart/ — see Wave Vape
   ============================================================ */
export const STORES = [
  /* --- pouches & snus --- */
  { key:'snusoclock', name:"Snus O'Clock", dept:'pouch', domain:'snusoclock.com',
    ref:'nicotinebaby', ships:['EU'], guess:1, perPack:20, platform:'shopify' },
  { key:'europesnus', name:'Europesnus', dept:'pouch', domain:'europesnus.com',
    ref:'rjuntxyu', ships:['EU'], guess:1, perPack:20, platform:'shopify' },
  { key:'nikopouches', name:'NikoPouches.dk', dept:'pouch', domain:'nikopouches.dk',
    ref:'idtzhxpu', ships:['EU'], guess:1, perPack:20, platform:'shopify' },

  /* --- disposables ---
     Wave Vape: GoAffPro 10%, shop id 4QTSbUnS3TvZ. Foger 35 + Geek Bar 5.
     WooCommerce 10.9.4 with the Store API open, so no scraping needed.
     cartPath is load-bearing: their basket is /cart-2/, not /cart/, and
     their own buttons post to /store/?add-to-cart= — the default Woo
     handoff 404s without it. */
  { key:'wavevape', name:'Wave Vape', dept:'disposable', domain:'wavevape.shop',
    ref:'nicotinebaby', ships:['US'], platform:'woocommerce', featured:1,
    cartPath:'/store/', shipFlat:5.99, shipFree:55 },

  /* EightVape. AWIN 86487 applied, scraping meanwhile — so `ref` is
     empty on purpose and buildAff() omits the param entirely rather
     than sending ?ref= with nothing after it.

     Their Store API is CLOSED, which is why this carries `cats`: the
     category pages are the source and wooCategoryWalk() reads them.

     Categories audited against their own nav. The five top-level ones
     are Disposables, Juice, Kits, Pouches, Accessories; Coils/Pods/
     Tanks/Mods sit under hardware. Everything else linked on the site
     is a merchandising bucket (new-arrivals, flash-sale, *-clearance,
     buy-1-get-1-free) or a brand shelf (geek-bar, dojo, foger,
     smok-novo…) that only re-lists products already in the real
     categories — walking them costs requests and returns duplicates.

     This one store spans FOUR of our departments, which is the whole
     reason deptMap exists. It is currently our only source of US
     nicotine pouches AND our only source of e-liquid at all. */
  { key:'eightvape', name:'EightVape', dept:'disposable', domain:'www.eightvape.com',
    ref:'', ships:['US'], guess:1, platform:'woocommerce', awin:86487,
    cats:['disposable-vape','kits','vape-mods','vape-pods','vape-tanks',
          'vape-coils','vape-accessories','juice','nicotine-pouch',
          'nicotine-free-vape'],
    deptMap:{ 'disposable-vape':'disposable', 'nicotine-free-vape':'disposable',
              'juice':'liquid', 'vape-juice-clearance':'liquid',
              'nicotine-pouch':'pouch',
              'kits':'device', 'vape-mods':'device', 'vape-pods':'device',
              'vape-tanks':'device', 'vape-coils':'device',
              'vape-accessories':'gear' } },

  /* --- devices, pods, hardware --- */
  { key:'vaporesso', name:'Vaporesso', dept:'device', domain:'store.vaporesso.com',
    ref:'nicotinebaby', ships:['US','INTL'], guess:1, featured:1, platform:'shopify' },
  { key:'geekvape', name:'Geekvape', dept:'device', domain:'store.geekvape.com',
    ref:'nicotinebaby', ships:['US','INTL'], guess:1, featured:1, platform:'shopify' },
  { key:'freemax', name:'Freemax', dept:'device', domain:'www.freemaxvape.com',
    ref:'nicotinebaby', ships:['US'], guess:1, platform:'woocommerce' },
  { key:'relxuk', name:'RELX UK', dept:'device', domain:'www.relxvape.co.uk',
    ref:'nicotinebaby', ships:['UK'], platform:'shopify' },

  /* --- cigars --- */
  { key:'montero', name:'Montero Cigars', dept:'cigar', domain:'monterocigars.com',
    ref:'nicotinebaby', ships:['US'], guess:1, featured:1, platform:'shopify' },
  { key:'beardedcigar', name:'Beard Cigars', dept:'cigar', domain:'beardcigars.com',
    ref:'nicotinebaby', ships:['US'], guess:1, platform:'bigcommerce' },

  /* --- gear & accessories ---
     XIFEI is cigar ACCESSORIES. Filed under 'cigar' it was priced per
     stick, so a $199 humidor read "$199.00 per stick". */
  { key:'xifei', name:'XIFEI', dept:'gear', domain:'xifeicigaraccessory.com',
    ref:'nicotinebaby', ships:['US','INTL'], guess:1, platform:'shopify' },

  /* ==========================================================
     NOT LIVE YET — uncomment as each one is approved.
     ----------------------------------------------------------
     To bring one online: paste the tracked ref (or the AWIN link)
     into `ref`, uncomment the entry, and deploy. Nothing else to do
     — the front end reads the registry from this file.

     Terms are recorded here because they decide PLACEMENT, not just
     whether to take the deal: a 45-day cookie earns a spot on a
     research-heavy page, a 7-day one only converts on impulse.
     ---------------------------------------------------------- */

  /* ---- GoAffPro, self-serve. Apply and you generally get a link the
     same day, so these are the fastest to bring online. ---- */

  // Jake's Mint Chew — tobacco-free mint chew. Not a pouch, but the
  // closest US smokeless product with an affiliate programme, and it
  // fills a department that is otherwise entirely EU. perPack:1
  // because it is priced per tin, not per portion.
  // { key:'jakes', name:"Jake's Mint Chew", dept:'pouch', domain:'jakesmintchew.com',
  //   ref:'nicotinebaby', ships:['US'], guess:1, platform:'shopify', perPack:1 },   // 10%, 7-day

  // { key:'snusbb', name:'Snus BB', dept:'pouch', domain:'snusbb.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify', perPack:20 },              // $2 flat/sale, 7-day — low rate, but US pouch stock
  // { key:'brusco', name:'Brusco Cigars', dept:'cigar', domain:'bruscocigars.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify' },                          // 10%, 30-day — best cigar rate x cookie found
  // { key:'onestoppipe', name:'One Stop Pipe Shop', dept:'gear', domain:'www.onestoppipeshop.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify' },                          // 12%, 10-day
  // { key:'threeavape', name:'3AVAPE', dept:'device', domain:'3avape.myshopify.com',
  //   ref:'', ships:['US','INTL'], guess:1, platform:'shopify' },                   // 10%, 45-DAY — longest vape cookie on the list
  // { key:'bimovape', name:'Bimo Vape', dept:'device', domain:'bimovape.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify' },                          // 15%, 7-day
  // { key:'yllvape', name:'YLL Vape', dept:'device', domain:'yllvape.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify' },                          // 15%, 7-day
  // { key:'iecigbest', name:'iEcigBest', dept:'device', domain:'iecigbest.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify' },                          // 15%, 7-day
  // { key:'vapeschoice', name:'Vapes Choice', dept:'device', domain:'vapeschoice.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify' },                          // 10%, 7-day

  /* ---- Applied, awaiting response ---- */

  // SnusCore — Shopify at pouchy-europe.myshopify.com serving an EU root
  // and a US market at /en-us from ONE catalogue. Both are walked and
  // each product is tagged with the markets that carry it, so a Swedish
  // snus that cannot legally reach the US is never shown to a US
  // shopper. `markets` drives itemReaches() in the front end.
  // Storefront token fa5367e9f729ddb0ee4dcf6f1146e544 if products.json closes.
  // { key:'snuscore', name:'SnusCore', dept:'pouch', domain:'snuscore.com',
  //   ref:'', ships:['US','EU'], platform:'shopify', perPack:20,
  //   markets:[{code:'US',path:'/en-us'},{code:'ROW',path:''}],
  //   cats:['all','nicotine-pouches','energy-pouches','aroma-pouches',
  //         'cream-energy-pouches','hardy-energy-pouches','xqs-caffeine'] },

  /* ---- AWIN, applied. Flip `ref` to the tracked link on approval.
     For platform:'feedcsv' the AWIN product feed URL goes in `domain`
     — a feed skips scraping entirely: no WAF, no 250-product ceiling.
     That path is NOT implemented yet; see CLAUDE.md §7. ---- */

  // { key:'jones', name:'Jones', dept:'pouch', domain:'quitwithjones.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify', awin:63308, perPack:1 },
  //   // Mint nicotine LOZENGES, 30-day, feed, 84% approval, $2.14 EPC.
  //   // Positioned as a quit-vaping aid — cessation language is accurate
  //   // here and NOWHERE else on the site. See the hard rules in CLAUDE.md.
  // { key:'trgt', name:'TRGT', dept:'pouch', domain:'taketrgt.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify', awin:126721, perPack:20 },
  //   // NICOTINE-FREE performance pouches, US. New programme, no EPC history.
  // { key:'smokecartel', name:'Smoke Cartel', dept:'device', domain:'smokecartel.com',
  //   ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:77378 },              // 365-day cookie, 15%+, 5k products, $110 AOV
  // { key:'relxglobal', name:'RELX', dept:'device', domain:'relxnow.com',
  //   ref:'', ships:['US','INTL'], guess:1, platform:'feedcsv', awin:82289 },       // 100% approval, feed. Replaces RELX UK's 1% for US traffic
  // { key:'fruitia', name:'FRUITIA', dept:'liquid', domain:'fruitia.shop',
  //   ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:108248 },             // states 20%, 60-day
  // { key:'vapejuicedepot', name:'Vape Juice Depot', dept:'liquid', domain:'vapejuicedepot.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify', awin:96141 },              // states 10%, 90-day. NO feed — scrape it
  // { key:'kindjuice', name:'Kind Juice', dept:'liquid', domain:'www.kindjuice.com',
  //   ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:89381 },              // states 10%, 90-day, organic/PG-free
  // { key:'humidors', name:'1st Class Humidors', dept:'gear', domain:'www.1stclasshumidors.com',
  //   ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:105497 },             // 90-day, fills the accessory gap beside XIFEI
  // { key:'bnbtobacco', name:'BnB Tobacco', dept:'cigar', domain:'www.bnbtobacco.com',
  //   ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:87969 },              // feed, 100% approval, 8.5% conversion
]

/* Only these fields ever reach a browser. */
function publicStores() {
  return STORES.filter(s => !s.pending).map(s => ({
    key: s.key, name: s.name, dept: s.dept, domain: s.domain,
    ref: s.ref, ships: s.ships, guess: s.guess ? 1 : 0,
    perPack: s.perPack || 0, platform: s.platform || '',
    cartPath: s.cartPath || '', logo: s.logo || '',
    coupon: s.coupon || '', off: Number(s.off) || 0,
    shipFlat: Number(s.shipFlat) || 0, shipFree: Number(s.shipFree) || 0,
  }))
}

/* ============================================================
   CLASSIFIERS
   ============================================================ */
const SNUS_BRANDS = /(general|siberia|skruf|g[oö]teborgs|rap[eé]|odens?|jakobssons?|thunder|ettan|grov|kronan|catch|kaliber|r[oö]da lacket|knox|granit|probe|mocca)\b/i
const SNUS_WORDS = /\b(l[oö]s(e|vikt)?|loose|portion snus|original portion|white portion|moist snuff|chewing tobacco|dipping tobacco|makla)\b/i

function isTobaccoSnus(text) {
  if (!text) return false
  if (/tobacco[- ]free|nicotine pouch|all[- ]white/i.test(text)) return false
  return SNUS_BRANDS.test(text) || SNUS_WORDS.test(text)
}

function guessStrength(text) {
  if (!text) return ''
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*mg/i)
  return m ? Number(m[1]) : ''
}

/* A disposable advertises its life in puffs and it is right there in
   the title: "Switch Pro Kit 30K", "Mate 60K", "15000 Puffs". Skip mAh
   — a battery rating is not a puff count. */
function guessPuffs(text) {
  if (!text) return ''
  const s = String(text)
  let m = s.match(/(\d{1,3}(?:[.,]\d)?)\s*k\b(?!\s*mah)/i)
  if (m) {
    const k = Number(String(m[1]).replace(',', '.'))
    if (k >= 1 && k <= 200) return k * 1000
  }
  m = s.match(/(\d{3,7})\s*(?:\+\s*)?puffs?\b/i)
  if (m) {
    const n = Number(m[1])
    if (n >= 300 && n <= 200000) return n
  }
  return ''
}

/* Per-product department. A store can span shelves — Wave Vape sells
   disposables AND pods, EightVape sells four departments — so the
   product's own signals win and the store's dept is only a fallback. */
function classify(st, blob) {
  const t = String(blob || '').toLowerCase()
  if (/\b(nicotine pouch|snus|pouches|lozenge|mint chew)\b/.test(t)) return 'pouch'
  if (/\b(disposable|puffs?|\d{1,3}k\b)/.test(t) && !/coil|tank|replacement pod/.test(t)) return 'disposable'
  if (/\b(e-?liquid|vape juice|shortfill|\d+\s*ml)\b/.test(t) && !/disposable/.test(t)) return 'liquid'
  if (/\b(humidor|cutter|lighter|ashtray|case|grinder|torch|hygrometer)\b/.test(t)) return 'gear'
  if (/\b(cigar|robusto|toro|churchill|maduro)\b/.test(t)) return 'cigar'
  if (/\b(coil|tank|mod|pod kit|atomiser|atomizer|battery|charger)\b/.test(t)) return 'device'
  return st.dept
}

function cleanDesc(html) {
  if (!html) return ''
  let t = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim()
  if (t.length > 420) {
    t = t.substring(0, 420)
    const cut = t.lastIndexOf('. ')
    t = (cut > 200 ? t.substring(0, cut + 1) : t.replace(/\s\S*$/, '')) + '…'
  }
  return t
}

function sizeImage(src, w = 500) {
  if (!src) return ''
  if (src.startsWith('//')) src = 'https:' + src
  if (!src.includes('cdn.shopify.com') && !src.includes('/cdn/shop/')) return src
  return src + (src.includes('?') ? '&' : '?') + 'width=' + w
}

/* No ref yet (EightVape is scraping while its AWIN application sits in
   the queue) means no ?ref= at all. Appending an empty param is worse
   than omitting it: some carts treat ref= as an explicit empty
   attribution and clear a cookie set earlier in the session. */
function buildAff(st, url) {
  const base = url || `https://${st.domain}/`
  if (!st.ref) return base
  return base + (base.includes('?') ? '&' : '?') + 'ref=' + st.ref
}

function row(st, o) {
  const blob = [o.title, o.variant, o.tags, o.desc].filter(Boolean).join(' ')
  const url = o.url || ''
  return {
    id: `${st.key}-${o.vid || url}`,
    key: st.key,
    /* A category page knows better than a regex does. When the walk
       hands us a dept from the store's own deptMap it wins outright. */
    dept: o.dept || classify(st, blob),
    brand: o.brand || st.name,
    title: o.title || '',
    variant: o.variant === 'Default Title' ? '' : (o.variant || ''),
    strength: guessStrength(blob),
    puffs: guessPuffs(blob),
    price: o.price != null ? String(o.price) : '',
    compareAt: o.compareAt != null ? String(o.compareAt) : '',
    available: o.available !== false,
    tobacco: isTobaccoSnus(blob),
    image: sizeImage(o.image),
    url,
    currency: o.currency || 'USD',
    desc: cleanDesc(o.desc),
    vid: o.vid ? String(o.vid) : '',
    markets: o.markets || '',
    aff: buildAff(st, url),
  }
}

/* ============================================================
   FETCH
   ============================================================ */
async function get(url, ms = 12000) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

/* ============================================================
   STRATEGIES — tried in order, first one with rows wins
   ============================================================ */

/* Shopify's public products.json. Note it serves a SINGLE page of 250
   on most storefronts now; ?page= is widely ignored, which is why a
   4,000-product shop reports exactly 250 and looks complete. When we
   see a clean 250 boundary we walk collections instead. */
async function shopifyProducts(st) {
  const out = []
  for (let page = 1; page <= 10; page++) {
    const res = await get(`https://${st.domain}/products.json?limit=250&page=${page}`)
    if (res.status === 403) throw new Error('403 blocked at edge')
    if (res.status === 404) throw new Error('404 endpoint off')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const text = await res.text()
    if (text.slice(0, 15).toLowerCase().includes('<!doctype')) throw new Error('got HTML not JSON')
    let data
    try { data = JSON.parse(text) } catch { throw new Error('unparseable JSON') }
    const prods = data.products || []
    if (!prods.length) break
    for (const pr of prods) {
      const img = pr.images && pr.images[0] ? pr.images[0].src : ''
      const url = `https://${st.domain}/products/${pr.handle}`
      const vts = pr.variants && pr.variants.length ? pr.variants : [{}]
      for (const v of vts) {
        out.push(row(st, {
          brand: pr.vendor, title: pr.title, variant: v.title,
          tags: Array.isArray(pr.tags) ? pr.tags.join(' ') : pr.tags,
          price: v.price, compareAt: v.compare_at_price,
          available: v.available !== false, image: img, url,
          desc: pr.body_html, vid: v.id,
        }))
      }
    }
    if (prods.length < 250) break
  }
  return out
}

async function shopifyCollection(st) {
  const res = await get(`https://${st.domain}/collections/all/products.json?limit=250`)
  if (!res.ok) throw new Error('collections HTTP ' + res.status)
  const data = await res.json()
  const out = []
  for (const pr of data.products || []) {
    const img = pr.images && pr.images[0] ? pr.images[0].src : ''
    const url = `https://${st.domain}/products/${pr.handle}`
    for (const v of (pr.variants && pr.variants.length ? pr.variants : [{}])) {
      out.push(row(st, {
        brand: pr.vendor, title: pr.title, variant: v.title,
        tags: Array.isArray(pr.tags) ? pr.tags.join(' ') : pr.tags,
        price: v.price, compareAt: v.compare_at_price,
        available: v.available !== false, image: img, url,
        desc: pr.body_html, vid: v.id,
      }))
    }
  }
  if (!out.length) throw new Error('collections returned nothing')
  return out
}

/* WooCommerce Store API. Public and unauthenticated on most Woo shops,
   and the single most likely rescue for anything that 404s on
   products.json. This is what Wave Vape runs. */
async function wooStoreApi(st) {
  const out = []
  for (let page = 1; page <= 20; page++) {
    const res = await get(`https://${st.domain}/wp-json/wc/store/v1/products?per_page=100&page=${page}`)
    if (!res.ok) {
      if (page === 1) throw new Error('woo API HTTP ' + res.status)
      break
    }
    let data
    try { data = await res.json() } catch { if (page === 1) throw new Error('woo API unparseable'); break }
    if (!Array.isArray(data) || !data.length) { if (page === 1) throw new Error('woo API empty'); break }
    for (const p of data) {
      const minor = Number(p.prices?.currency_minor_unit ?? 2)
      const div = Math.pow(10, minor)
      const price = p.prices?.price != null ? (Number(p.prices.price) / div).toFixed(2) : ''
      const reg = p.prices?.regular_price
      const compareAt = reg && reg !== p.prices.price ? (Number(reg) / div).toFixed(2) : ''
      out.push(row(st, {
        brand: st.name, title: p.name, variant: '',
        tags: (p.categories || []).map(c => c.name).join(' '),
        price, compareAt, available: p.is_in_stock !== false,
        image: p.images?.[0]?.src || '', url: p.permalink,
        currency: p.prices?.currency_code || 'USD',
        desc: p.short_description || p.description, vid: p.id,
      }))
    }
    if (data.length < 100) break
  }
  return out
}

/* ---- WooCommerce category walk ----
   EightVape runs WooCommerce with the Store API closed, so its category
   pages are the source. Their markup is generous: each card carries a
   product-title link, a wishlist button holding data-id, a clean
   data-product_image, a woocommerce-Price-amount, and an outofstock
   class when it applies.

   The id matters as much as the price — it is what makes
   /cart/?add-to-cart=<id> fill their basket at checkout. */
function lastMatch(text, re) {
  let m, last = ''
  while ((m = re.exec(text)) !== null) last = m[1]
  return last
}

function wooCards(st, html, dept, seen) {
  const out = []
  const re = /<h3[^>]*class="[^"]*product-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const url = m[1]
    if (!url.includes('/product/')) continue
    if (seen.has(url)) continue
    seen.add(url)

    const title = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
      .replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim()
    if (!title) continue

    /* price sits just after the title; a variable product shows a range
       and the low end is the honest "from" figure */
    const after = html.substr(m.index, 2200)
    const pm = after.match(/woocommerce-Price-currencySymbol">[^<]*<\/span>([\d,]+\.?\d*)/i)
    const price = pm ? pm[1].replace(/,/g, '') : ''

    /* id, image and stock sit in the block BEFORE the title. Take the
       LAST match, not the first — a greedy backward search anchors on
       the earliest candidate and silently shifts every id by one card. */
    const back = html.substring(Math.max(0, m.index - 6000), m.index)
    let img = lastMatch(back, /data-product_image="([^"]+)"/gi)
    const pid = lastMatch(back, /data-id="(\d+)"/gi)
    if (img) img = img.replace(/-\d+x\d+(\.(?:jpg|jpeg|png|webp))/i, '$1')
    const oos = /class="[^"]*\boutofstock\b/i.test(back.slice(-2500))

    out.push(row(st, {
      brand: st.name, title, tags: title, dept,
      price, available: !oos, image: img, url, vid: pid,
    }))
  }
  return out
}

async function wooCategoryWalk(st) {
  const cats = st.cats && st.cats.length ? st.cats.slice() : []
  if (!cats.length) throw new Error('no cats configured for category walk')

  const out = []
  const seen = new Set()
  for (const cat of cats) {
    /* deptMap routes each category onto the right shelf. EightVape's
       categories span four of ours, so the store's own dept is only a
       fallback for anything unmapped. */
    const dept = (st.deptMap && st.deptMap[cat]) || st.dept
    for (let page = 1; page <= 12; page++) {
      const url = `https://${st.domain}/product-category/${cat}/` + (page > 1 ? `page/${page}/` : '')
      let res
      try { res = await get(url) } catch { break }
      if (!res.ok) break
      const html = await res.text()
      const got = wooCards(st, html, dept, seen)
      out.push(...got)
      if (!got.length) break
      if (!html.includes(`/page/${page + 1}/`)) break
    }
  }
  if (!out.length) throw new Error('category pages returned no cards')
  return out
}

/* Themes emit <script type="application/ld+json"> Product objects.
   That markup exists so machines can read it — a published interface,
   not a workaround. Last resort for BigCommerce and custom carts. */
function collectProducts(node, found = []) {
  if (!node || typeof node !== 'object') return found
  if (Array.isArray(node)) { node.forEach(n => collectProducts(n, found)); return found }
  const t = node['@type']
  if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) found.push(node)
  if (node['@graph']) collectProducts(node['@graph'], found)
  if (node.itemListElement) collectProducts(node.itemListElement, found)
  if (node.item) collectProducts(node.item, found)
  return found
}

async function jsonLd(st) {
  const paths = ['/collections/all', '/shop', '/products', '/']
  for (const p of paths) {
    let res
    try { res = await get(`https://${st.domain}${p}`) } catch { continue }
    if (!res.ok) continue
    const html = await res.text()
    const chunks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
    if (!chunks) continue
    const out = []
    for (const ch of chunks) {
      const body = ch.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
      let j
      try { j = JSON.parse(body) } catch { continue }
      for (const pr of collectProducts(j)) {
        const offer = [].concat(pr.offers || [])[0] || {}
        let img = [].concat(pr.image || [])[0] || ''
        if (img && typeof img === 'object') img = img.url || ''
        out.push(row(st, {
          brand: pr.brand?.name, title: pr.name, price: offer.price,
          available: !/outofstock|soldout/i.test(String(offer.availability || '')),
          image: img, url: pr.url || `https://${st.domain}${p}`,
          currency: offer.priceCurrency, desc: pr.description,
        }))
      }
    }
    if (out.length) return out
  }
  throw new Error('no JSON-LD Product objects found')
}

const LADDERS = {
  shopify: [['products.json', shopifyProducts], ['collections', shopifyCollection], ['json-ld', jsonLd]],
  woocommerce: [['woo store api', wooStoreApi], ['woo categories', wooCategoryWalk], ['json-ld', jsonLd]],
  bigcommerce: [['json-ld', jsonLd]],
  default: [['products.json', shopifyProducts], ['woo store api', wooStoreApi], ['json-ld', jsonLd]],
}

/* Dedupe. Every strategy runs through this, so a parser that
   double-counts can inflate a catalogue but never reach the client.
   Keyed on URL + variant + price, because two sizes of the same cigar
   are genuinely two rows. */
function dedupe(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const k = `${String(r.url).replace(/[?#].*$/, '')}|${r.vid || r.variant}|${r.price}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

async function scrapeStore(st) {
  const ladder = LADDERS[st.platform] || LADDERS.default
  const errors = []
  for (const [door, fn] of ladder) {
    try {
      const got = await fn(st)
      if (got && got.length) {
        const items = dedupe(got)
        const inStock = items.filter(i => i.available).length
        const priced = items.filter(i => i.price && Number(i.price) > 0).length
        let detail = `via ${door} (${inStock}/${items.length} in stock)`
        if (!priced) detail += '  [WARNING: no prices — likely a brand site, not a storefront]'
        else if (priced < items.length / 2) detail += `  [only ${priced}/${items.length} priced]`
        if (items.length && !inStock) detail += '  [WARNING: nothing in stock]'
        return { key: st.key, result: priced ? 'ok' : 'no prices', count: items.length, detail, items }
      }
      errors.push(`${door}: empty`)
    } catch (e) {
      errors.push(`${door}: ${e.message}`)
    }
  }
  return { key: st.key, result: 'FAILED', count: 0, detail: errors.join(' | '), items: [] }
}

/* ============================================================
   CACHE — in-memory per warm instance, CDN does the rest
   ============================================================ */
let CACHE = { at: 0, payload: null }
const TTL = 30 * 60 * 1000

export default async function handler(req, res) {
  const q = req.query || {}
  const fresh = 'refresh' in q

  if (!fresh && CACHE.payload && Date.now() - CACHE.at < TTL) {
    res.setHeader('X-Cache', 'HIT')
    return res.status(200).json(CACHE.payload)
  }

  const active = STORES.filter(s => !s.pending)

  /* The whole point of leaving Apps Script: every store at once,
     instead of serial fetches on a 6-minute execution clock. */
  const results = await Promise.all(active.map(st =>
    scrapeStore(st).catch(e => ({ key: st.key, result: 'FAILED', count: 0, detail: e.message, items: [] }))
  ))

  const items = results.flatMap(r => r.items)
  const meta = results.map(({ key, result, count, detail }) => ({ key, result, count, detail }))

  const payload = {
    ok: true,
    stores: publicStores(),
    meta,
    count: items.length,
    updated: new Date().toISOString(),
    items,
  }

  CACHE = { at: Date.now(), payload }
  res.setHeader('X-Cache', fresh ? 'BYPASS' : 'MISS')

  if ('debug' in q) {
    return res.status(200).json({
      ok: true, updated: payload.updated, total: items.length,
      stores: meta.map(m => `${m.key}: ${m.result} (${m.count}) — ${m.detail}`),
      byDept: items.reduce((a, i) => { a[i.dept] = (a[i.dept] || 0) + 1; return a }, {}),
    })
  }
  return res.status(200).json(payload)
}
