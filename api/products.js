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

     ref       the affiliate code that store issued you
     ships     US | UK | EU | INTL   (INTL means anywhere)
     only      ISO country codes, when the store is narrower than its
               zone. NikoPouches sits in the EU zone but publishes
               Denmark-only delivery, so only:['DK'].
     guess     1 = inferred, NOT read off their shipping policy
     perPack   pouches per can, for the per-pouch price
     cartPath  Woo carts are not all at /cart/ — see Wave Vape
     from      where it physically ships from, which sets the wait
     days      published delivery window, shown before the hand-off
     ageCheck  how the STORE verifies age at its own checkout:
                 id        government ID / verified identity service
                 signature adult signature required at the door
                 dob       self-declared date of birth
                 none      nothing published
               Surfaced in the cart. A shopper handing money to ten
               different vendors should be told which of them actually
               check, rather than being shown ten identical Buy buttons.

   `ships`, `only`, `from`, `days` and `ageCheck` below were read off
   each vendor's own published policy in Aug 2026. Re-check quarterly.
   ============================================================ */
export const STORES = [
  /* --- pouches & snus --- */
  /* `currency` pins what the store actually charges in. It is fetched
     from /meta.json when absent, but pinning the known ones means a
     blocked meta.json can never silently relabel £4.45 as $4.45. */
  /* Ships internationally with NO published exclusions and NO age check
     at checkout — the weakest compliance posture of the ten. Left at EU
     rather than INTL deliberately: their willingness to ship somewhere
     is not evidence it is legal to receive it there, and LEGAL[] in the
     browser is what should decide that. */
  { key:'snusoclock', name:"Snus O'Clock", dept:'pouch', domain:'snusoclock.com',
    ref:'nicotinebaby', ships:['EU'], guess:1, perPack:20, platform:'shopify',
    currency:'GBP', from:'GB', days:'3–7 days', ageCheck:'none' },

  /* ~150 destinations accepted at checkout, no excluded-country list,
     no age step. Mon–Fri processing; customs paperwork case-by-case. */
  { key:'europesnus', name:'Europesnus', dept:'pouch', domain:'europesnus.com',
    ref:'rjuntxyu', ships:['EU'], guess:1, perPack:20, platform:'shopify',
    currency:'EUR', from:'EU', days:'3–5 business days', ageCheck:'none' },

  /* ==========================================================
     NICOKICK — the US pouch problem, solved.
     ----------------------------------------------------------
     The operator notes recorded this as structurally impossible:
     "The US pouch market is ZYN, on!, VELO and Rogue — all owned by
     Swedish Match, Altria, BAT and Turning Point. None run affiliate
     programmes." True of the BRANDS. Nicokick is the retailer that
     carries all four, and it is on CJ.

       Nicotine Pouches  410   ZYN 54 · Rogue 44 · FRE 58 · Lucy 35
                               on! 30 · VELO 28 · Juice Head 14 · LIX 5
       Nicotine Gum       15
       Powerstep          57

     Magento 2 with a wide-open GraphQL endpoint, so this is the
     cleanest scrape on the site — real pagination, real stock status,
     regular and final price both.

     `cats` are Magento category UIDs, not slugs. NDQ= is Nicotine
     Pouches; the gum and lozenge categories are deliberately left out
     because a per-pouch price is meaningless for gum.

     perPack 15 is ZYN and Rogue's can count, which is most of the
     volume — VELO and on! are 20, and packOf() reads an explicit count
     off the title when the store states one.

     TO EARN ON THIS: set cjPid (your CJ publisher id) and cjAid (the
     per-advertiser link id) from the CJ dashboard. Until both are set
     the links still work but pay nothing, and the refresh report says
     so in capitals. */
  { key:'nicokick', name:'Nicokick', dept:'pouch', domain:'nicokick.com',
    network:'cj', cjPid:'', cjAid:'', ref:'',
    ships:['US'], platform:'magento', perPack:15, currency:'USD',
    from:'US', days:'2–5 days', ageCheck:'id', featured:1,
    cats:['NDQ='],
    deptMap:{ 'NDQ=':'pouch' } },

  /* DENMARK ONLY. Their terms say it outright — "Vi leverer ikke til
     udlandet", including the Faroes and Greenland — while their
     checkout still renders a ~30-country dropdown. We were showing
     this store to every EU shopper, which is an order that cannot be
     fulfilled. `only` narrows it to the country the policy actually
     names. Best age gate of the ten: MitID via VerifyID.dk. */
  { key:'nikopouches', name:'NikoPouches.dk', dept:'pouch', domain:'nikopouches.dk',
    ref:'idtzhxpu', ships:['EU'], only:['DK'], perPack:20, platform:'shopify',
    currency:'DKK', from:'DK', days:'1–3 days', ageCheck:'id' },

  /* BLACK BUFFALO — tobacco-LEAF-free, not nicotine-free.
     ----------------------------------------------------------
     The distinction matters more here than anywhere else in the
     registry and the site must never blur it. Their core line is
     made from barn-cured leafy greens plus PHARMACEUTICAL-GRADE
     NICOTINE — no tobacco leaf, full nicotine. Their separate ZERO
     line has no nicotine at all. The vendor tags every product
     `Nicotine` or `Nicotine-Free` in its own feed, so we take that
     from their metadata rather than inferring from the title —
     "Wintergreen ZERO Pouches" is only nicotine-free because they
     say so, not because of the word ZERO.

     perPack is 16 because BLACK BUFFALO'S OWN FAQ says
     "approximately 16", and it says approximately because the cans
     are filled BY WEIGHT, NOT BY COUNT — an independent count found
     14–18. So the per-pouch figure here is an estimate and the UI
     must label it as one. Do not quietly harden this into an exact
     number; that is the same class of error as the £0.003 phantom.

     Policy read directly 2026-08-08: "only available in select
     regions of the United States" — US only, and not even all of it,
     though they publish no list of which regions. An age-verified
     ACCOUNT is required before you can buy, age is re-checked at
     checkout, and certain products/destinations additionally require
     an Adult Signature on Delivery (21+). Strongest posture of any
     store in this registry.

     ref is EMPTY on purpose. They run a real affiliate programme on
     Refersion (blackbuffalo.refersion.com, 10%). A personal
     refer-a-friend code is a different instrument and does not belong
     on a commercial comparison site — see the note in CLAUDE.md.
     Until Refersion is approved these links pay nothing, exactly like
     Nicokick's empty cjPid. */
  { key:'blackbuffalo', name:'Black Buffalo', dept:'pouch', domain:'blackbuffalo.com',
    ref:'', ships:['US'], perPack:16, perPackApprox:1, platform:'shopify',
    currency:'USD', from:'US', days:'~6 days (USPS Ground Advantage)', ageCheck:'id' },

  /* ==========================================================
     GOTPOUCHES — the first Impact.com store.
     ----------------------------------------------------------
     Impact programme 54165, 15%. That is the best published rate of
     the five NM candidates in a 10,325-row marketplace export, and
     the export's own verdict was that it is "the one genuinely new
     name worth an application" — the rest of that network is a
     tobacco/nicotine policy wall, not a shelf we have not mined yet.

     ATTRIBUTION: paste the whole tracking link Impact issues into
     `impact` — the entire thing, ending in /c/<partner>/<ad>/<campaign>.
     Nothing is composed from parts and nothing is appended; see
     affTemplate(). Until it is set the links go direct, exactly like
     Nicokick's empty cjPid, and the refresh report says so in capitals.
     `ref` stays empty for the AWIN reason: a second tracking param on
     top of a wrapped link is a conflicting attribution.

     Shopify — their own URLs are /collections/, /products/, /pages/
     and /blogs/, which is Shopify's scheme and nobody else's.

     perPack 15 for Nicokick's reason: the range leads on ZYN and
     Rogue, both 15 to a can, while VELO and on! are 20. packOf()
     overrides from the title wherever the store states a count, so
     this only decides the rows that say nothing.

     ---- WHAT IS NOT VERIFIED, AND WHY --------------------------
     §7b's rule is that ships/only/from/days/ageCheck come from the
     vendor's own published policy. THESE DID NOT. Network egress from
     the build environment is blocked for this domain, so both policy
     pages were unreadable and the fields below are inference off the
     store's own marketing. `guess:1` and `ageCheck:'unknown'` are the
     record of that, and the age chip now says so to the shopper
     rather than leaving the cart silent about a nicotine vendor.

     Two specific things to settle when someone can open the site:

       1. THEY CLAIM MORE THAN US. Their copy says they ship "across
          the U.S., Caribbean, and beyond". Left at ['US'] anyway, on
          the same principle as Snus O'Clock: a vendor's willingness
          to ship somewhere is not evidence it is legal to receive it
          there, and widening `ships` on marketing copy is exactly the
          move that put a Denmark-only shop in front of every EU
          shopper.
       2. PACT ACT. A US pouch retailer shipping consumer nicotine has
          adult-signature and carrier obligations. Nothing here
          establishes whether they meet them — see the Geekvape flag.

     shipFlat/shipFree are deliberately unset. Their copy mentions
     both "free delivery" and free shipping over $150; a wrong
     estimate in the cart is worse than none. */
  { key:'gotpouches', name:'GotPouches', dept:'pouch', domain:'gotpouches.com',
    network:'impact', impact:'', ref:'',
    ships:['US'], guess:1, perPack:15, platform:'shopify',
    currency:'USD', from:'US', days:'1–3 days', ageCheck:'unknown' },

  /* --- disposables ---
     Wave Vape: GoAffPro 10%, shop id 4QTSbUnS3TvZ. Foger 35 + Geek Bar 5.
     WooCommerce 10.9.4 with the Store API open, so no scraping needed.
     cartPath is load-bearing: their basket is /cart-2/, not /cart/, and
     their own buttons post to /store/?add-to-cart= — the default Woo
     handoff 404s without it. */
  /* Age policy is solid — AgeChecker.net 21+ with ID-upload fallback,
     orders held until verified. But the page labelled "Shipping Policy"
     is a mislabelled returns/warranty page with no destination content
     at all, so there is no published state-exclusion list and no PACT
     Act adult-signature disclosure. days is our own estimate. */
  { key:'wavevape', name:'Wave Vape', dept:'disposable', domain:'wavevape.shop',
    ref:'nicotinebaby', ships:['US'], platform:'woocommerce', featured:1,
    cartPath:'/store/', shipFlat:5.99, shipFree:55,
    from:'US', days:'3–7 days', ageCheck:'id' },

  /* EightVape. AWIN 86487 applied, scraping meanwhile — so `ref` is
     empty on purpose and buildAff() omits the param entirely rather
     than sending ?ref= with nothing after it.

     Their Store API is OPEN — 1,074 products and 4,925 variations,
     verified Aug 2026. The old Code.gs note saying it was closed sent
     this store down the category walk, which is slower, capped, and
     returns no flavours at all. wooStoreApi() is first on the Woo
     ladder so it now uses the API automatically; `cats` stays as the
     documented fallback because that endpoint HAS been closed before.

     deptMap is still doing its job either way: the API path maps
     `categories[].slug` through it, the walk maps the walked cat.

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
  /* domain is the APEX, not www. www.eightvape.com redirects, and the
     redirect is where the Store API sweep was dying — it fell all the
     way down the ladder to JSON-LD and returned 41 rows with zero
     variants instead of 1,074 products and 4,925 variations. */
  /* The most rigorous US policy of the ten: 21+ adult signature and ID
     check at the door, ships from Las Vegas to the 50 states "where
     deliverable", military/APO excluded. Matches PACT Act expectations,
     though the excluded states are not named. */
  { key:'eightvape', name:'EightVape', dept:'disposable', domain:'eightvape.com',
    ref:'', ships:['US'], guess:1, platform:'woocommerce', awin:86487,
    from:'US', days:'3–8 days', ageCheck:'signature',
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
  /* Ships worldwide from a Chinese warehouse, ePacket or DHL. The
     shipping policy names no excluded countries and says nothing about
     age; checkout does prompt for date of birth. */
  { key:'vaporesso', name:'Vaporesso', dept:'device', domain:'store.vaporesso.com',
    ref:'nicotinebaby', ships:['US','INTL'], guess:1, featured:1, platform:'shopify',
    from:'CN', days:'7–30 days', ageCheck:'dob' },

  /* COMPLIANCE FLAG — see CLAUDE.md. Their policy states US orders ship
     via "USPS or UPS". The PACT Act's 2021 ENDS amendment bars USPS
     from delivering vapour products to consumers. Either the policy
     text is stale or the practice is non-compliant; worth raising with
     them before this store carries real US volume. */
  { key:'geekvape', name:'Geekvape', dept:'device', domain:'store.geekvape.com',
    ref:'nicotinebaby', ships:['US','INTL'], guess:1, featured:1, platform:'shopify',
    from:'CN', days:'7–21 days', ageCheck:'none' },

  /* OFF — their Woo Store API returns 200 with unparseable content and
     the storefront answers to "No Index", so there is no door in. The
     original Code.gs note already suspected it was a brand catalogue
     rather than a shop. Re-enable if they put a real storefront up.
  // { key:'freemax', name:'Freemax', dept:'device', domain:'www.freemaxvape.com',
  //   ref:'nicotinebaby', ships:['US'], guess:1, platform:'woocommerce',
  //   from:'US', ageCheck:'none' },
  */

  /* UK addresses only; NI and the Scottish Highlands are slower. Age
     check is weak by construction — the policy says drivers "might"
     verify 18+, not that they must.
     COMPLIANCE FLAG: the UK banned sale of single-use disposables from
     June 2025, and their "MaxGO 12K/33K Final Clearance" SKUs are
     branded and puff-rated like disposables. Many brands rebadged to
     refillable post-ban; whether these particular SKUs did is not
     answerable from the policy text. See CLAUDE.md. */
  { key:'relxuk', name:'RELX UK', dept:'device', domain:'www.relxvape.co.uk',
    ref:'nicotinebaby', ships:['UK'], platform:'shopify', currency:'GBP',
    from:'GB', days:'2–4 days', ageCheck:'dob' },

  /* --- e-liquid --- */
  /* ==========================================================
     VAPE.CO.UK — Impact programme 30370, 4% (UK).
     ----------------------------------------------------------
     4% is the lowest rate in the registry and that is placement
     information, not a reason to skip it: this is the widest UK
     catalogue we have access to — their own copy claims 8,000+ SKUs
     and "over 4000 different e-liquids and nicotine salts" — against
     a UK shelf that is currently ONE store, RELX UK, selling one
     brand's hardware. A British visitor's Pouches, E-liquid and
     Devices shelves are close to empty without this.

     `dept` is liquid because that 4,000-bottle range is the deepest
     honest home for the store, not because it is all they sell. Like
     EightVape they span four shelves — pouches and snus, big-puff
     devices, e-liquid, nic shots — and classify() routes each product
     by its own text, so the store's dept only catches what says
     nothing about itself.

     ---- PLATFORM IS NOT PINNED, ON PURPOSE ---------------------
     Same egress block as GotPouches: the storefront could not be
     opened from here, so nothing establishes whether this is Shopify,
     Woo or something else, and a WRONG pin is worse than none — it
     picks a ladder that skips the door that would have worked. Left
     unset, LADDERS.default tries products.json, then the Woo Store
     API, then JSON-LD, and first-with-rows wins. That is the ladder
     doing the job it exists for.

     Once someone can open the site: `GET /api/products?debug` names
     the door that answered. Pin `platform` to match, and check
     whether Shopify's 250-row products.json ceiling is truncating an
     8,000-product catalogue — if it is, this store wants `cats` the
     way EightVape has them. Pinning it also restores a real checkout
     hand-off: with no platform, CHECKOUT_CAP has no entry and app.js
     correctly degrades to opening the first item rather than
     promising a basket it cannot fill.

     currency is pinned GBP for the reason at the top of the registry:
     a blocked meta.json must never be able to relabel £4.45 as $4.45,
     and on a UK-only store that mistake is a 25% price error on every
     single row.

     ---- COMPLIANCE FLAG: THE SAME ONE AS RELX UK ---------------
     The UK banned the sale of single-use disposables in June 2025.
     This store's own marketing still advertises "big puff disposable
     vapes", and post-ban most brands rebadged to refillable while
     keeping the puff rating on the box. Whether these listings are
     rebadged refillables or genuinely non-compliant stock is not
     answerable from marketing copy, and it decides whether our
     Disposables shelf can carry them at all in the UK. Settle it
     before this store is featured — see CLAUDE.md §7b.

     ships/from/days/ageCheck are inference, same as GotPouches:
     `days` is their own site title ("FREE NEXT DAY DELIVERY 7 DAYS A
     WEEK"), `ships:['UK']` follows from a UK-only TPD retailer, and
     the age gate is `unknown` because UK law requiring independent
     age verification is not the same thing as having read what THIS
     vendor does at ITS checkout. perPack 20 is the EU/UK can count
     the other pouch stores use. */
  { key:'vapecouk', name:'VAPE.CO.UK', dept:'liquid', domain:'vape.co.uk',
    network:'impact', impact:'', ref:'',
    ships:['UK'], guess:1, perPack:20, currency:'GBP',
    from:'GB', days:'next day', ageCheck:'unknown' },

  /* --- cigars --- */
  /* The most legally careful vendor of the ten: Bluecheck electronic
     21+ verification before an order ships, signature on delivery, no
     PO boxes, ships only to the cardholder's billing address, explicit
     FAA restriction on lighters. */
  { key:'montero', name:'Montero Cigars', dept:'cigar', domain:'monterocigars.com',
    ref:'nicotinebaby', ships:['US'], guess:1, featured:1, platform:'shopify',
    from:'US', days:'2–5 days', ageCheck:'id' },

  /* OFF. The bigCommerceCards() strategy stays in the ladder and does
     work on this store — verified 5/5 products off /shop-all/ — so
     re-enabling is just uncommenting. Note the live shop is
     beardcigars.com (no "ed"); the bearded-cigar.myshopify.com link
     you were issued points at an abandoned storefront, so clicks on
     the old domain may never have tracked.
  // { key:'beardedcigar', name:'Beard Cigars', dept:'cigar', domain:'beardcigars.com',
  //   ref:'nicotinebaby', ships:['US'], guess:1, platform:'bigcommerce', from:'US',
  //   bcHash:'fp8papja3w' },
  */

  /* --- gear & accessories ---
     XIFEI is cigar ACCESSORIES. Filed under 'cigar' it was priced per
     stick, so a $199 humidor read "$199.00 per stick". */
  /* Accessories only — no nicotine, so no age gate is expected and the
     legal exposure is low. Torch and jet lighters do hit state and
     airline restrictions their two-line policy never mentions. */
  { key:'xifei', name:'XIFEI', dept:'gear', domain:'xifeicigaraccessory.com',
    ref:'nicotinebaby', ships:['US','INTL'], guess:1, platform:'shopify',
    from:'CN', days:'3–7 US / 15–30 intl', ageCheck:'none' },

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

  /* ---- AWIN, applied. ----------------------------------------
     platform:'feedcsv' is IMPLEMENTED now. To bring one of these live:

       1. set AWIN_API_KEY in Vercel (once, covers all of them)
       2. get the FEED ID from AWIN's feed list — it is NOT the
          advertiser id already recorded here, they are different
          numbers and mixing them up returns someone else's catalogue
       3. put it in `feedId`, uncomment, deploy

     Leave `ref` empty on these. The feed's aw_deep_link is already the
     tracked link; appending ?ref= on top would be a second, conflicting
     attribution. get() refuses to fetch tracking URLs, so the scraper
     can never click our own links.

     Each still keeps a storefront fallback in the ladder, so a missing
     key or an offline feed degrades to scraping rather than to zero. */

  // { key:'jones', name:'Jones', dept:'pouch', domain:'quitwithjones.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify', awin:63308, perPack:1 },
  //   // Mint nicotine LOZENGES, 30-day, feed, 84% approval, $2.14 EPC.
  //   // Positioned as a quit-vaping aid — cessation language is accurate
  //   // here and NOWHERE else on the site. See the hard rules in CLAUDE.md.
  // { key:'trgt', name:'TRGT', dept:'pouch', domain:'taketrgt.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify', awin:126721, perPack:20 },
  //   // NICOTINE-FREE performance pouches, US. New programme, no EPC history.
  /* WRONG SHELF — do not enable here. AWIN lists Smoke Cartel under
     vape, but its catalogue is a cannabis headshop. Sampled 1,500 of
     ~5,000 products: 958 are bongs, pipes, dab rigs, chillums,
     bubblers and grinders; 89 are vape-related and those are dry-herb
     vaporiser parts. Top vendors are Empire Glassworks, Honeybee Herb,
     Pulsar, GRAV and RYOT — and RYOT is already recorded in the
     operator notes as belonging on Legal-Leaf.

     Enabling it would file 269 bongs under Devices & Pods. The 365-day
     cookie is genuinely the best window available to you; it is just
     worth that much on LEGAL-LEAF, not here.
  // { key:'smokecartel', name:'Smoke Cartel', dept:'device', domain:'smokecartel.com',
  //   ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:77378, feedId:0 },
  */

  { key:'relxglobal', name:'RELX', dept:'device', domain:'relxnow.com',
    ref:'', ships:['US','INTL'], guess:1, platform:'feedcsv', awin:82289, feedId:0,
    from:'CN', ageCheck:'dob' },
    // 100% approval. Replaces RELX UK's 1% for US traffic — once this
    // proves out, consider geo-gating relxuk to UK-only placements.
  { key:'fruitia', name:'FRUITIA', dept:'liquid', domain:'fruitia.shop',
    ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:108248, feedId:0,
    from:'US' },                                                                // 20%, 60-day
  { key:'kindjuice', name:'Kind Juice', dept:'liquid', domain:'www.kindjuice.com',
    ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:89381, feedId:0,
    from:'US' },                                                                // 10%, 90-day, organic/PG-free
  { key:'humidors', name:'1st Class Humidors', dept:'gear', domain:'www.1stclasshumidors.com',
    ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:105497, feedId:0,
    from:'US' },                                                                // 90-day, fills the gear gap beside XIFEI
  { key:'bnbtobacco', name:'BnB Tobacco', dept:'cigar', domain:'www.bnbtobacco.com',
    ref:'', ships:['US'], guess:1, platform:'feedcsv', awin:87969, feedId:0,
    from:'US' },                                                                // 100% approval, 8.5% conversion
  //
  // No AWIN feed — scrape it like any other Shopify store:
  // { key:'vapejuicedepot', name:'Vape Juice Depot', dept:'liquid', domain:'vapejuicedepot.com',
  //   ref:'', ships:['US'], guess:1, platform:'shopify', awin:96141 },              // 10%, 90-day
]

/* Only these fields ever reach a browser.

   `click` is the affiliate wrapper as a `{url}` template (see
   affTemplate). It is public by construction — every one of these ids
   rides in plain sight on every outbound link — while the commission
   notes, the AWIN feed ids and the network name stay here. */
function publicStores() {
  return STORES.filter(s => !s.pending).map(s => ({
    key: s.key, name: s.name, dept: s.dept, domain: s.domain,
    ref: s.ref, click: affTemplate(s), ships: s.ships,
    only: s.only || null, guess: s.guess ? 1 : 0,
    from: s.from || '', days: s.days || '', ageCheck: s.ageCheck || '',
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
function classify(st, blob, name) {
  const t = String(blob || '').toLowerCase()
  /* title + variant only — the structural decisions below use this, not
     `t`, wherever a description could plausibly lie about what a thing is */
  const n = String(name || '').toLowerCase()
  /* UNAMBIGUOUS CIGAR WORDS GO FIRST, because the pouch rule below
     matches the bare word "pouches" — and that matches PACKAGING, not
     product. Cigarillos ship in resealable foil pouches, so BnB
     Tobacco's "Good Times Diamond Cigarillos", whose own description
     mentions its pouch, classified as a nicotine pouch, was then priced
     against the 20-per-can default, and $11.99 became $0.013 per pouch
     — the cheapest pouch on the site, and the number in the homepage
     headline.

     It could not even correct itself further down: \bcigar\b never
     matched "cigarillo", because the trailing boundary fails on the
     "illo". Fixed in the cigar rule below too.

     Only words a nicotine pouch would never carry are listed here.
     "cigar" itself is NOT one of them — pouch marketing copy says
     "alternative to cigarettes and cigars" often enough to matter — so
     it stays in the later, lower-priority rule. */
  /* ROLLING ACCESSORIES FIRST. Blunt tips, wraps, cones and papers ship
     in resealable pouches and say so in their descriptions, which is the
     other half of how the pouch shelf filled up with things that are not
     pouches. They are accessories, so they go to gear, where the unit is
     flat — a blunt tip priced "per pouch" OR "per stick" is an invented
     number either way. */
  if (/\b(blunt tips?|filter tips?|blunt wraps?|hemp wraps?|rolling papers?|cones?)\b/.test(t)) return 'gear'
  /* BRANDED MERCH IS GEAR. Nearly every store sells a hoodie, and a
     hoodie inherits the store's dept unless something stops it — which
     on a pouch store means a $45 sweatshirt priced per pouch. Black
     Buffalo alone ships 15 of these (hats, flask, sunglasses, tumbler),
     and they carry an EMPTY product_type, so the vendor metadata cannot
     rescue them either. Same defect that put a $199 humidor on the cigar
     shelf at "$199.00 per stick" and created the gear dept.
     Title-only (`n`), because a description mentioning a free t-shirt
     promo must not move a can of pouches onto the gear shelf. */
  if (/\b(hoodie|sweatshirt|t[- ]?shirt|tee shirt|long[- ]sleeved?|windbreaker|jacket|snapback|hats?|beanie|bandana|koozie|tumbler|flask|sunglasses|bottle opener|coaster|lanyard|keychain|sticker pack|decal)\b/.test(n)) return 'gear'
  /* A wrap or a paper is an accessory whatever the brand calls it —
     "Royal Blunts Strawberry Wraps" names no adjacent "blunt wrap", so
     the rule above misses it and it fell through to the cigar shelf.
     Title-only, and \bwraps?\b deliberately cannot match "wrapper",
     which is what every real cigar description calls its leaf. */
  if (/\b(wraps?|rolling papers?)\b/.test(n)) return 'gear'
  /* CIGARETTE TUBES ARE GEAR, NOT CIGARS. "Sago Tubes Blue - King (84mm) /
     200ct Carton" is an empty filter tube for make-your-own smokes: an
     accessory, so a per-stick unit is as invented for it as per-stick was
     for the $199 humidor. A bare "tube" cannot decide the shelf on its own
     -- premium cigars ship in aluminum tubos -- so demand MYO evidence:
     the text says cigarette/filter tubes, or the row is a 100-1000ct
     carton, which no handmade cigar is. (Audit finding N2: the Cigars
     shelf was mostly Sago / Hot Rod / Gambler tube cartons.) */
  if (/\btubes?\b/.test(n) && (/\b(cigarette|filter)\s+tubes?\b/.test(t) || /\b\d{3,4}\s*ct\b|\bcartons?\b/.test(t))) return 'gear'

  if (/\b(cigarillos?|robustos?|churchill|maduro|belicoso|torpedo)\b/.test(t)) return 'cigar'

  /* THE POUCH RULE NEEDS NICOTINE CONTEXT. "pouch"/"pouches" on its own
     is a PACKAGING word and matched against a blob that includes the
     product description, so anything sold in a resealable pouch landed
     on the nicotine-pouch shelf and got divided by 20.

     Positive evidence is required instead: a snus/lozenge word, an
     explicit "nicotine pouch", or the word plus an mg strength — real
     pouches always state their strength, packaging never does.

     Nothing is lost at the pouch stores: st.dept below still catches
     any product whose own text says none of this. */
  if (/\b(snus|lozenges?|mint chew|nicopods?)\b/.test(t)) return 'pouch'
  if (/\b(nicotine|nic|tobacco[- ]free|all[- ]white)[ -]pouch(es)?\b/.test(t)) return 'pouch'
  if (/\bpouch(es)?\b/.test(t) && /\b\d{1,2}\s*mg\b/.test(t)) return 'pouch'

  /* HARDWARE NAMED IN THE TITLE, before anything reads an ml figure.
     `n` is title + variant only — never the description. */
  if (/\b(rta|rda|rdta|atomi[sz]ers?|replacement pods?|empty pods?|pod cartridges?|replacement coils?|coils?|tanks?|box mod|mods?|drip tips?|chargers?)\b/.test(n)) return 'device'

  /* A disposable states its life in puffs. A bare "4K" is not enough on
     its own: "Good Times 4K's Cigarillos" is a cigar line, and that
     pattern was pulling cigarillos and wraps onto the vape shelf. */
  if (/\bdisposable\b/.test(n)) return 'disposable'
  if (/\d{3,6}\s*\+?\s*puffs?\b/.test(n)) return 'disposable'
  if (/\b\d{1,3}k\b/.test(n) && /\b(puffs?|vape|disposable|pod)\b/.test(t)) return 'disposable'

  /* E-LIQUID. The old rule tested `\d+\s*ml` against the whole blob,
     DESCRIPTION INCLUDED — and every pod and tank spec sheet states its
     capacity in ml. That is how 843 Vaporesso rows ("XROS 6") and 380
     Geekvape rows ("ZX RTA") came to be filed as e-liquid: 1,223 devices
     on the wrong shelf, priced per ml against a capacity they hold
     rather than a volume you buy.

     A liquid WORD may come from anywhere, being unambiguous. A bare ml
     figure must be in the TITLE and start at 10ml — bottles start there,
     hardware capacities are almost all below it. */
  if (/\b(e-?liquid|vape juice|shortfill|nic ?salt|salt ?nic|freebase)\b/.test(t) && !/\bdisposable\b/.test(t)) return 'liquid'
  if (/\b\d{2,4}\s*ml\b/.test(n) && !/\b(pods?|tanks?|cartridges?|coils?|kit|atomi[sz]er)\b/.test(n)) return 'liquid'

  if (/\b(humidor|cutter|lighter|ashtray|case|grinder|torch|hygrometer)\b/.test(t)) return 'gear'
  if (/\b(cigars?|cigarillos?|robustos?|toro|churchill|maduro)\b/.test(t)) return 'cigar'
  if (/\b(coil|tank|mod|pod kit|atomiser|atomizer|battery|charger)\b/.test(t)) return 'device'
  return st.dept
}

/* ============================================================
   SUBCATEGORIES — the shelf below the shelf
   ------------------------------------------------------------
   Matched on TITLE + VARIANT only, never the description, for the
   reason above: prose drags products into the wrong drawer, and that
   mistake already cost this catalogue 1,223 misfiled devices and a
   cigarillo at the top of the pouch shelf.

   First match wins and every list ends in a catch-all, so a product
   always lands somewhere nameable instead of a silent "other".
   ============================================================ */
const SUBCATS = {
  pouch: [
    /* caffeine pouches contain NO nicotine — a genuinely different
       product sharing a shelf, and the one most worth separating */
    ['energy',    /\b(caffeine|energy)\b|hype\+|guarana/],
    ['lozenge',   /\blozenges?\b/],
    ['chew',      /\bmint chew\b|chewing tobacco/],
    ['snus',      /\bsnus\b|\bportion\b|l[oö]svikt/],
    ['nicotine',  /./],
  ],
  disposable: [
    ['prefilled', /\bpre-?filled\b|\be-?pods?\b/],
    ['vape',      /./],
  ],
  device: [
    ['coil',      /\bcoils?\b|mesh coil/],
    ['tank',      /\btanks?\b|atomi[sz]ers?|\brta\b|\brda\b|\brdta\b/],
    ['pod',       /\bpods?\b|\bcartridges?\b/],
    ['mod',       /\bmods?\b|\bbatter(y|ies)\b|\d{2,3}\s*w\b/],
    ['accessory', /drip tip|charger|cable|lanyard|\bglass\b|o-?ring|\bcase\b/],
    ['kit',       /./],
  ],
  liquid: [
    ['salt',      /\bnic ?salts?\b|\bsalt ?nic\b|\bsalts?\b/],
    ['shortfill', /\bshortfill\b|short fill|\b(60|100|120|200)\s*ml\b/],
    ['eliquid',   /./],
  ],
  cigar: [
    /* pipe tobacco is sold by WEIGHT, not by the stick — app.js carries
       the matching unit override, without which it renders "per stick" */
    ['pipe',      /\bpipe tobacco\b|\bflake\b|ready ?rubbed/],
    ['rolling',   /cigarette tubes?|filter tubes?|make.your.own|\bmyo\b|rolling tobacco/],
    ['cigarillo', /\bcigarillos?\b|\blittle cigars?\b|\bsmall cigars?\b|\bfiltered cigars?\b/],
    ['sampler',   /\bsamplers?\b|\bassortment\b|variety pack|gift (pack|set|box)/],
    ['premium',   /./],
  ],
  gear: [
    ['wraps',     /\bwraps?\b|rolling papers?|\bcones?\b|\bblunt\b/],
    ['tubes',     /\btubes?\b/],
    ['lighter',   /\blighters?\b|\btorch\b|butane|jet flame/],
    ['cutter',    /\bcutters?\b|\bpunch\b|guillotine|v-?cut\b/],
    ['humidor',   /humidor|humidif|boveda|hygrometer|\bcedar\b/],
    ['ashtray',   /ashtray/],
    ['case',      /\bcase\b|\bholder\b|\bstand\b|\btravel\b/],
    ['pipe',      /\bpipes?\b|\btamper\b|\breamer\b/],
    ['tool',      /draw enhancer|\bpoker\b|\bneedle\b/],
    ['accessory', /./],
  ],
}

function subclassify(dept, name) {
  const rules = SUBCATS[dept]
  if (!rules) return ''
  const n = String(name || '').toLowerCase()
  for (const [key, rx] of rules) if (rx.test(n)) return key
  return ''
}

/* NOT PRODUCTS. Checkout add-ons, gift cards and "Select 10 for $69.99"
   bundle placeholders were being scraped as catalogue rows — 313 of
   them, including 258 copies of "RELX Shipping Protection". They carry
   prices, so they compete for the cheapest-per-unit badge, and they
   inflate every count on the page. */
/* Black Buffalo's feed carries 36 per-state EXCISE TAX line items and a
   rewards coupon listed at $20.00 — all priced, all therefore eligible for
   the cheapest-per-unit badge, none of them a product. Same failure mode as
   the 258 repeated RELX shipping-protection rows. */
/* Some junk cannot be caught by title at all. Black Buffalo files 42 rows
   as product_type "Fee" — 36 named "<State> Excise Tax" and 6 named only
   "California SET", "Indiana SET - Pouches" and so on, where SET is State
   Excise Tax. No title regex can distinguish "Indiana SET - Pouches" from
   a product without also eating real ones, but the vendor already told us
   what it is. Type-first, exactly like classify(). */
const NONPRODUCT_TYPE = /^(fee|tax|shipping|insurance)$/i

const NONPRODUCT = /shipping protection|shipping insurance|route protect|\bgift ?cards?\b|\begift\b|free gift|\bautoship\b|subscription plan|expired mystery|mystery box|\bdonation\b|^\s*select \d+ for|\bexcise tax\b|rewards coupon|\d+-off\b/i

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

/* FOUR networks, four link shapes. Getting this wrong fails SILENTLY —
   the link works, the customer buys, and the commission is zero.

     GoAffPro / direct   ?ref=<code> appended to the product URL
     AWIN feeds          the feed's aw_deep_link IS the tracked link,
                         so nothing is appended (ref stays empty)
     CJ Affiliate        the destination is WRAPPED, not appended:
                         anrdoezrs.net/click-<PID>-<AID>?url=<encoded>
     Impact.com          wrapped too, but the ids are in the PATH and
                         the destination rides in ?u=:
                         <vanity>.pxf.io/c/<partner>/<ad>/<campaign>?u=

   The wrapping networks are why this is a function rather than a string
   concat. With their ids missing we return the bare URL, and
   scrapeStore() flags the store as unattributed in the refresh report
   rather than pretending.

   ---- ONE AUTHORITY FOR THE LINK SHAPE ---------------------------
   The browser, not this file, builds the link a shopper actually
   clicks: row() drops `aff` and app.js rebuilds it from `url`. So a
   shape known only to this file is a shape that never reaches anybody
   — which is exactly how CJ was set up, and why Nicokick would have
   gone on emitting bare links even after its cjPid was filled in.

   affTemplate() closes that by returning the wrapper as a TEMPLATE
   with a `{url}` hole in it. publicStores() ships the template as
   `click`, app.js substitutes the destination into it, and neither
   side has to know what a pxf.io path looks like. Add a network here
   and the front end picks it up with no matching edit. */
const IMPACT_LINK = /^https:\/\/[a-z0-9.-]+\/c\/\d+\/\d+(?:\/\d+)?\/?$/i

function affTemplate(st) {
  if (st.network === 'impact') {
    /* Paste the WHOLE tracking link Impact issues — there is nothing to
       compose out of parts, and a mis-paste that still looks like a URL
       would send shoppers somewhere we did not choose AND pay nothing.
       So it is validated against the /c/ shape and refused otherwise. */
    const link = String(st.impact || '').trim().replace(/\/+$/, '')
    if (!IMPACT_LINK.test(link)) return ''
    return `${link}?subId1=nicotia&u={url}`
  }
  if (st.network === 'cj') {
    if (!st.cjPid || !st.cjAid) return ''
    return `https://www.anrdoezrs.net/click-${st.cjPid}-${st.cjAid}?sid=nicotia&url={url}`
  }
  return ''
}

function buildAff(st, url) {
  const base = url || `https://${st.domain}/`
  const tpl = affTemplate(st)
  /* encodeURIComponent escapes `$`, so no `$&` can smuggle itself into
     the replacement and rewrite the template. */
  if (tpl) return tpl.replace('{url}', encodeURIComponent(base))
  if (!st.ref) return base
  return base + (base.includes('?') ? '&' : '?') + 'ref=' + st.ref
}

/* Does this store actually earn on a click? Used by the refresh report
   so an unattributed store can never quietly sit in production. */
function isAttributed(st, door) {
  if (st.network) return !!affTemplate(st)
  if (st.platform === 'feedcsv') return door === 'csv feed'
  return !!st.ref
}

/* Rows are built full and serialised slim. JSON.stringify omits
   undefined, so every falsy field simply disappears from the wire
   rather than shipping `"markets":""` on 8,000 rows.

   Dropped entirely and rebuilt in the browser:
     id   = key + '-' + (vid || url)
     aff  = url + '?ref=' + store.ref
   Both are pure functions of data already present, and together they
   were about a third of the payload. */
function row(st, o) {
  const blob = [o.title, o.variant, o.tags, o.desc].filter(Boolean).join(' ')
  const strength = guessStrength(blob)
  const puffs = guessPuffs(blob)
  const desc = cleanDesc(o.desc)
  const variant = o.variant === 'Default Title' ? '' : (o.variant || '')
  const brand = o.brand || st.name
  const cur = o.currency || 'USD'
  /* what the product calls ITSELF, with no marketing copy attached */
  const name = [o.title, variant].filter(Boolean).join(' ')
  /* The store's own category knows better than a regex does. When a
     strategy supplies a dept it wins outright. */
  const dept = o.dept || classify(st, blob, name)
  return {
    k: st.key,
    dept,
    sub: subclassify(dept, name) || undefined,
    brand: brand === st.name ? undefined : brand,   // default = store name
    title: o.title || '',
    variant: variant || undefined,
    strength: strength === '' ? undefined : strength,
    puffs: puffs === '' ? undefined : puffs,
    price: o.price ? String(o.price) : undefined,
    compareAt: o.compareAt ? String(o.compareAt) : undefined,
    oos: o.available === false ? 1 : undefined,     // in stock is the norm
    tobacco: isTobaccoSnus(blob) ? 1 : undefined,
    /* Shopify's product_type, kept verbatim. NOT folded into `blob` — the
       recurring defect in this file is text rules reading a field that
       only looks like the right one, so this stays available for explicit
       decisions and out of the fuzzy matching. */
    ptype: o.ptype || undefined,
    /* Nicotine-free on the VENDOR's authority, never on the title's.
       "Wintergreen ZERO Pouches" is nicotine-free because Black Buffalo
       tags it Nicotine-Free, not because it says ZERO — plenty of brands
       use ZERO for zero sugar, zero tobacco or a flavour name. */
    nic0: /nicotine[\s-]?free/i.test(o.ptype || '') ? 1 : undefined,
    image: sizeImage(o.image) || undefined,
    url: o.url || '',
    cur: cur === 'USD' ? undefined : cur,           // USD is the norm
    desc: desc || undefined,
    vid: o.vid ? String(o.vid) : undefined,
    /* Woo variable products only: the parent to add against and the
       attribute pairs that identify which variation. Absent on simple
       products and on every Shopify row. */
    pid: o.pid ? String(o.pid) : undefined,
    attrs: o.attrs || undefined,
    markets: o.markets || undefined,
  }
}

/* ============================================================
   TIME BUDGET
   ------------------------------------------------------------
   A serverless function is killed at maxDuration with no warning and
   no partial result — unlike Apps Script, which was resumable across
   6-minute chunks and picked up where it stopped. So every loop that
   could run long checks the clock and returns what it already has.

   Partial data beats a 504. A store that yields 40 of its 200
   products still renders; a timed-out function renders nothing for
   ANY store, because they all share the one invocation.
   ============================================================ */
let DEADLINE = Infinity
const outOfTime = (margin = 0) => Date.now() > DEADLINE - margin

/* Small concurrency pool. Categories run in parallel, but not all at
   once — ten simultaneous requests to one shop is how you get rate
   limited by the very store you are trying to read. */
async function pool(items, limit, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      try { out.push(...(await fn(items[idx]))) } catch { /* one category failing is not fatal */ }
    }
  }))
  return out
}

/* ============================================================
   FETCH
   ============================================================ */
/* Never fetch a URL carrying an affiliate/tracking parameter. A feed's
   aw_deep_link IS a tracked link, and it now lands in every feedcsv
   row's `url` — so if any strategy ever followed one, the scraper would
   register phantom clicks in the merchant's dashboard on every refresh.
   That corrupts the attribution data we get paid on AND makes a real
   attribution outage impossible to diagnose. Enforced here rather than
   trusted to every call site. Borrowed from Legal-Leaf. */
const TRACKING_PARAM = /[?&](?:ref|rfsn|sca_ref|awinaffid|awinmid|irclickid|cjevent|sscid)=/i

/* A param is not the only tell. Impact and CJ carry their ids in the
   PATH — /c/<partner>/<ad>/<campaign> and /click-<pid>-<aid> — and the
   click registers on the redirect itself, before any param exists. A
   URL like that is unreachable from a scrape today, but the guard above
   is deliberately enforced here rather than trusted to call sites, and
   half a guard is worse than none: it reads as covered. */
const TRACKING_PATH = /\/(?:c\/\d+\/\d+(?:\/\d+)?|click-\d+-\d+)(?:[/?#]|$)/i

async function get(url, ms = 12000) {
  if (TRACKING_PARAM.test(String(url)) || TRACKING_PATH.test(String(url))) {
    throw new Error('refusing to fetch a tracking URL')
  }
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
/* ---- brand, when the vendor field is useless ----
   Shopify's `vendor` is supposed to be the manufacturer. Plenty of
   stores set it to themselves instead: 1,218 of Europesnus's 1,250
   products carry vendor "Europesnus.com".

   That is not cosmetic. Rows without a variant group BY BRAND, so one
   worthless vendor value collapsed the entire store into a single card
   holding 1,218 products — the giant-card failure the old MAX_FLAV
   hack used to hide, which surfaced the moment that hack was removed.

   The brand is in the title: "Pablo Silver Edition Blue Raspberry",
   "Iceberg Watermelon 50mg". Taking the leading token yields 110 real
   brands for Europesnus — Iceberg 133, Velo 51, Fedrs 50, Pablo 43,
   Zyn 40 — instead of one. */
/* PRODUCT LINES, NOT JUST BRANDS.

   brandFrom() takes the title's leading token, so "Zyn Ultra Wintergreen
   Blast" and "Zyn Cool Mint" both became brand "Zyn" and collapsed onto
   ONE card — despite Ultra being a different format at a different
   strength. Same for Pablo's Exclusive/Gold/Silver lines, Cuba's
   Black/White lines, and the rest.

   This is an EXPLICIT list, deliberately. A generic "take two words"
   rule would read "Zyn Nicotine Pouches Menthol" as a line called "Zyn
   Nicotine" and "Iceberg Watermelon Mint" as one called "Iceberg
   Watermelon" — the second word is a descriptor or a flavour far more
   often than it is a line. Every entry below was read off the live
   catalogue.

   LONGEST FIRST: alternation is first-match, so "cuba blackline" has to
   precede "cuba black" or it would match "cuba black" and strand "line". */
const MULTIWORD = new RegExp('^(' + [
  /* multi-word brands */
  "juice head", "zeo universe", "white fox", "killa switch", "snus o'?clock",
  "ice energy", "loop mix", "nic nac", "kelly white", "lucy breakers",
  /* product lines within a brand */
  "zyn ultra",
  "velo plus",
  "pablo exclusive", "pablo gold", "pablo silver",
  "cuba blackline", "cuba whiteline", "cuba black", "cuba white", "cuba ninja",
  "fedrs energy", "fedrs ice",
  "kurwa fatality", "kurwa collection",
  "iceberg energy",
  "killa exclusive",
  "rogue max",
  "garant extreme",
  "aroma essence", "aroma attention",
  "ace x",
].join('|') + ')', 'i')

const normName = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '')

/* Every shop name and domain in the registry, normalised. Built once. */
let STORE_WORDS = null
function storeWords() {
  if (STORE_WORDS) return STORE_WORDS
  STORE_WORDS = new Set()
  for (const s of STORES) {
    if (s.name) STORE_WORDS.add(normName(s.name))
    if (s.domain) {
      STORE_WORDS.add(normName(s.domain))
      STORE_WORDS.add(normName(String(s.domain).replace(/^www\./, '').split('.')[0]))
    }
  }
  return STORE_WORDS
}

/* A vendor is useless when it names a SHOP rather than a manufacturer.
   This originally caught only the store scraping ITSELF, which missed
   resellers. Europesnus stocks NikoPouches.dk items whose vendor field
   is literally "NikoPouches.dk"; because a row with no variant groups
   by brand, and app.js promotes brand to the card title, those cards
   rendered with the headline "NikoPouches.dk" over a store pill reading
   "Europesnus" — the title/store mismatch seen on the live shelf.

   So: reject a vendor matching ANY store in the registry, not just this
   one, and reject anything shaped like a bare domain.

   This is safe where a shop is also a genuine brand (Geekvape,
   Vaporesso, XIFEI): the fallback takes the title's leading token,
   which for "Geekvape Aegis Legend 3" is "Geekvape" again. The change
   only bites when the vendor names a shop that ISN'T in the title. */
const DOMAINISH = /^[a-z0-9-]+\.(com|co\.uk|net|org|shop|store|dk|se|no|fi|de|nl|fr|es|it|eu|uk|us)$/i

function looksLikeStore(vendor, st) {
  if (!vendor) return true
  const v = normName(vendor)
  if (!v) return true
  if (DOMAINISH.test(String(vendor).trim())) return true
  if (v === normName(st.name)) return true
  if (st.domain && (v === normName(st.domain) ||
      v === normName(String(st.domain).replace(/^www\./, '').split('.')[0]))) return true
  return storeWords().has(v)
}

function brandFrom(st, vendor, title) {
  if (!looksLikeStore(vendor, st)) return vendor
  const name = String(title || '').trim()
  const multi = name.match(MULTIWORD)
  if (multi) return multi[0]
  const m = name.match(/^([A-Za-z][\w'&!-]*)/)
  return m ? m[1] : ''
}

/* Shopify's products.json carries NO currency field, so every Shopify
   store was defaulting to USD — Snus O'Clock priced in GBP and
   Europesnus in EUR both rendered with a dollar sign, and the cart
   summed them as if they were the same money.

   /meta.json is public on every Shopify storefront and returns the
   shop's currency. One request per store, cached for the instance. */
const SHOP_CUR = new Map()
async function shopifyCurrency(st) {
  if (st.currency) return st.currency
  if (SHOP_CUR.has(st.key)) return SHOP_CUR.get(st.key)
  let cur = 'USD'
  try {
    const r = await get(`https://${st.domain}/meta.json`, 6000)
    if (r.ok) {
      const m = await r.json()
      if (m && typeof m.currency === 'string' && m.currency.length === 3) cur = m.currency
    }
  } catch { /* fall back to USD */ }
  SHOP_CUR.set(st.key, cur)
  return cur
}

async function shopifyProducts(st) {
  const currency = await shopifyCurrency(st)
  const out = []
  for (let page = 1; page <= 10; page++) {
    if (outOfTime(4000)) break
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
          brand: brandFrom(st, pr.vendor, pr.title), title: pr.title, variant: v.title,
          ptype: pr.product_type,
          tags: Array.isArray(pr.tags) ? pr.tags.join(' ') : pr.tags,
          price: v.price, compareAt: v.compare_at_price, currency,
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
  const currency = await shopifyCurrency(st)
  const res = await get(`https://${st.domain}/collections/all/products.json?limit=250`)
  if (!res.ok) throw new Error('collections HTTP ' + res.status)
  const data = await res.json()
  const out = []
  for (const pr of data.products || []) {
    const img = pr.images && pr.images[0] ? pr.images[0].src : ''
    const url = `https://${st.domain}/products/${pr.handle}`
    for (const v of (pr.variants && pr.variants.length ? pr.variants : [{}])) {
      out.push(row(st, {
        brand: brandFrom(st, pr.vendor, pr.title), title: pr.title, variant: v.title,
        ptype: pr.product_type,
        tags: Array.isArray(pr.tags) ? pr.tags.join(' ') : pr.tags,
        price: v.price, compareAt: v.compare_at_price, currency,
        available: v.available !== false, image: img, url,
        desc: pr.body_html, vid: v.id,
      }))
    }
  }
  if (!out.length) throw new Error('collections returned nothing')
  return out
}

/* ---- WooCommerce Store API ----
   Public and unauthenticated on most Woo shops. Two sweeps, not one:

   `/products` returns PARENTS. For a variable product that parent is
   not purchasable — it carries has_options:true and the storefront
   shows "Select options", not "Add to cart". Listing it was producing
   a card whose checkout silently failed, because Woo cannot add a
   variable product by parent id: ?add-to-cart=8064 just bounces back
   to the product page.

   `/products?type=variation` returns the real, buyable rows — each
   with its own price, its own flavour image, its own stock, its own
   add-to-cart id, and a ready-made `variation` string ("Flavor: White
   Gummy"). Wave Vape: 40 parents hiding 132 variations. EightVape:
   1,074 parents hiding 4,925.

   So: keep simple products, DROP variable parents, add every variation. */
function wooPrice(prices, field = 'price') {
  if (!prices || prices[field] == null) return ''
  const div = Math.pow(10, Number(prices.currency_minor_unit ?? 2))
  return (Number(prices[field]) / div).toFixed(2)
}

/* Route a Woo product onto a shelf using the store's own category
   slugs. This is what deptMap was written for — it just used to be fed
   by the category walk. `categories[].slug` from the API does the same
   job without scraping a single page. */
function wooDept(st, p) {
  if (!st.deptMap) return undefined
  for (const c of p.categories || []) {
    if (st.deptMap[c.slug]) return st.deptMap[c.slug]
  }
  return undefined
}

async function wooSweep(st, type) {
  const out = []
  const qs = type ? `&type=${type}` : ''
  for (let page = 1; page <= 60; page++) {
    if (outOfTime(5000)) break
    const res = await get(`https://${st.domain}/wp-json/wc/store/v1/products?per_page=100&page=${page}${qs}`)
    if (!res.ok) {
      if (page === 1) throw new Error(`woo ${type || 'products'} HTTP ${res.status}`)
      break
    }
    let data
    try { data = await res.json() } catch { if (page === 1) throw new Error('woo API unparseable'); break }
    if (!Array.isArray(data) || !data.length) break
    out.push(...data)
    if (data.length < 100) break
  }
  return out
}

async function wooStoreApi(st) {
  /* Variations FIRST, deliberately. All 18 stores share one wall clock,
     and EightVape's catalogue is ~11 pages of parents followed by ~50
     pages of variations — so the parents ate the budget and the
     variation sweep got nothing, leaving 41 simple products out of
     1,074 + 4,925.

     Variations are the buyable rows; parents only supply brand,
     department and a fallback image. If the clock cuts the parent
     sweep short, a variation degrades to the store's own brand and
     dept rather than disappearing. Losing that is much cheaper than
     losing 4,925 products. */
  const variations = await wooSweep(st, 'variation').catch(() => [])
  const parents = await wooSweep(st, '').catch(() => [])
  if (!parents.length && !variations.length) throw new Error('woo API empty')

  /* parent id -> its own info, so a variation can inherit the bits it
     does not carry (department, brand, and a fallback image) */
  const byId = new Map(parents.map(p => [p.id, p]))
  const out = []

  /* Woo has no vendor field, so everything would land under the store
     name and group into one enormous card. The category IS the brand
     on these shops — Wave Vape files by Foger / Geek Bar, EightVape by
     the manufacturer — so use the shallowest category as the brand and
     the range groups correctly. */
  /* Woo exposes no vendor field, so the shortest category name is the
     best guess available — and when there are no categories this used to
     return the STORE NAME, which then travelled all the way to the brand
     facet as a pill reading "EightVape 64". A store is not a brand.

     brandFrom() already solves this on the Shopify side: it rejects any
     vendor that names a shop and falls back to the title's leading
     token. Running the guess through it means the store name can never
     survive as a brand again, whichever door the row came in by. */
  const brandOf = (p) => {
    const cats = (p?.categories || []).map(c => c.name).filter(Boolean)
    const guess = cats.length ? cats.reduce((a, b) => (b.length < a.length ? b : a)) : ''
    return brandFrom(st, guess, p?.name)
  }

  for (const p of parents) {
    if (p.type === 'variable' || p.has_options) continue   // not purchasable
    out.push(row(st, {
      brand: brandOf(p), title: p.name, dept: wooDept(st, p),
      tags: (p.categories || []).map(c => c.name).join(' '),
      price: wooPrice(p.prices), compareAt: wooPrice(p.prices, 'regular_price'),
      available: p.is_in_stock !== false,
      image: p.images?.[0]?.src || '', url: p.permalink,
      currency: p.prices?.currency_code || 'USD',
      desc: p.short_description || p.description, vid: p.id,
    }))
  }

  /* WooCommerce will NOT add a variable product from the variation id
     alone — ?add-to-cart=<variation_id> is rejected with "please choose
     product options" and the cart lands empty. It needs the PARENT id,
     plus variation_id, plus every attribute as its own param:

       ?add-to-cart=8064&variation_id=8121&attribute_flavor=White+Gummy

     The variation's own permalink already carries those attribute pairs
     ("…/?attribute_flavor=White+Gummy"), so lift them straight off it
     rather than trying to rebuild them from the attribute list. */
  const attrsFrom = (permalink) => {
    const qi = String(permalink || '').indexOf('?')
    if (qi < 0) return ''
    return String(permalink).slice(qi + 1).split('&')
      .filter(kv => kv.toLowerCase().startsWith('attribute_'))
      .join('&')
  }

  for (const v of variations) {
    const parent = byId.get(v.parent)
    /* "Flavor: White Gummy" -> "White Gummy". Multiple attributes come
       through comma-separated and are kept whole. */
    const label = String(v.variation || '')
      .split(',').map(s => s.split(':').slice(1).join(':').trim() || s.trim())
      .filter(Boolean).join(' · ')
    out.push(row(st, {
      brand: brandOf(parent),
      title: v.name || parent?.name || '',
      variant: label,
      dept: wooDept(st, parent || v),
      tags: [(parent?.categories || []).map(c => c.name).join(' '), label].join(' '),
      price: wooPrice(v.prices), compareAt: wooPrice(v.prices, 'regular_price'),
      available: v.is_in_stock !== false,
      image: v.images?.[0]?.src || parent?.images?.[0]?.src || '',
      url: v.permalink || parent?.permalink,
      currency: v.prices?.currency_code || 'USD',
      /* no desc: a variation inherits its parent's, and carrying 4,925
         copies of the same paragraph is most of the payload */
      vid: v.id,
      pid: v.parent,                       // parent id — Woo adds against this
      attrs: attrsFrom(v.permalink),       // attribute_flavor=White+Gummy
    }))
  }

  if (!out.length) throw new Error('woo API returned no purchasable rows')
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

const MAX_CAT_PAGES = 6   // 6 x ~12 cards is plenty per category

async function wooCategoryWalk(st) {
  const cats = st.cats && st.cats.length ? st.cats.slice() : []
  if (!cats.length) throw new Error('no cats configured for category walk')

  /* `seen` is shared across the pool. Sets are safe here because Node
     is single-threaded — nothing preempts between the has() and the
     add(), so two categories carrying the same product cannot both
     add it. */
  const seen = new Set()

  const out = await pool(cats, 3, async (cat) => {
    /* deptMap routes each category onto the right shelf. EightVape's
       categories span four of ours, so the store's own dept is only a
       fallback for anything unmapped. */
    const dept = (st.deptMap && st.deptMap[cat]) || st.dept
    const rows = []
    for (let page = 1; page <= MAX_CAT_PAGES; page++) {
      if (outOfTime(4000)) break
      const url = `https://${st.domain}/product-category/${cat}/` + (page > 1 ? `page/${page}/` : '')
      let res
      try { res = await get(url, 8000) } catch { break }
      if (!res.ok) break
      const html = await res.text()
      const got = wooCards(st, html, dept, seen)
      rows.push(...got)
      if (!got.length) break
      if (!html.includes(`/page/${page + 1}/`)) break
    }
    return rows
  })

  if (!out.length) throw new Error('category pages returned no cards')
  return out
}

/* ============================================================
   BIGCOMMERCE — Stencil product cards
   ------------------------------------------------------------
   BigCommerce publishes no products.json and, unlike most carts, its
   default Stencil category pages carry NO JSON-LD either — which is
   why Beard Cigars sat at FAILED with "no JSON-LD Product objects
   found" while its /shop-all/ page was serving cards the whole time.

   So parse the cards. The markup is stable and generous:
     <h4 class="card-title"><a href="URL">TITLE</a></h4>
     <span data-product-price-without-tax class="price ...">$X.XX</span>
     <img src="https://cdn11.bigcommerce.com/s-HASH/.../file.jpg">

   Note the rrp and non-sale spans are rendered but style="display:none"
   when empty, so a naive "first price on the card" grab returns blank.
   Anchor on the data- attributes instead of the class names.
   ============================================================ */
async function bigCommerceCards(st) {
  const paths = st.cats && st.cats.length ? st.cats : ['/shop-all/', '/cigars/', '/all/', '/']
  const out = []
  const seen = new Set()

  for (const path of paths) {
    for (let page = 1; page <= 8; page++) {
      if (outOfTime(4000)) break
      const url = `https://${st.domain}${path}` + (page > 1 ? `?page=${page}` : '')
      let res
      try { res = await get(url, 10000) } catch { break }
      if (!res.ok) break
      const html = await res.text()

      const cards = html.split(/<article[^>]*class="[^"]*\bcard\b[^"]*"/i).slice(1)
      if (!cards.length) break
      let added = 0

      for (const card of cards) {
        const t = card.match(/<h4[^>]*class="[^"]*card-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        if (!t) continue
        const link = t[1]
        const title = t[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
          .replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim()
        if (!title || seen.has(link)) continue
        seen.add(link)

        const price = (card.match(/data-product-price-without-tax[^>]*>[^$\d]*\$?\s*([\d,]+\.?\d*)/i) || [])[1] || ''
        const was = (card.match(/data-product-non-sale-price-without-tax[^>]*>[^$\d]*\$?\s*([\d,]+\.?\d*)/i) || [])[1] || ''
        /* strip the srcset size segment so we get a usable resolution
           rather than the 80w thumbnail the lazy-loader starts on */
        let img = (card.match(/<img[^>]+src="(https:\/\/cdn11\.bigcommerce\.com[^"]+)"/i) || [])[1] || ''
        if (img) img = img.replace(/\/stencil\/\d+w\//, '/stencil/500x659/')

        out.push(row(st, {
          brand: st.name, title, tags: title,
          price: price.replace(/,/g, ''),
          compareAt: was && Number(was.replace(/,/g, '')) > Number(price.replace(/,/g, ''))
            ? was.replace(/,/g, '') : '',
          available: !/out[- ]of[- ]stock|sold[- ]out/i.test(card),
          image: img, url: link, currency: st.currency || 'USD',
        }))
        added++
      }
      if (!added) break
      if (!/rel="next"|\?page=/.test(html)) break
    }
    if (out.length) break     // first productive path wins
  }
  if (!out.length) throw new Error('no BigCommerce cards parsed')
  return out
}

/* ============================================================
   MAGENTO 2 — public GraphQL
   ------------------------------------------------------------
   Magento 2 ships a GraphQL endpoint at /graphql that is public by
   design: the storefront itself runs on it. That makes it the cleanest
   door of any platform here — real pagination, real stock status,
   regular AND final price, and the category tree to route departments.

   Nicokick runs this, and it is how the site finally gets US pouches.
   ZYN, on!, VELO and Rogue are owned by Swedish Match, Altria, BAT and
   Turning Point, none of which run affiliate programmes — so the only
   way to reach that inventory is through a retailer who does.

   Note Magento's filter quirk: `price:{from:"0"}` matches NOTHING, so
   filtering by category_uid is the reliable way to walk a catalogue.
   ============================================================ */
/* Brand decides the card. Items with no variant group BY BRAND, so a
   miss here scatters a range into loose cards instead of one ZYN card
   with 54 flavours in the dropdown.

   Magento tags a product with every category it appears in, mixing
   merchandising buckets ("Offers", "Advent"), flavour shelves ("Mint",
   "Citrus") and the actual brand. Strip the first two and the most
   specific survivor is the brand; if nothing survives, the leading
   token of the title is — Nicokick titles all start with it.
   Measured across all 409 pouches: 17 brands, 100% assigned. */
const MAGENTO_GENERIC = /nicotine pouch|nicokick|offers?|acquisition|learn more|explore |powerstep|christmas|advent|metal nicotine|alternative nicotine|limited|mixpack|all products|all-non|bestseller|multipack|specials|better together|shop|^new$|^sale$/i
const MAGENTO_FLAVOUR = /^(mint|wintergreen|spearmint|peppermint|menthol|citrus|coffee|berry|fruits?|flavou?rs?|cinnamon|apple|cherry|mango|melon|tropical|vanilla|smooth|bold|cool|ice|unflavou?red|sweet|sour)$/i

/* The only brands here that are genuinely two words. Everything else is
   one, so a blind "take two capitalised tokens" turns "FRE Wintergreen
   9mg" into its own brand and splits FRE's 58 products across cards. */
const MULTIWORD_BRAND = /^(juice head|zeo universe|white fox|killa switch)/i

function magentoBrand(p) {
  const cats = (p.categories || []).map(c => String(c.name || '').trim())
    .filter(n => n && !MAGENTO_GENERIC.test(n) && !MAGENTO_FLAVOUR.test(n))
  if (cats.length) return cats.reduce((a, b) => (b.length < a.length ? b : a))
  const name = String(p.name || '').trim()
  const multi = name.match(MULTIWORD_BRAND)
  if (multi) return multi[0]
  const m = name.match(/^([A-Za-z][\w'!-]*)/)
  return m ? m[1] : ''
}

async function magentoGraphql(st) {
  const cats = st.cats && st.cats.length ? st.cats : []
  if (!cats.length) throw new Error('magento needs cats (category uids)')

  const suffix = st.urlSuffix === undefined ? '' : st.urlSuffix
  const out = []
  const seen = new Set()

  const query = (uid, page) => `{products(filter:{category_uid:{eq:"${uid}"}},pageSize:100,currentPage:${page}){
    total_count
    items{
      name sku url_key stock_status
      price_range{minimum_price{final_price{value currency} regular_price{value}}}
      image{url}
      categories{name url_key}
    }
  }}`

  for (const uid of cats) {
    const dept = (st.deptMap && st.deptMap[uid]) || st.dept
    for (let page = 1; page <= 12; page++) {
      if (outOfTime(4000)) break
      let res
      try {
        res = await fetch(`https://${st.domain}/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({ query: query(uid, page) }),
        })
      } catch { break }
      if (!res.ok) break
      let j
      try { j = await res.json() } catch { break }
      if (j.errors && j.errors.length && !j.data) {
        throw new Error('graphql: ' + j.errors[0].message)
      }
      const items = j.data?.products?.items || []
      if (!items.length) break

      for (const p of items) {
        if (!p.url_key || seen.has(p.sku || p.url_key)) continue
        seen.add(p.sku || p.url_key)
        const min = p.price_range?.minimum_price
        const price = min?.final_price?.value
        const reg = min?.regular_price?.value
        out.push(row(st, {
          brand: magentoBrand(p),
          title: p.name,
          dept,
          tags: (p.categories || []).map(c => c.name).join(' '),
          price: price != null ? String(price) : '',
          /* only a discount when regular actually exceeds final */
          compareAt: reg != null && price != null && reg > price ? String(reg) : '',
          available: p.stock_status !== 'OUT_OF_STOCK',
          image: p.image?.url || '',
          url: `https://${st.domain}/${p.url_key}${suffix}`,
          currency: min?.final_price?.currency || st.currency || 'USD',
          vid: p.sku,
        }))
      }
      if (items.length < 100) break
    }
  }
  if (!out.length) throw new Error('magento graphql returned no products')
  return out
}

/* ============================================================
   CSV PRODUCT FEEDS (AWIN and anything else that serves a CSV)
   ------------------------------------------------------------
   A feed is strictly better than scraping: no WAF, no rate limit, no
   250-product ceiling, no parser that breaks when a theme updates. It
   is why these programmes were worth chasing.

   Two ways to point a store at one:
     feed:   'https://…'   an explicit URL (any CSV host)
     feedId: 123456        an AWIN feed id, combined with AWIN_API_KEY

   AWIN feed ids are NOT the advertiser ids already in the registry —
   you get them from the AWIN feed list. Keeping them separate so the
   two never get confused.

   The API key is a secret. It lives in an env var and must never be
   committed; without it, feedId stores throw a clear error and the
   ladder falls through rather than silently returning nothing.
   ============================================================ */
function feedUrlFor(st) {
  if (st.feed) return st.feed
  if (!st.feedId) return ''
  const key = process.env.AWIN_API_KEY
  if (!key) throw new Error('AWIN_API_KEY not set — cannot build feed URL')
  /* compression/none so we never have to gunzip in the function; the
     columns list is the union of everything mapCsvRow() looks for. */
  const cols = [
    'aw_deep_link','product_name','merchant_product_id','aw_product_id',
    'merchant_image_url','description','merchant_category','category_name',
    'search_price','store_price','rrp_price','currency','brand_name',
    'in_stock','stock_quantity','merchant_name',
  ].join(',')
  return `https://productdata.awin.com/datafeed/download/apikey/${key}` +
         `/language/en/fid/${st.feedId}/columns/${cols}` +
         `/format/csv/delimiter/%2C/compression/none/adultcontent/1/`
}

/* A real parser, not split(','). Feed descriptions routinely contain
   commas, quoted quotes and embedded newlines — splitting on commas
   shifts every column after the first offending row and silently
   corrupts the whole file. */
function parseCsv(text, delim, maxRows) {
  const rows = []
  let field = '', row = [], q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') { q = true }
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
      if (maxRows && rows.length >= maxRows) return rows
    } else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/* Column names differ per feed and per advertiser's own config, so
   take the first candidate that is actually present and non-empty. */
function pick(rec, ...names) {
  for (const n of names) {
    const v = rec[n]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

async function feedCsv(st) {
  const url = feedUrlFor(st)
  if (!url) throw new Error('no feed or feedId configured')

  const res = await get(url, 25000)
  if (!res.ok) throw new Error('feed HTTP ' + res.status)
  const text = await res.text()
  if (!text || text.length < 40) throw new Error('feed empty')
  if (/^\s*</.test(text)) throw new Error('feed returned HTML — check the API key')

  /* Delimiter sniff on the header line: AWIN can be configured for tab
     or pipe, and guessing comma on a tab feed yields one giant column. */
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || 400)
  const delim = [',', '\t', '|', ';']
    .map(d => [d, firstLine.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0]

  const cap = Number(st.max) || 6000
  const rows = parseCsv(text, delim, cap + 1)
  if (rows.length < 2) throw new Error('feed had no data rows')

  const head = rows[0].map(h => h.replace(/^﻿/, '').trim().toLowerCase())
  const out = []
  for (let i = 1; i < rows.length; i++) {
    if (outOfTime(3000)) break
    const rec = {}
    head.forEach((h, j) => { rec[h] = rows[i][j] })

    const title = pick(rec, 'product_name', 'name', 'title', 'product_short_description')
    /* aw_deep_link is ALREADY the tracked affiliate link — the whole
       point of the feed. Never append ?ref= on top of it; these stores
       carry ref:'' so buildAff() leaves it alone. */
    const link = pick(rec, 'aw_deep_link', 'merchant_deep_link', 'deep_link', 'product_url', 'url')
    if (!title || !link) continue

    const stock = pick(rec, 'in_stock', 'stock_status', 'availability', 'stock_quantity')
    const price = pick(rec, 'search_price', 'store_price', 'price', 'display_price')
    const was = pick(rec, 'rrp_price', 'was_price', 'product_price_old')

    out.push(row(st, {
      brand: pick(rec, 'brand_name', 'brand', 'manufacturer') || st.name,
      title,
      tags: pick(rec, 'merchant_category', 'category_name', 'custom_1'),
      price,
      /* an rrp equal to or below the live price is not a discount */
      compareAt: was && Number(was) > Number(price) ? was : '',
      available: !/^(0|no|false|out of stock|outofstock)$/i.test(stock),
      image: pick(rec, 'merchant_image_url', 'aw_image_url', 'image_url', 'large_image'),
      url: link,
      currency: pick(rec, 'currency') || st.currency || 'USD',
      desc: pick(rec, 'description', 'product_short_description'),
      vid: pick(rec, 'merchant_product_id', 'aw_product_id', 'product_id'),
    }))
  }
  if (!out.length) throw new Error('feed parsed but produced no usable rows')
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
  bigcommerce: [['bc cards', bigCommerceCards], ['json-ld', jsonLd]],
  magento: [['magento graphql', magentoGraphql], ['json-ld', jsonLd]],
  /* A feed store still gets a scrape fallback: if the key is missing or
     AWIN has the feed offline, the storefront is better than nothing. */
  feedcsv: [['csv feed', feedCsv], ['products.json', shopifyProducts],
            ['woo store api', wooStoreApi], ['json-ld', jsonLd]],
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
        const inStock = items.filter(i => !i.oos).length
        const priced = items.filter(i => i.price && Number(i.price) > 0).length
        /* A store with no ref AND no working feed earns nothing: the
           products render, shoppers click, and every sale is
           unattributed. That is worse than not carrying the store,
           and it is invisible from the front end — so say it loudly in
           the refresh report where it will actually be read. */
        let detail = `via ${door} (${inStock}/${items.length} in stock)`
        if (!isAttributed(st, door)) {
          detail += st.network === 'cj'
            ? '  [NO ATTRIBUTION — set cjPid and cjAid from the CJ dashboard or these clicks pay nothing]'
            : st.network === 'impact'
            ? '  [NO ATTRIBUTION — paste the whole Impact tracking link into `impact` or these clicks pay nothing]'
            : st.feedId === 0
            ? '  [NO ATTRIBUTION — feedId is still 0; set it and AWIN_API_KEY or these clicks pay nothing]'
            : '  [NO ATTRIBUTION — no ref and no feed; these clicks pay nothing]'
        }
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

/* Must stay below vercel.json's maxDuration with room to serialise the
   response. If you raise one, raise the other. */
const BUDGET_MS = 45000

/* ---- SHARED CACHE ----------------------------------------------------
   A full scrape of 17 stores measures 41.6s. maxDuration is 60s, so it
   fits, but only just: one slow store tips it over and the visitor gets a
   504. Worse, even when it succeeds, THE FIRST VISITOR WAITED 42 SECONDS.

   In-memory CACHE only helps a warm instance, and the CDN only helps once
   somebody has already paid. This survives both, so nobody pays: the last
   good payload is written to KV, and a cold instance serves that
   immediately instead of scraping.

   Same store and same env vars as the community board (§11), so wiring
   one turns on the other. With no KV configured every call here no-ops
   and the behaviour is exactly what it was before. */
const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const KV_KEY = 'nm:catalogue:v1'
/* Serve from KV rather than scrape while it is younger than this. Longer
   than TTL on purpose: stale prices beat a spinner, and a background
   refresh replaces them within the minute. */
const KV_MAX_AGE = 6 * 60 * 60 * 1000

async function kvGet() {
  if (!KV_URL || !KV_TOKEN) return null
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', KV_KEY]),
      signal: AbortSignal.timeout(3000),
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j || !j.result) return null
    const box = JSON.parse(j.result)
    if (!box || !box.at || !box.payload) return null
    if (Date.now() - box.at > KV_MAX_AGE) return null
    return box
  } catch { return null }
}

async function kvPut(payload) {
  if (!KV_URL || !KV_TOKEN) return
  try {
    await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      /* EX is seconds. Expiring the key means a catalogue nobody has
         refreshed in a day disappears rather than being served forever. */
      body: JSON.stringify(['SET', KV_KEY,
        JSON.stringify({ at: Date.now(), payload }), 'EX', 60 * 60 * 24]),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* never fail a request because the cache write failed */ }
}

export default async function handler(req, res) {
  const q = req.query || {}
  const fresh = 'refresh' in q

  /* Must go through respond(). Returning CACHE.payload directly meant a
     warm instance ignored ?summary, ?dept and ?debug entirely and shipped
     the whole catalogue every time — which silently defeated the entire
     progressive-load design, because the manifest request WAS the full
     2,950-item payload. */
  if (!fresh && CACHE.payload && Date.now() - CACHE.at < TTL) {
    res.setHeader('X-Cache', 'HIT')
    return respond(res, CACHE.payload, q)
  }

  /* Cold instance. Ask the shared cache BEFORE scraping. This is the step
     that stops a first-time visitor waiting 42 seconds. */
  if (!fresh) {
    const box = await kvGet()
    if (box) {
      CACHE = { at: box.at, payload: box.payload }
      res.setHeader('X-Cache', 'KV')
      res.setHeader('X-Cache-Age', String(Math.round((Date.now() - box.at) / 1000)))
      return respond(res, box.payload, q)
    }
  }

  DEADLINE = Date.now() + BUDGET_MS
  const active = STORES.filter(s => !s.pending)

  /* The whole point of leaving Apps Script: every store at once,
     instead of serial fetches on a 6-minute execution clock. */
  const results = await Promise.all(active.map(st =>
    scrapeStore(st).catch(e => ({ key: st.key, result: 'FAILED', count: 0, detail: e.message, items: [] }))
  ))

  /* Drop the checkout add-ons, gift cards and bundle placeholders here
     rather than in each strategy — one gate, and every door goes
     through it. See NONPRODUCT: 313 rows, 258 of them one shipping-
     protection line repeated, all of them carrying a price and so all
     of them eligible for the cheapest-per-unit badge. */
  const scraped = results.flatMap(r => r.items)
  const items = scraped.filter(i => !NONPRODUCT_TYPE.test(i.ptype || '')
    && !NONPRODUCT.test(
    [i.title, i.variant].filter(Boolean).join(' '))
    /* Shopify duplication artifacts: duplicating a product names it
       "<handle>-copy(-N)". RELX published one priced $99.99 flat across
       every variant next to the real $4.30 listing, so the phantom row
       both polluted per-pouch ranking and read as a 23x price spread on
       the same product. A live "-copy" handle is a store-side mistake by
       construction; drop it at the same gate as the other non-products. */
    && !/-copy(?:-\d+)?$/.test(String(i.url || '').split('?')[0]))
  const dropped = scraped.length - items.length

  const meta = results.map(({ key, result, count, detail }) => ({ key, result, count, detail }))

  const truncated = outOfTime()
  const payload = {
    ok: true,
    stores: publicStores(),
    meta,
    count: items.length,
    truncated,
    dropped,
    byDept: items.reduce((a, i) => { a[i.dept] = (a[i.dept] || 0) + 1; return a }, {}),
    /* per-shelf subcategory counts, so ?debug shows the tree without
       having to pull 7MB of rows to count them by hand */
    bySub: items.reduce((a, i) => {
      const k = i.dept + '/' + (i.sub || '—')
      a[k] = (a[k] || 0) + 1; return a
    }, {}),
    updated: new Date().toISOString(),
    items,
  }

  /* Don't sit on a short read for the full half hour. If the clock cut
     the scrape short, cache it briefly so the next visitor triggers a
     retry rather than inheriting the gap. */
  CACHE = { at: truncated ? Date.now() - (TTL - 3 * 60 * 1000) : Date.now(), payload }

  /* Publish for every future cold instance, so this 42-second scrape is
     the last one any visitor waits on. Only a complete read is worth
     sharing: caching a truncated catalogue would hand everyone else the
     gap this instance happened to hit. Awaited rather than fired and
     forgotten, because a serverless function is frozen the moment the
     response is sent and an unawaited write would simply never land. */
  if (!truncated && items.length) await kvPut(payload)

  res.setHeader('X-Cache', fresh ? 'BYPASS' : 'MISS')
  if (truncated) res.setHeader('X-Scrape', 'truncated')
  return respond(res, payload, q)
}

/* ============================================================
   RESPONSE MODES
   ------------------------------------------------------------
   The catalogue is scraped once and sliced on the way out, so a
   department request costs no extra fetching — only less JSON.

     ?summary        manifest only: stores, per-dept counts, meta.
                     A few KB. The page renders its chrome from this
                     while the products are still in flight.
     ?dept=pouch     one shelf
     (nothing)       everything
     ?debug          human-readable per-store report
   ============================================================ */
function manifest(p) {
  const { items, ...rest } = p
  return rest
}

function respond(res, payload, q) {
  if ('debug' in q) {
    /* Hand-built rather than spread, so anything added to the payload has
       to be added HERE too or it silently will not show. bySub and
       dropped were missing for exactly that reason, and their absence
       read as "the subcategory work never deployed" when it had. */
    return res.status(200).json({
      ok: true, updated: payload.updated, total: payload.count,
      truncated: payload.truncated,
      dropped: payload.dropped,
      byDept: payload.byDept,
      bySub: payload.bySub,
      stores: payload.meta.map(m => `${m.key}: ${m.result} (${m.count}) — ${m.detail}`),
    })
  }
  if ('summary' in q) return res.status(200).json(manifest(payload))
  if (q.dept && q.dept !== 'all') {
    const want = String(q.dept)
    return res.status(200).json({
      ...manifest(payload),
      dept: want,
      items: payload.items.filter(i => i.dept === want),
    })
  }
  return res.status(200).json(payload)
}
