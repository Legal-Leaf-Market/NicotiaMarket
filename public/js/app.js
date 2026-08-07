
/* ============================================================
   CONFIG
   ============================================================ */
/* Everything configurable lives in config.js, which loads first. These
   fallbacks only apply if that file failed to load. */
var CFG = window.NM_CONFIG || {};
var API_URL = CFG.apiUrl || '/api/products';
var PREVIEW_MODE = CFG.previewMode !== false;
var SHOW_ALL = PREVIEW_MODE;

/* ---------- persistence ----------
   Must come before ANY caller: MEM has to exist before the first
   read_(). Cookie, then localStorage, then memory — Apps Script serves
   inside a googleusercontent iframe where third-party cookies are often
   blocked, so the layered approach covers both hosting setups. */
var MEM={};
function store_(k,v){
  try{ var d=new Date(); d.setTime(d.getTime()+30*864e5);
       document.cookie=k+'='+encodeURIComponent(v)+';expires='+d.toUTCString()+
                       ';path=/;SameSite=Lax'; }catch(e){}
  try{ localStorage.setItem(k,v); }catch(e){}
  MEM[k]=v;
}
function read_(k){
  try{ var m=document.cookie.match(new RegExp('(^|; )'+k+'=([^;]*)'));
       if(m) return decodeURIComponent(m[2]); }catch(e){}
  try{ var v=localStorage.getItem(k); if(v) return v; }catch(e){}
  try{ return MEM[k]||null; }catch(e){ return null; }
}

/* ============================================================
   DEPARTMENTS
   ------------------------------------------------------------
   Six shelves, each with a unit a shopper can actually compare on.

   The old four collapsed every vape into "Vape Hardware" priced
   `flat` — no unit at all — which meant the one thing this site
   exists to do did not happen on what is now the biggest category.
   A Foger Switch Pro 30K at $16.99 is $0.57 per 1,000 puffs. A Geek
   Bar Mate 60K at $19.99 is $0.33. That is a 42% difference and it
   is invisible on the shelf price. Same trick as price-per-pouch,
   applied where it matters most.

   `gear` exists because a $200 humidor filed under Cigars was being
   priced "per stick" — parseCount found nothing, fell back to 1, and
   rendered $200.00 per stick. Accessories have no honest unit, so
   they get a shelf where none is claimed.
   ============================================================ */
var NIC_WARN = '<b>Warning:</b> This product contains nicotine. Nicotine is an addictive chemical.';
var DEPTS = {
  pouch:      {label:'Pouches & Snus', unit:'pouch', unitLabel:'per pouch',
               accent:'var(--pouch)', warn:NIC_WARN},
  disposable: {label:'Disposables',    unit:'puff',  unitLabel:'per 1k puffs',
               accent:'var(--disposable)', warn:NIC_WARN},
  device:     {label:'Devices & Pods', unit:'flat',  unitLabel:'',
               accent:'var(--device)', warn:NIC_WARN},
  liquid:     {label:'E-Liquid',       unit:'ml',    unitLabel:'per ml',
               accent:'var(--liquid)', warn:NIC_WARN},
  cigar:      {label:'Cigars',         unit:'stick', unitLabel:'per stick',
               accent:'var(--cigar)',
               warn:'<b>Cigar smoking</b> can cause cancers of the mouth and throat, even if you do not inhale. <em>Shown voluntarily — federal cigar warning rules were vacated and are not enforced.</em>'},
  gear:       {label:'Gear & Accessories', unit:'flat', unitLabel:'',
               accent:'var(--gear)',
               warn:'<b>Accessories.</b> Age 21+ still applies. Items containing nicotine are on the other shelves.'}
};
var DEPT_ORDER = ['pouch','disposable','device','liquid','cigar','gear'];
var ALLWARN = '<b>Warning:</b> Nicotine is addictive. Cigar smoking causes cancer. Adults 21+ only.';
var EUWARN = {
  pouch:'<b>Warning:</b> This product contains nicotine, which is a highly addictive substance. Not recommended for non-smokers.',
  disposable:'<b>Warning:</b> This product contains nicotine, which is a highly addictive substance. Not recommended for non-smokers.',
  device:'<b>Warning:</b> This product contains nicotine, which is a highly addictive substance. Not recommended for non-smokers.',
  liquid:'<b>Warning:</b> This product contains nicotine, which is a highly addictive substance. Not recommended for non-smokers.',
  cigar:'<b>Smoking</b> seriously harms you and others around you.',
  gear:'<b>Accessories.</b> Age restrictions still apply.'
};
var EUALL = '<b>Warning:</b> Nicotine is a highly addictive substance. Smoking seriously harms you and others. Adults only.';

/* Local law is written about product classes, not our shelf names.
   Vape rules cover disposables, devices and e-liquid alike, so those
   three resolve to one legal class. Without this, `liquid` fell
   through every country table to 'ok' — France banned pouches and we
   would still have shown a French visitor e-liquid rules for nowhere. */
var LEGAL_CLASS = {pouch:'pouch', disposable:'vape', device:'vape',
                   liquid:'vape', cigar:'cigar', gear:'gear'};

/* ---- FALLBACK REGISTRY ----
   `api/products.js` holds the real one and overwrites this at load, via
   publicStores(). This exists only so the page still renders a store
   list when the API is down — which, since the API is the thing that
   currently 500s, is not hypothetical.

   It had drifted badly from the registry:

     - carried `freemax` and `beardedcigar`, both switched OFF upstream
     - missing `nicokick` entirely — the US pouch store, the one with a
       spotlight page in the nav, and the reason PREVIEW_MODE could be
       turned off at all
     - missing `eightvape`
     - **nikopouches had no `only:['DK']`**. Their own terms say "Vi
       leverer ikke til udlandet". storeShipsHere() checks `only` BEFORE
       the zone, so without it every EU shopper was offered a
       Denmark-only shop — the exact fault CLAUDE.md §7b records fixing,
       silently reintroduced whenever the API failed. Now that
       PREVIEW_MODE is false and shipping limits actually bite, this
       stopped being theoretical.
     - no `ageCheck` on any entry, so the cart's age-verification chip —
       §7b's stated mitigation for putting ten vendors behind ten
       identical Buy buttons — rendered blank in the fallback path.
     - no `from`, `days` or `guess` either.

   `featured` is gone: publicStores() never sends it and nothing here
   reads it, so it only ever "worked" while the API was down.

   FIELDS MUST MIRROR publicStores() EXACTLY. Add stores upstream in
   api/products.js, then mirror them here — never only here. */
var STORES = [
  /* --- pouches & snus --- */
  {key:'snusoclock',name:"Snus O'Clock",dept:'pouch',domain:'snusoclock.com',
   ref:'nicotinebaby',ships:['EU'],guess:1,perPack:20,platform:'shopify',
   from:'GB',days:'3–7 days',ageCheck:'none'},
  {key:'europesnus',name:'Europesnus',dept:'pouch',domain:'europesnus.com',
   ref:'rjuntxyu',ships:['EU'],guess:1,perPack:20,platform:'shopify',
   from:'EU',days:'3–5 business days',ageCheck:'none'},
  /* US pouches. `ref` is empty on purpose — attribution is CJ's deep
     link, and a second tracking param would conflict with it. */
  {key:'nicokick',name:'Nicokick',dept:'pouch',domain:'nicokick.com',
   ref:'',ships:['US'],perPack:15,platform:'magento',
   from:'US',days:'2–5 days',ageCheck:'id'},
  /* `only` is narrower than `ships` and is checked first. Do not drop it. */
  {key:'nikopouches',name:'NikoPouches.dk',dept:'pouch',domain:'nikopouches.dk',
   ref:'idtzhxpu',ships:['EU'],only:['DK'],perPack:20,platform:'shopify',
   from:'DK',days:'1–3 days',ageCheck:'id'},

  /* --- disposables ---
     Wave Vape's cart is not at /cart/ and its own buttons post to
     /store/?add-to-cart=, which is why cartPath exists. */
  {key:'wavevape',name:'Wave Vape',dept:'disposable',domain:'wavevape.shop',
   ref:'nicotinebaby',ships:['US'],platform:'woocommerce',cartPath:'/store/',
   shipFlat:5.99,shipFree:55,from:'US',days:'3–7 days',ageCheck:'id'},
  {key:'eightvape',name:'EightVape',dept:'disposable',domain:'eightvape.com',
   ref:'',ships:['US'],guess:1,platform:'woocommerce',
   from:'US',days:'3–8 days',ageCheck:'signature'},

  /* --- devices --- */
  {key:'vaporesso',name:'Vaporesso',dept:'device',domain:'store.vaporesso.com',
   ref:'nicotinebaby',ships:['US','INTL'],guess:1,platform:'shopify',
   from:'CN',days:'7–30 days',ageCheck:'dob'},
  {key:'geekvape',name:'Geekvape',dept:'device',domain:'store.geekvape.com',
   ref:'nicotinebaby',ships:['US','INTL'],guess:1,platform:'shopify',
   from:'CN',days:'7–21 days',ageCheck:'none'},
  {key:'relxuk',name:'RELX UK',dept:'device',domain:'www.relxvape.co.uk',
   ref:'nicotinebaby',ships:['UK'],platform:'shopify',
   from:'GB',days:'2–4 days',ageCheck:'dob'},
  {key:'relxglobal',name:'RELX',dept:'device',domain:'relxnow.com',
   ref:'',ships:['US','INTL'],guess:1,platform:'feedcsv',from:'CN',ageCheck:'dob'},

  /* --- e-liquid --- */
  {key:'fruitia',name:'FRUITIA',dept:'liquid',domain:'fruitia.shop',
   ref:'',ships:['US'],guess:1,platform:'feedcsv',from:'US'},
  {key:'kindjuice',name:'Kind Juice',dept:'liquid',domain:'www.kindjuice.com',
   ref:'',ships:['US'],guess:1,platform:'feedcsv',from:'US'},

  /* --- cigars --- */
  {key:'montero',name:'Montero Cigars',dept:'cigar',domain:'monterocigars.com',
   ref:'nicotinebaby',ships:['US'],guess:1,platform:'shopify',
   from:'US',days:'2–5 days',ageCheck:'id'},
  {key:'bnbtobacco',name:'BnB Tobacco',dept:'cigar',domain:'www.bnbtobacco.com',
   ref:'',ships:['US'],guess:1,platform:'feedcsv',from:'US'},

  /* --- gear --- */
  {key:'xifei',name:'XIFEI',dept:'gear',domain:'xifeicigaraccessory.com',
   ref:'nicotinebaby',ships:['US','INTL'],guess:1,platform:'shopify',
   from:'CN',days:'3–7 US / 15–30 intl',ageCheck:'none'},
  {key:'humidors',name:'1st Class Humidors',dept:'gear',domain:'www.1stclasshumidors.com',
   ref:'',ships:['US'],guess:1,platform:'feedcsv',from:'US'}
];
var SMAP = {};
STORES.forEach(function(s){ SMAP[s.key]=s; });

/* ============================================================
   WHERE THEY ARE
   ============================================================ */
var US_STATES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',
GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',
NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',
SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
var CA_PROV={AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',
NL:'Newfoundland and Labrador',NS:'Nova Scotia',NT:'Northwest Territories',NU:'Nunavut',
ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',SK:'Saskatchewan',YT:'Yukon'};

/* Verified Aug 2026. Re-check quarterly — this moves. */
var US_NO_VAPE_SHIPPING=['CA','NY','NJ','MA','UT','VT','ME','AR','RI','NV','SD','HI'];
var US_FLAVOUR_BAN=['FL','NC','WI','VA','TN','AL','LA'];

var COUNTRIES={
  US:{name:'United States',flag:'🇺🇸',zone:'US',sub:'State',list:US_STATES},
  CA:{name:'Canada',       flag:'🇨🇦',zone:'INTL',sub:'Province',list:CA_PROV},
  GB:{name:'United Kingdom',flag:'🇬🇧',zone:'UK'},
  SE:{name:'Sweden',       flag:'🇸🇪',zone:'EU'},
  DK:{name:'Denmark',      flag:'🇩🇰',zone:'EU'},
  DE:{name:'Germany',      flag:'🇩🇪',zone:'EU'},
  FR:{name:'France',       flag:'🇫🇷',zone:'EU'},
  NL:{name:'Netherlands',  flag:'🇳🇱',zone:'EU'},
  BE:{name:'Belgium',      flag:'🇧🇪',zone:'EU'},
  IT:{name:'Italy',        flag:'🇮🇹',zone:'EU'},
  ES:{name:'Spain',        flag:'🇪🇸',zone:'EU'},
  IE:{name:'Ireland',      flag:'🇮🇪',zone:'EU'},
  AT:{name:'Austria',      flag:'🇦🇹',zone:'EU'},
  PL:{name:'Poland',       flag:'🇵🇱',zone:'EU'},
  FI:{name:'Finland',      flag:'🇫🇮',zone:'EU'},
  OTHER:{name:'Somewhere else',flag:'🌍',zone:'INTL'}
};

/* Public law, not store policy. A store saying it ships somewhere does
   not make the product legal to receive there. Keyed by legal class,
   not by department. Verified Aug 2026 — re-check quarterly. */
var LEGAL = {
  US: { pouch:['ok'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  FR: { pouch:['banned','France banned nicotine pouches on 1 April 2026 under Decree n°2025-898. It is the strictest ban in Europe — manufacture, sale, import, possession and use are all prohibited, not just retail. We will not link you to them.'],
        vape:['ok'], cigar:['ok'], gear:['ok'] },
  BE: { pouch:['banned','Belgium banned the sale and distribution of nicotine pouches in October 2023.'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  NL: { pouch:['banned','The Netherlands banned retail sale of nicotine pouches from January 2025.'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  DE: { pouch:['restricted','Germany treats nicotine pouches as an unauthorised novel food, so domestic retail is restricted. Personal import from EU retailers is generally permitted. Check your own position before ordering.'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  DK: { pouch:['restricted','Since April 2026 Denmark caps pouches at 9 mg of nicotine and allows only tobacco and menthol flavours. Anything stronger or fruit-flavoured cannot be sold to you.'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  FI: { pouch:['restricted','Finland allows mint and menthol only, with a maximum of 16.6 mg of nicotine per gram.'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  CA: { pouch:['restricted','Canada authorises only nicotine pouches under 4 mg. Most of what is listed here exceeds that.'], vape:['restricted','Provincial rules vary widely.'], cigar:['ok'], gear:['ok'] },
  AT: { pouch:['restricted','From 2026 Austria sells pouches through licensed tobacconists only, 18+ across the whole country.'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  SE: { pouch:['ok'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  GB: { pouch:['ok'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  IT: { pouch:['ok'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  ES: { pouch:['ok'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  IE: { pouch:['ok'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  PL: { pouch:['ok'], vape:['ok'], cigar:['ok'], gear:['ok'] },
  OTHER:{ pouch:['restricted','Rules differ sharply by country and several ban these outright. Check your local law before ordering.'],
          vape:['restricted','Check your local law before ordering.'], cigar:['ok'], gear:['ok'] }
};

var LOC={country:'',region:''};
function loadLoc(){ try{ var v=JSON.parse(read_('nm_loc')); if(v&&v.country) LOC=v; }catch(e){} }
function saveLoc(){ store_('nm_loc',JSON.stringify(LOC)); }
function hasLoc(){ return !!(LOC.country && (!COUNTRIES[LOC.country] ||
  !COUNTRIES[LOC.country].list || LOC.region)); }
function locLabel(){
  var c=COUNTRIES[LOC.country]; if(!c) return 'Set location';
  var r=(c.list&&LOC.region)?c.list[LOC.region]:'';
  return c.flag+' '+(r?r+', ':'')+(LOC.country==='OTHER'?c.name:LOC.country);
}
function zoneOf(){ var c=COUNTRIES[LOC.country]; return c?c.zone:'US'; }
function minAge(){ var z=zoneOf(); return (z==='UK'||z==='EU') ? 18 : 21; }

/* Region rules sit on top of the country ones. */
function regionBlocks(dept){
  if(LOC.country!=='US'||!LOC.region) return null;
  if(LEGAL_CLASS[dept]==='vape' && US_NO_VAPE_SHIPPING.indexOf(LOC.region)>-1){
    return US_STATES[LOC.region]+' does not permit vape products to be shipped to '+
           'residents, so nothing in this department can reach you.';
  }
  return null;
}
/* Not a block — a caveat, and now actually rendered. It used to be
   defined and never called. */
function regionCaveat(dept){
  if(LOC.country!=='US'||!LOC.region) return null;
  if(LEGAL_CLASS[dept]==='vape' && US_FLAVOUR_BAN.indexOf(LOC.region)>-1){
    return US_STATES[LOC.region]+' bans flavoured vape products statewide. '+
           'Tobacco-flavoured and unflavoured items can still ship; the store '+
           'confirms at checkout.';
  }
  return null;
}
function legalFor(dept){
  var r=regionBlocks(dept); if(r) return ['banned',r];
  var c=LEGAL[LOC.country]||LEGAL.OTHER;
  return c[LEGAL_CLASS[dept]||'gear']||['ok'];
}
function storeShipsHere(st){
  if(!st) return true;
  /* A store can be narrower than its zone. NikoPouches sits in the EU
     zone but its own terms say Denmark only — "Vi leverer ikke til
     udlandet" — while its checkout still offers a 30-country dropdown.
     We were showing it to every EU shopper, which is an order that
     cannot be fulfilled. `only` is checked BEFORE the zone. */
  if(st.only && st.only.length) return st.only.indexOf(LOC.country)>-1;
  if(!st.ships||!st.ships.length) return true;
  var z=zoneOf();
  return st.ships.indexOf(z)>-1 || st.ships.indexOf('INTL')>-1;
}

/* How this store verifies age at ITS OWN checkout. Nicotia's gate is
   ours; this is theirs, and they range from a real identity check to
   nothing at all. Aggregating ten vendors behind ten identical Buy
   buttons implies they are interchangeable on this, and they are not —
   so say which is which, at the point the shopper is about to leave. */
var AGE_CHECK={
  id:       {label:'Verifies ID',        tone:'good',
             detail:'This store checks a government ID or verified identity before it ships.'},
  signature:{label:'Adult signature',    tone:'good',
             detail:'An adult signature and ID are required at the door.'},
  dob:      {label:'Asks date of birth', tone:'soft',
             detail:'This store asks you to state your age. It is not verified.'},
  none:     {label:'No age check',       tone:'warn',
             detail:'This store publishes no age verification at its checkout.'}
};
function ageBadge(st){
  var a=AGE_CHECK[st&&st.ageCheck]; if(!a) return '';
  return '<span class="agechip '+a.tone+'" title="'+esc(a.detail)+'">'+esc(a.label)+'</span>';
}
function itemReaches(v){
  if(!v || !v.markets) return true;
  var m=String(v.markets).split(',');
  if(m.indexOf('INTL')>-1) return true;
  return zoneOf()==='US' ? m.indexOf('US')>-1 : m.indexOf('ROW')>-1;
}

/* Tobacco snus is not a nicotine pouch. TPD2 bans the SALE of tobacco
   snus EU-wide with Sweden the only exception; tobacco-free pouches sit
   outside it. Most snus retailers stock both, so this is per product. */
var SNUS_BRANDS = /(general|siberia|skruf|g[oö]teborgs|rap[eé]|odens?|jakobssons?|thunder|ettan|grov|kronan|catch|kaliber|r[oö]da lacket|knox|granit|probe|mocca)\b/i;
var SNUS_WORDS  = /\b(l[oö]s(e|vikt)?|loose|portion snus|original portion|white portion|moist snuff|chewing tobacco|dipping tobacco|makla)\b/i;
function isTobaccoSnus(it){
  if(typeof it.tobacco === 'boolean') return it.tobacco;   // feed knows best
  var t = [it.title, it.variant, it.brand].filter(Boolean).join(' ');
  if(/tobacco[- ]free|nicotine pouch|all[- ]white/i.test(t)) return false;
  return SNUS_BRANDS.test(t) || SNUS_WORDS.test(t);
}
function snusBlocked(){ return zoneOf()==='EU' && LOC.country!=='SE'; }

/* ============================================================
   HELPERS
   ============================================================ */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var CUR={USD:'$',GBP:'£',EUR:'€',DKK:'kr ',SEK:'kr ',CAD:'CA$',AUD:'A$'};
function money(p,cur){
  var n=Number(p); if(isNaN(n)||!n) return '';
  var c=cur||'USD', s=CUR[c];
  return s ? (s.indexOf('kr')===0 ? n.toFixed(2)+' '+s.trim() : s+n.toFixed(2))
           : n.toFixed(2)+' '+c;
}
function unitFmt(n,cur){
  var s=CUR[cur||'USD']||'';
  var v=n>=1?n.toFixed(2):n.toFixed(3).replace(/0$/,'');
  return s ? (s.indexOf('kr')===0 ? v+' kr' : s+v) : v+' '+(cur||'');
}
/* ============================================================
   FX — the common yardstick
   ------------------------------------------------------------
   The catalogue spans at least four native currencies and until now
   NOTHING converted between them. Two consequences, both shipped:

     - computeBestUnits() keyed its map by dept|currency, so the gold
       "best per pouch" chip was awarded once PER CURRENCY. A 1.40 kr
       pouch (~$0.22) and a EUR 0.05 pouch (~$0.06) both wore it — a
       3.7x spread, and that badge is the entire product.
     - heroStats() did the opposite, and worse: it took a global minimum
       across MIXED currencies with no key at all, comparing bare
       numbers, then stamped the winner's symbol on the result.

   So the two paths disagreed with each other, and both were wrong.

   Display stays native — converting what a store charges you would
   misrepresent the store. Conversion ranks and badges only, which is
   the one place a common yardstick is actually required.

   RATES ARE STATIC AND DATED. An unrated currency returns null and is
   simply not eligible for the global badge, because silently treating
   it as 1:1 with USD is exactly the made-up number the old comment
   here was right to refuse. meta.fx from the API wins when present, so
   a live rate feed needs no front-end change. */
var FX_ASOF='2026-08-06';
var FX_USD={              /* 1 unit of X = N USD. xe.com mid-market. */
  USD:1,
  EUR:1.15219,
  GBP:1.34526,
  DKK:0.15412
  /* SEK, NOK, CAD and AUD appear in CUR but have no rate here yet.
     Items priced in them keep their native unit chip and sit out the
     cross-currency badge race rather than being guessed at. */
};
/* set in received() when the API supplies rates; null until then. `meta`
   is an array of per-store rows, so the feed is read from res.fx or
   res.meta.fx rather than assumed onto it. */
var FXR=null;
function fxTable(){ return (FXR&&FXR.rates)||FX_USD; }
function fxAsOf(){ return (FXR&&FXR.asOf)||FX_ASOF; }

/* value in `cur` -> USD, or null when we have no honest rate for it */
function usdOf(n,cur){
  var v=Number(n); if(isNaN(v)) return null;
  var r=fxTable()[cur||'USD'];
  return (typeof r==='number'&&r>0) ? v*r : null;
}
/* "≈ $0.06" — always USD, always marked approximate */
function usdApprox(n,cur){
  var u=usdOf(n,cur); if(u==null) return '';
  return '≈ $'+(u>=1?u.toFixed(2):u.toFixed(3).replace(/0$/,''));
}
/* the tooltip that makes a cross-currency claim inspectable */
function fxTitle(n,cur){
  if(!cur||cur==='USD') return '';
  var a=usdApprox(n,cur); if(!a) return '';
  return a+' per unit · converted at '+fxAsOf()+' rates';
}

function deptOf(x){
  if(x && x.dept && DEPTS[x.dept]) return x.dept;
  var st=SMAP[x&&x.key]; return (st&&DEPTS[st.dept])?st.dept:'device';
}

var COUNTS=[/(\d+)\s*[- ]?(?:ct|count)\b/i,/(\d+)\s*[- ]?pack\b/i,/pack\s*of\s*(\d+)/i,
  /(\d+)\s*[- ]?(?:cigars?|sticks?)\b/i,/(\d+)\s*[- ]?(?:cans?|tins?|rolls?)\b/i,
  /bundle\s*of\s*(\d+)/i,/box\s*of\s*(\d+)/i];
function parseCount(t){if(!t)return null;for(var i=0;i<COUNTS.length;i++){var m=String(t).match(COUNTS[i]);
  if(m){var n=Number(m[1]); if(n>0&&n<1000)return n;}}return null;}

/* Disposables advertise their life in puffs, and it is right there in
   the title: "Foger Switch Pro Kit 30K", "Geek Bar Mate 60K",
   "15000 Puffs". Both spellings, and the bare 30K form that every
   listing uses. Guard the low end — a "5K" in a model name is real,
   a "2" is not a puff count. */
function parsePuffs(t){
  if(!t) return null;
  var s=String(t);
  var m=s.match(/(\d{1,3}(?:[.,]\d)?)\s*k\b(?!\s*mah)/i);
  if(m){ var k=Number(String(m[1]).replace(',','.')); if(k>=1&&k<=200) return k*1000; }
  m=s.match(/(\d{3,7})\s*(?:\+\s*)?puffs?\b/i);
  if(m){ var n=Number(m[1]); if(n>=300&&n<=200000) return n; }
  return null;
}

/* The mall's actual job: make packs, bundles and big-puff disposables
   comparable. Returns null when a department has no honest unit — the
   card then simply shows no chip, rather than inventing one. */
function unitPrice(it){
  var st=SMAP[it.key]||{}, d=DEPTS[deptOf(it)];
  var price=Number(it.price);
  if(!price||!d||d.unit==='flat') return null;
  var text=[it.title,it.variant].filter(Boolean).join(' ');

  if(d.unit==='ml'){
    var m=text.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
    if(!m) return null;
    var ml=Number(m[1]); if(!ml) return null;
    return {value:price/ml, label:d.unitLabel, count:ml};
  }

  /* per 1,000 puffs. Priced per thousand rather than per puff because
     $0.00057 is not a number anyone can read. */
  if(d.unit==='puff'){
    var puffs=parsePuffs(text) || Number(it.puffs) || null;
    if(!puffs) return null;
    var packs=parseCount(text)||1;
    return {value:price/((puffs*packs)/1000), label:d.unitLabel, count:puffs*packs};
  }

  /* Same packOf() the dropdown label uses. These used to parse the
     title independently, so a "Bundle of 5" could be labelled 5 cans
     while the per-pouch price was computed against 1 — the label and
     the number disagreeing on the same card. */
  var pack=packOf(it);
  if(d.unit==='pouch') return {value:price/(pack.n*(st.perPack||20)),
                               label:d.unitLabel, count:pack.n*(st.perPack||20)};
  if(d.unit==='stick') return {value:price/pack.n, label:d.unitLabel, count:pack.n};
  return null;
}

var SEED = [];   /* run exportSeed() in Apps Script and paste here */

/* ============================================================
   SPOTLIGHT PAGES
   ------------------------------------------------------------
   A store with a deep, coherent range is badly served by being
   scattered through a mixed grid. It gets a page.

   Nicokick's is a deliberate blend: our chassis — dark, Fraunces and
   Jost, the unit chip — carrying THEIR information architecture and
   signature colour. Their site is white/#222 Manrope on teal #2C6777,
   and it is organised brand-first (Brands → ZYN, Rogue, VELO, on!,
   FRE) with strength as the axis underneath. So this page is brand
   shelves in teal, not a flat product dump.

   `accent` recolours the page, so a future spotlight can carry its
   own store's colour without new CSS.
   ============================================================ */
var SPOTLIGHT = {
  nicokick: {
    eyebrow : 'US nicotine pouches',
    headline: 'Every pouch America’s actually buying',
    blurb   : 'ZYN, on!, VELO and Rogue are owned by Swedish Match, Altria, BAT '+
              'and Turning Point, and none of them sell to you directly. Nicokick '+
              'carries all four plus the challengers — and every can here is '+
              'priced per pouch, so a 15-count ZYN and a 20-count VELO finally '+
              'compare.',
    accent  : '#2C6777',            /* Nicokick's own teal */
    accent2 : '#B75C4D',            /* their rust, for the deal line */
    layout  : 'brands',
    usps    : [
      ['Ships from the US',  'Tracked USPS delivery, no international customs wait.'],
      ['ID verified at checkout', 'Nicokick runs a real identity check before it ships. Not a tick-box.'],
      ['Priced per pouch',   'Can counts differ by brand. We divide so the comparison is honest.']
    ],
    off:0, coupon:'', note:'Ships within the US. Adults 21+ only.'
  }
};
function spotlightPrice(it,cfg){
  var now=Number(it.price)||0, was=Number(it.compareAt)||0;
  if(was>now+0.001) return {onSale:true, orig:was, now:now, coupon:''};
  if(cfg.off>0) return {onSale:false, orig:now,
    now:Math.round(now*(1-cfg.off)*100)/100, coupon:cfg.coupon||''};
  return {onSale:false, orig:0, now:now, coupon:cfg.coupon||''};
}

/* ============================================================
   GROUPING — one card per store + brand, options in dropdowns
   ------------------------------------------------------------
   Thousands of rows are mostly the same product at four strengths or
   twenty flavours. Group on store + department + brand, then use
   flavour and strength as cascading dropdowns, the way the stores
   themselves present a range.
   ============================================================ */
var NOISE=[
  /\b\d+(?:\.\d+)?\s*mg\/?g?\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:mg|milligram)s?\b/gi,
  /\bnicotine\s*pouch(?:es)?\b/gi, /\bnikotin\w*\b/gi,
  /\bpouch(?:es)?\b/gi, /\bsnus\b/gi, /\bportion\b/gi,
  /\ball[\s-]?white\b/gi, /\bslim\b/gi, /\bmini\b/gi,
  /\b\d+(?:\.\d+)?\s*ml\b/gi,
  /\b\d{1,3}k\b/gi, /\b\d{3,7}\s*\+?\s*puffs?\b/gi,   /* 30K, 15000 puffs */
  /\bdisposable\s*(?:vape|kit|pod)?\b/gi, /\brechargeable\b/gi,
  /\b\d+\s*[- ]?cans?\s*rolls?\b/gi,
  /\b\d+\s*[- ]?(?:pack|cans?|rolls?|ct|count|pcs?|x)\b/gi,
  /\brolls?\b/gi, /\b(?:buy|shop|online|order)\b/gi,
  /\b(?:uk|usa|us|eu|dk|se)\b/gi, /\btobacco[\s-]?free\b/gi,
  /[\u2013\u2014|,()\[\]]/g
];
var STRENGTH_WORDS=/\b(?:x-?strong|extra\s*strong|super\s*strong|ultra|strong|medium|light|regular|normal|mild)\b/gi;

function flavourOf(brand,title){
  var t=' '+String(title||'')+' ';
  if(brand){
    try{ t=t.replace(new RegExp('\\b'+String(brand).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','ig'),' '); }catch(e){}
  }
  NOISE.forEach(function(re){ t=t.replace(re,' '); });
  t=t.replace(STRENGTH_WORDS,' ');
  return t.replace(/\s+/g,' ').trim();
}
function nk(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }

/* ============================================================
   CANONICAL PACK SIZE
   ------------------------------------------------------------
   Same discipline Legal-Leaf applies to weights: parse the messy text
   into a NUMBER first, then render one house label. Never echo the
   store's own wording into a dropdown.

   Pouches are the clearest case. They ship as a single can or a roll,
   and nothing else — but Snus O'Clock encodes that in the title
   ("Bundle of 5: ZYN 11mg"), sets 93 of 100 variants to "Default
   Title", and uses the variant axis for flavour mixes instead. So the
   shopper was reading whatever fell out. Now every pouch option says
   "1 can" or "5 cans", because that is how they come.

   ONE source of truth: the same count feeds the dropdown label AND
   unitPrice(), so the label and the per-pouch figure can never
   disagree — which they could when each parsed the title separately.
   ============================================================ */
var PACK_RE=[
  /\bbundle\s*of\s*(\d+)/i,
  /\broll\s*of\s*(\d+)/i,
  /\bbox\s*of\s*(\d+)/i,
  /\bpack\s*of\s*(\d+)/i,
  /(\d+)\s*[- ]?can\s*roll\b/i,
  /(\d+)\s*[- ]?(?:cans?|tins?|rolls?)\b/i,
  /(\d+)\s*[- ]?pack\b/i,
  /(\d+)\s*[- ]?(?:ct|count|pcs?)\b/i,
  /(\d+)\s*[- ]?(?:cigars?|sticks?)\b/i
];

/* Returns {n, noun} — how many retail units this row is.
   `n` defaults to 1: a product with no pack wording is a single. */
function packOf(it){
  var text=[it.title,it.variant].filter(Boolean).join(' ');
  /* Strength must never be read as a quantity. "AROMA Essence
     Spearmint 20mg" is one can at 20mg, not twenty of anything, and
     "13.50mg" must not surface a 50. Strip every mg/ml/puff token
     before looking for a count. */
  /* A MINIMUM ORDER QUANTITY IS NOT A PACK SIZE. Snus O'Clock states
     theirs in the title — "ZVOL Citrus Lemon 6mg (minimum 10 cans)" —
     and PACK_RE's "N cans" rule read that 10 as ten cans in the box.
     The row is ONE can you are obliged to buy ten of, so £0.50 was
     divided by 200 pouches instead of 20: £0.0025, which is the
     £0.003 the homepage was headlining while this store's own shelf
     showed £0.03. Strip it, and the two agree.

     minQtyOf() below already reads this exact phrase for the checkout
     hand-off. Two readers, one string — they must not disagree. */
  var safe=text.replace(/\d+(?:\.\d+)?\s*(?:mg|ml|mah)\b/gi,' ')
               .replace(/\b\d{1,3}k\b/gi,' ')
               .replace(/\b\d{3,7}\s*\+?\s*puffs?\b/gi,' ')
               .replace(/\bmin(?:imum)?\.?\s*\d{1,3}\s*(?:cans?|tins?|pcs?|units?|packs?)?/gi,' ');
  var n=null;
  for(var i=0;i<PACK_RE.length;i++){
    var m=safe.match(PACK_RE[i]);
    if(m){ var v=Number(m[1]); if(v>0&&v<1000){ n=v; break; } }
  }
  var d=DEPTS[deptOf(it)]||{};
  var noun = d.unit==='pouch' ? 'can'
           : d.unit==='stick' ? 'cigar'
           : 'pack';
  return {n:n||1, noun:noun, explicit:n!==null};
}

function plural(n,noun){ return n+' '+noun+(n===1?'':'s'); }

/* Minimum order quantity, straight out of the title.
   The checkout audit found Snus O'Clock rejecting hand-offs with
   "Quantity must be in increments of Multiple of 10", and I recorded
   that as unfixable without per-product data no endpoint exposes. It
   turned out the store states it in plain English:

     "ZVOL Citrus Lemon 6mg (minimum 10 cans)"
     "SUPREME 25mg/g (discounted batch) minimum 10 cans"

   So parse it, send that quantity, and say so on the card. Sending 1
   against a 10-can minimum is what produced the dead-end checkout. */
function minQtyOf(text){
  var m=String(text||'').match(/\bmin(?:imum)?\.?\s*(\d{1,3})\s*(?:cans?|tins?|pcs?|units?|pack)?\b/i);
  if(m){ var n=Number(m[1]); if(n>1&&n<=500) return n; }
  return 1;
}

/* The dropdown string. One shape per department, always in the same
   order, so a shopper scanning options compares like with like. */
function optionLabel(it){
  var dept=deptOf(it), d=DEPTS[dept]||{}, bits=[];
  var mg=(it.strength!==''&&it.strength!=null&&!isNaN(Number(it.strength)))
    ? Number(it.strength)+' mg' : '';

  if(dept==='pouch'){
    bits.push(plural(packOf(it).n,'can'));
    if(mg) bits.push(mg);
    if(it.variant && !/^default title$/i.test(it.variant) && !/^\d+(\.\d+)?\s*mg$/i.test(it.variant))
      bits.push(it.variant);
  } else if(dept==='disposable'){
    if(it.variant) bits.push(it.variant);
    var pf=parsePuffs([it.title,it.variant].join(' ')) || Number(it.puffs) || 0;
    if(pf) bits.push((pf>=1000?(pf/1000)+'K':pf)+' puffs');
    if(mg) bits.push(mg);
  } else if(dept==='liquid'){
    var ml=String(it.title||'').match(/(\d+(?:\.\d+)?)\s*ml\b/i);
    if(ml) bits.push(ml[1]+' ml');
    if(mg) bits.push(mg);
    if(it.variant) bits.push(it.variant);
  } else if(dept==='cigar'){
    var p=packOf(it);
    bits.push(p.n===1?'Single':plural(p.n,'cigar'));
    if(it.variant) bits.push(it.variant);
  } else {
    /* devices and gear: the store's own option (a colour, a resistance)
       is already the right words — just tidy the spacing. */
    if(it.variant) bits.push(it.variant);
    if(mg) bits.push(mg);
  }
  if(!bits.length) bits.push('Standard');
  return bits.join(' · ').replace(/\s+/g,' ').trim();
}

/* kept as the old name so nothing else has to change */
function variantLabel(it){ return optionLabel(it); }

/* What the dropdown is FOR, in a word. An unlabelled select was a big
   part of why the old filters read as engineering rather than shopping. */
function optionNoun(dept){
  return dept==='pouch'  ? 'Size'
       : dept==='liquid' ? 'Bottle'
       : dept==='cigar'  ? 'Quantity'
       : dept==='disposable' ? 'Flavour'
       : 'Option';
}

var SELV={};
function loadSelv(){ try{SELV=JSON.parse(read_('nm_selv'))||{};}catch(e){SELV={};}
  if(typeof SELV!=='object'||!SELV) SELV={}; }
function saveSelv(){ store_('nm_selv',JSON.stringify(SELV)); }

/* ONE CARD PER PRODUCT LINE. Thirty flavours of one device is one
   card with thirty entries in the dropdown — never thirty cards.

   Which key groups a line depends on how the store models it:

     variant present  — the store already told us this is one product
                        with options (a Woo variable parent, a Shopify
                        product with variants). Group by TITLE, because
                        every option shares it. Dojo's 30 flavours all
                        carry title "Dojo …" and variant "Grape" etc,
                        so they collapse to one card correctly.

     no variant       — the flavour is baked into the title and each
                        one is its own product row. Group by BRAND, so
                        ZYN Citrus 6mg and ZYN Cool Mint 9mg share a
                        card with flavour and strength as the two axes.

   Mixing both inside one store is fine and expected: Wave Vape sells
   35 flavours as individual products AND the same range as a variable
   parent with 41 variations. */
function groupKeyFor(it){
  var dept=deptOf(it);
  var brand=String(it.brand==null?'':it.brand).trim();
  if(it.variant) return it.key+'|'+dept+'|t:'+nk(it.title);
  return it.key+'|'+dept+'|b:'+nk(brand||it.title);
}

function buildGroups(items){
  var map={};
  /* A mall only lists what ships today. Out of stock is dropped here
     and nowhere else, so nothing downstream can re-admit it. */
  items.forEach(function(it){
    if(!it.available) return;
    var brand=String(it.brand==null?'':it.brand).trim();
    /* the dropdown label: the store's own option name when it has one,
       otherwise whatever distinguishes this title from its siblings */
    var flav=it.variant || flavourOf(brand,it.title) || it.title || '—';
    if(!brand){ brand=flav; flav='—'; }
    var dept=deptOf(it);
    var gid=groupKeyFor(it);
    var g=map[gid]||(map[gid]={gid:gid, key:it.key, dept:dept, brand:brand,
                               line:it.variant?it.title:'',
                               currency:it.currency||'USD', flavours:{}, order:[]});
    var fk=nk(flav);
    if(!g.flavours[fk]){ g.flavours[fk]={name:flav, image:'', variants:[]}; g.order.push(fk); }
    var f=g.flavours[fk];
    if(!f.image&&it.image) f.image=it.image;
    f.variants.push(it);
  });

  var built=Object.keys(map).map(function(k){
    var g=map[k];
    g.flav=g.order.map(function(fk){ return g.flavours[fk]; })
                  .filter(function(f){ return f.variants.length; });
    g.flav.forEach(function(f){
      f.variants.sort(function(a,b){
        var A=Number(a.strength), B=Number(b.strength);
        if(isNaN(A)&&isNaN(B)) return (Number(a.price)||0)-(Number(b.price)||0);
        if(isNaN(A)) return 1; if(isNaN(B)) return -1;
        return A-B || (Number(a.price)||0)-(Number(b.price)||0);
      });
    });
    /* Open every card on its own best value, not on whichever flavour
       happens to sort first. Alphabetical order put Geek Bar's CLR 50K
       ($0.42/1k) in front of the Mate 60K ($0.33/1k) — so the cheapest
       disposable on the site sat behind a closed dropdown and never
       earned the gold chip. Cheapest unit first, name as the tiebreak. */
    g.flav.sort(function(a,b){
      var ua=unitPrice(a.variants[0]), ub=unitPrice(b.variants[0]);
      if(ua&&ub&&ua.value!==ub.value) return ua.value-ub.value;
      if(ua&&!ub) return -1; if(!ua&&ub) return 1;
      return a.name.localeCompare(b.name);
    });
    g.image=(g.flav[0]||{}).image||'';
    /* A line grouped by title shows the product ("Foger Switch Pro 30K
       Disposable Pods"); a line grouped by brand shows the brand
       ("ZYN"), because there the individual titles ARE the options. */
    g.title=g.line||g.brand;
    delete g.flavours; delete g.order;
    return g;
  }).filter(function(g){ return g.flav.length; });

  /* There used to be a MAX_FLAV=10 here that split any group with more
     than ten flavours into one card per flavour — which would have
     turned a 30-flavour range into 30 cards, the exact opposite of the
     point. It existed to stop a brand-owned store collapsing into a
     single card with a 300-entry dropdown, but that was a symptom of
     grouping by brand alone. groupKeyFor() groups by product line now,
     so the range stays one card and the store still shows many. */
  return built;
}

function gsel(g){
  var s=SELV[g.gid]||{};
  var f=parseInt(s.f,10); if(isNaN(f)||f<0||f>=g.flav.length) f=0;
  var vs=g.flav[f].variants;
  var v=parseInt(s.v,10); if(isNaN(v)||v<0||v>=vs.length) v=0;
  return {f:f,v:v};
}
function gitem(g){ var s=gsel(g); return g.flav[s.f].variants[s.v]; }
function gvariants(g){ var out=[]; g.flav.forEach(function(f){
  f.variants.forEach(function(v){out.push(v);}); }); return out; }
function strengthOptions(f,sel){
  return f.variants.map(function(v,i){
    return '<option value="'+i+'"'+(i===sel?' selected':'')+'>'+
      esc(variantLabel(v))+' — '+money(v.price,v.currency)+'</option>';
  }).join('');
}
function strengthList(vars){
  var mg={};
  vars.forEach(function(v){ if(v.strength!==''&&v.strength!=null) mg[v.strength]=1; });
  var k=Object.keys(mg).sort(function(a,b){ return a-b; });
  return k.length ? k.join(', ')+' mg' : '—';
}

/* Re-render every card carrying this gid. querySelector (singular) used
   to update only the FIRST match — and because the rail sits above the
   grid in the DOM, changing a flavour in the grid silently updated the
   rail copy instead. */
function refreshCard(gid){
  var g=null; VIEW.forEach(function(x){ if(x.gid===gid) g=x; });
  if(!g) return;
  var cards=document.querySelectorAll('[data-gid="'+(window.CSS&&CSS.escape?CSS.escape(gid):gid)+'"]');
  if(!cards.length) return;
  var s=gsel(g), f=g.flav[s.f], it=gitem(g), cur=it.currency;
  var u=unitPrice(it), best=isBestUnit(g,u);
  var off=it.compareAt&&Number(it.compareAt)>Number(it.price)
    ? Math.round((1-Number(it.price)/Number(it.compareAt))*100) : 0;

  Array.prototype.forEach.call(cards,function(card){
    /* The photo follows the SELECTED VARIANT, not just the flavour.
       This read f.image only, so changing the strength dropdown never
       changed the picture — and the `&& f.image` guard meant picking a
       flavour with no photo of its own skipped the block entirely and
       left the PREVIOUS flavour's photo on screen, now captioned with
       the newly selected name. Falls back flavour -> group, and clears
       to the placeholder when there is genuinely nothing to show. */
    var shot=card.querySelector('.shot');
    if(shot){
      var src=(it&&it.image)||f.image||g.image||'';
      var img=shot.querySelector('img');
      var alt=g.brand+(f.name&&f.name!=='—'?' '+f.name:'');
      if(src){
        if(img){
          if(img.getAttribute('src')!==src){
            img.style.opacity=0;
            img.onload=function(){ img.style.opacity=1; };
            img.src=src; img.alt=alt;
          }
        }else{
          var ph=shot.querySelector('.shot-empty');
          if(ph) ph.parentNode.removeChild(ph);
          shot.insertAdjacentHTML('afterbegin',
            '<img src="'+esc(src)+'" alt="'+esc(alt)+'" loading="lazy" referrerpolicy="no-referrer">');
        }
      }else if(img){
        img.parentNode.removeChild(img);
        shot.insertAdjacentHTML('afterbegin','<div class="shot-empty">No photo</div>');
      }
    }
    var ssel=card.querySelector('.vsel.str');
    if(ssel) ssel.innerHTML=strengthOptions(f,s.v);
    var pr=card.querySelector('.cprice');
    if(pr) pr.innerHTML=priceHtml(it,cur,off,u,best);
    var buy=card.querySelector('.buy');
    if(buy) buy.textContent='Add to cart — '+(money(it.price,cur)||'see store');
    /* whole back panel, not just the heading — description, unit price,
       puff count and market list are all per-variant */
    var bk=card.querySelector('.backin');
    if(bk) bk.innerHTML=backInnerHtml(g);
  });
}

/* ============================================================
   AGE GATE
   ============================================================ */
var gate=document.getElementById('gate');
var GATE_REENTRY=false;   /* opened from the ship-to pill, so cancellable */
var LOC_BACKUP=null;

function fillCountries(){
  var cs=document.getElementById('gCountry');
  cs.innerHTML='<option value="">Select a country</option>'+
    Object.keys(COUNTRIES).map(function(k){
      return '<option value="'+k+'">'+COUNTRIES[k].flag+' '+COUNTRIES[k].name+'</option>';
    }).join('');
  cs.value=LOC.country||'';
  fillRegions();
}
function fillRegions(){
  var cs=document.getElementById('gCountry'), rs=document.getElementById('gRegion'),
      wrap=document.getElementById('gRegionWrap');
  var c=COUNTRIES[cs.value];
  if(c&&c.list){
    wrap.style.display='';
    rs.innerHTML='<option value="">Select a '+c.sub.toLowerCase()+'</option>'+
      Object.keys(c.list).map(function(k){
        return '<option value="'+k+'">'+c.list[k]+'</option>'; }).join('');
    rs.value=LOC.region||'';
  }else{ wrap.style.display='none'; rs.value=''; }
  gateReady();
}
function gateReady(){
  var cs=document.getElementById('gCountry'), rs=document.getElementById('gRegion');
  var c=COUNTRIES[cs.value];
  var ok=!!cs.value && (!c||!c.list||!!rs.value);
  document.getElementById('gyes').disabled=!ok;
  if(cs.value){ LOC.country=cs.value; LOC.region=(c&&c.list)?rs.value:''; setAgeCopy(); }
}
function openGate(reentry){
  GATE_REENTRY=!!reentry;
  LOC_BACKUP=JSON.parse(JSON.stringify(LOC));
  document.getElementById('gcancel').hidden=!GATE_REENTRY;
  document.getElementById('gno').hidden=!!GATE_REENTRY;
  fillCountries(); gateReady();
  gate.hidden=false; document.body.style.overflow='hidden';
  document.getElementById('gCountry').focus();
}
function closeGate(){ gate.hidden=true; document.body.style.overflow=''; }

document.getElementById('gCountry').addEventListener('change',fillRegions);
document.getElementById('gRegion').addEventListener('change',gateReady);
document.getElementById('gyes').addEventListener('click',function(){
  if(this.disabled) return;
  store_('nm_age','1'); saveLoc(); syncUserLoc();
  closeGate(); locPillUI();
  if(ALL.length){ facets(); apply(); }
});
document.getElementById('gno').addEventListener('click',function(){
  document.getElementById('gdeny').style.display='block';
  document.getElementById('gyes').disabled=true; this.disabled=true;
});
/* Reopening from the ship-to pill has to be escapable. gateReady()
   mutates LOC live, so cancel restores the snapshot. */
document.getElementById('gcancel').addEventListener('click',function(){
  if(LOC_BACKUP) LOC=LOC_BACKUP;
  closeGate(); locPillUI(); setAgeCopy(); setWarn();
});
document.getElementById('locPill').addEventListener('click',function(){ openGate(true); });

function locPillUI(){
  var el=document.getElementById('locVal');
  if(el) el.textContent=locLabel();
  var p=document.getElementById('locPill');
  if(p) p.classList.toggle('unset',!hasLoc());
}
function setAgeCopy(){
  var a=minAge();
  var t=document.getElementById('gt'); if(t) t.innerHTML='Are you <em>'+a+'</em><br>or older?';
  var y=document.getElementById('gyes'); if(y&&!y.disabled) y.textContent="Yes, I'm "+a+'+';
  var s=document.getElementById('gsub');
  if(s) s.textContent='This site sells tobacco and vapour products for adults '+a+
    ' and over who already use them. It is not for anyone under '+a+
    ", and not for people who don't currently use tobacco or nicotine.";
}
/* Tab trap. Filtered to visible controls — the region select is
   display:none for most countries and focusing it silently failed. */
document.addEventListener('keydown',function(e){
  if(gate.hidden) return;
  if(e.key==='Escape'&&GATE_REENTRY){ document.getElementById('gcancel').click(); return; }
  if(e.key!=='Tab') return;
  var f=[].filter.call(gate.querySelectorAll('button:not([disabled]):not([hidden]),select'),
    function(el){ return el.offsetParent!==null; });
  if(!f.length) return;
  var a=f[0],z=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}
  else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}
});
/* Console helper: clears the age answer and location so the gate returns. */
function resetEntry(){
  ['nm_age','nm_loc'].forEach(function(k){
    try{ document.cookie=k+'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; }catch(e){}
    try{ localStorage.removeItem(k); }catch(e){}
    MEM[k]='';
  });
  LOC={country:'',region:''};
  location.reload();
}

/* ============================================================
   STATE
   ============================================================ */
var ALL=[],PGROUPS=[],VIEW=[],PAGE=0,PER=24,GROUPS={},BOARD={};
var CONN='',META=[],SRC={live:0,seeded:0},UPDATED=null;
var BESTUNIT={};   /* dept -> cheapest unit value ON THE SITE, in USD */

var F={q:'',dept:'all',store:'all',brand:'all',strength:'all',price:'all',
       sort:'unit',deals:false,instock:false,stores:{},brands:{}};

/* The gold unit chip means "cheapest on the whole site for this
   department", not "cheapest of this brand" and not "cheapest in this
   currency" — which is what it used to mean, and why a 1.40 kr pouch
   and a EUR 0.05 pouch, 3.7x apart, both wore it. Ranking now happens
   on the common yardstick (see the FX block above).

   Two further defects fixed here:
     - it ignored `available` entirely while renderRail() filters on it,
       so the record could be held by a row no shelf would ever show;
     - isBestUnit() compared the map against the SELECTED variant with
       no availability check of its own.

   A currency with no rate sits the race out rather than being assumed
   1:1 with USD — it keeps its native unit chip, just not the gold one. */
function computeBestUnits(){
  BESTUNIT={};
  PGROUPS.forEach(function(g){
    var d=deptOf(g);
    gvariants(g).forEach(function(v){
      if(!v.available) return;
      var u=unitPrice(v); if(!u) return;
      var usd=usdOf(u.value,v.currency||'USD'); if(usd==null) return;
      if(BESTUNIT[d]==null||usd<BESTUNIT[d]) BESTUNIT[d]=usd;
    });
  });
}
function isBestUnit(g,u){
  if(!u) return false;
  var it=gitem(g);
  if(!it||!it.available) return false;
  var usd=usdOf(u.value,it.currency||'USD'); if(usd==null) return false;
  var b=BESTUNIT[deptOf(g)];
  return b!=null && usd<=b*1.0001;
}

/* Price stays in the store's own currency — that is what they will
   charge. The chip carries the converted value in its tooltip so the
   cross-currency ranking behind the gold badge stays inspectable
   instead of being an assertion. */
function priceHtml(it,cur,off,u,best){
  var p=money(it.price,cur);
  var ttl=u?fxTitle(u.value,cur):'';
  return (p?'<b>'+p+'</b>':'<span class="noprice">Price at store</span>')+
    (off?'<s>'+money(it.compareAt,cur)+'</s>':'')+
    (u?'<span class="unitchip'+(best?' best':'')+'"'+
       (ttl?' title="'+esc(ttl)+'"':'')+'>'+unitFmt(u.value,cur)+
       ' <span class="u">'+esc(u.label)+'</span></span>':'');
}

/* The back of the card is per-VARIANT: the description, unit price,
   puff count and market list all come off the selected row, not off the
   group. refreshCard() only ever rewrote the <h4>, so turning a card
   over after changing a dropdown showed the new variant's title above
   the OLD variant's description and spec table. One renderer now feeds
   both card() and refreshCard(), so they cannot drift again. */
function backInnerHtml(g){
  var st=SMAP[g.key]||{name:g.key,dept:g.dept};
  var d=DEPTS[deptOf(g)]||{};
  var s=gsel(g), f=g.flav[s.f], it=gitem(g), cur=it.currency;
  var u=unitPrice(it), allV=gvariants(g);
  var nFlav=g.flav.length;
  var hasFlav=!g.split && (nFlav>1||(g.flav[0]&&g.flav[0].name!=='—'));
  var peers=GROUPS[nk(g.brand)]||[];
  var nSt={}; peers.forEach(function(x){ nSt[x.key]=1; });
  var nStores=Object.keys(nSt).length||1;
  var desc=String(it.desc==null?'':it.desc).trim();
  var approx=u?usdApprox(u.value,cur):'';

  return '<div class="bstore">'+esc(st.name||g.key)+'</div>'+
    '<h4>'+esc(g.split?g.title:(g.brand+(f.name!=='—'?' '+f.name:'')))+'</h4>'+
    (desc?'<p class="bdesc">'+esc(desc)+'</p>'
         :'<p class="bdesc dim">No description published for this one.</p>')+
    '<dl class="bspec">'+
      '<dt>Department</dt><dd>'+esc(d.label||'—')+'</dd>'+
      '<dt>Brand</dt><dd>'+esc(g.brand)+'</dd>'+
      (hasFlav?'<dt>Flavours</dt><dd>'+nFlav+'</dd>':'')+
      (deptOf(g)==='disposable'&&u?'<dt>Puffs</dt><dd>'+u.count.toLocaleString()+'</dd>'
        :'<dt>Strengths</dt><dd>'+strengthList(allV)+'</dd>')+
      (u?'<dt>Unit price</dt><dd>'+unitFmt(u.value,cur)+' '+esc(u.label)+
         /* the converted figure the badge actually ranked on */
         (approx?'<small class="fxnote">'+esc(approx)+' · '+esc(fxAsOf())+'</small>':'')+
         '</dd>':'')+
      (nStores>1?'<dt>Also at</dt><dd>'+(nStores-1)+' other store'+(nStores>2?'s':'')+'</dd>':'')+
      (it.markets?'<dt>Available in</dt><dd>'+
        esc(String(it.markets).replace('ROW','rest of world').replace('INTL','worldwide').split(',').join(' + '))+
        '</dd>':'')+
    '</dl>';
}

function card(g){
  var st=SMAP[g.key]||{name:g.key,dept:g.dept};
  var d=DEPTS[deptOf(g)]||{};
  var s=gsel(g), f=g.flav[s.f], it=gitem(g), cur=it.currency;
  var u=unitPrice(it), best=isBestUnit(g,u);
  var allV=gvariants(g);
  var nFlav=g.flav.length, nStr=f.variants.length;
  var hasFlav=!g.split && (nFlav>1||(g.flav[0]&&g.flav[0].name!=='—'));
  var peers=GROUPS[nk(g.brand)]||[];
  var nSt={}; peers.forEach(function(x){ nSt[x.key]=1; });
  var nStores=Object.keys(nSt).length||1;
  var off=it.compareAt&&Number(it.compareAt)>Number(it.price)
    ? Math.round((1-Number(it.price)/Number(it.compareAt))*100) : 0;
  var saved=!!BOARD[g.gid];
  var desc=String(it.desc==null?'':it.desc).trim();
  var gid=esc(g.gid);

  var flavOpts=g.flav.map(function(x,i){
    return '<option value="'+i+'"'+(i===s.f?' selected':'')+'>'+
      esc(x.name)+' · '+x.variants.length+' option'+(x.variants.length===1?'':'s')+'</option>';
  }).join('');

  return '<article class="card'+(best?' best':'')+'" data-gid="'+gid+'">'+
   '<div class="card-in">'+
    '<div class="face front" data-turn tabindex="0" role="button" '+
        'aria-label="Show details for '+esc(g.title||g.brand)+'">'+
      '<div class="shot">'+
        (f.image?'<img src="'+esc(f.image)+'" alt="'+esc(g.brand+' '+f.name)+'" loading="lazy" referrerpolicy="no-referrer">'
                :'<div class="shot-empty">No photo</div>')+
        (best?'<span class="badge best">Best '+esc(d.unitLabel||'value')+'</span>'
          : off?'<span class="badge off">-'+off+'%</span>'
          : nStores>1?'<span class="badge multi">'+nStores+' stores</span>'
          : allV.length>1?'<span class="badge multi">'+allV.length+' options</span>':'')+
        '<button class="save'+(saved?' on':'')+'" data-save="'+gid+'" '+
          'aria-label="Save">'+(saved?'★':'☆')+'</button>'+
        '<span class="storepill" style="border-color:'+(d.accent||'var(--line)')+'">'+
          esc(st.name||g.key)+'</span>'+
        (it.available?'':'<span class="oos">Out of stock</span>')+
      '</div>'+
      '<div class="cbody">'+
        '<h3 class="ctitle">'+esc(g.title||g.brand)+'</h3>'+
        '<div class="cselects">'+
          (hasFlav
            ? '<label class="sellabel">Flavour</label>'+
              '<select class="vsel flav" aria-label="Choose flavour" data-flav="'+gid+'">'+flavOpts+'</select>'
            : '')+
          (nStr>1||!hasFlav
            ? '<label class="sellabel">'+esc(optionNoun(deptOf(g)))+'</label>'+
              '<select class="vsel str" aria-label="Choose '+esc(optionNoun(deptOf(g)).toLowerCase())+
              '" data-str="'+gid+'">'+strengthOptions(f,s.v)+'</select>'
            : '<div class="cvar">'+esc(optionLabel(it))+'</div>')+
        '</div>'+
        '<div class="cprice">'+priceHtml(it,cur,off,u,best)+'</div>'+
        '<div class="cfoot">'+
          '<button class="turn" type="button" aria-expanded="false">'+
            '<span class="ico">↻</span> Details</button>'+
        '</div>'+
        '<button class="addcart" type="button" data-add="'+gid+'">Add to cart</button>'+
      '</div>'+
    '</div>'+

    '<div class="face back">'+
      '<div class="backin">'+backInnerHtml(g)+'</div>'+
      '<div class="backfoot">'+
        '<button class="buy" type="button" data-add="'+gid+'">Add to cart — '+
          (money(it.price,cur)||'see store')+'</button>'+
        '<button class="turn-back" type="button" aria-label="Back to product">↺</button>'+
      '</div>'+
    '</div>'+
   '</div></article>';
}

/* ============================================================
   FACETED FILTERING
   ------------------------------------------------------------
   passes(g, skip) is the single predicate everything uses. `skip`
   names the facet being counted, which is excluded so an option never
   hides itself. Shipping destination is not a facet you can opt out
   of — a store that can't reach you never appears in any list.
   ============================================================ */
function variantPasses(g,v,skip,q,st){
  if(!SHOW_ALL && !itemReaches(v)) return false;
  if(!SHOW_ALL && snusBlocked() && isTobaccoSnus(v)) return false;
  if(skip!=='instock' && F.instock && !v.available) return false;
  if(skip!=='deals' && F.deals &&
     !(v.compareAt&&Number(v.compareAt)>Number(v.price))) return false;
  if(skip!=='price' && F.price && F.price!=='all'){
    var p=Number(v.price)||0, b=F.price.split('-');
    if(!p || p<Number(b[0]) || p>Number(b[1])) return false;
  }
  if(skip!=='strength' && F.strength && F.strength!=='all'){
    var mg=Number(v.strength);
    if(F.strength==='0'){ if(!(v.strength===0||v.strength===''||mg===0)) return false; }
    else{ var sb=F.strength.split('-');
      if(isNaN(mg)||mg<Number(sb[0])||mg>Number(sb[1])) return false; }
  }
  if(q){
    var hay=(g.brand+' '+g.title+' '+v.title+' '+(v.variant||'')+' '+
      (st.name||'')+' '+(v.strength||'')+'mg').toLowerCase();
    if(hay.indexOf(q)===-1) return false;
  }
  return true;
}
function passes(g,skip){
  var st=SMAP[g.key]||{};
  var q=F.q.trim().toLowerCase();
  if(!SHOW_ALL){
    if(!storeShipsHere(st)) return null;
    if(legalFor(deptOf(g))[0]==='banned') return null;
  }
  if(skip!=='dept' && F.dept!=='all' && deptOf(g)!==F.dept) return null;
  if(skip!=='store'){
    var ps=Object.keys(F.stores);
    if(ps.length){ if(!F.stores[g.key]) return null; }
    else if(F.store!=='all' && g.key!==F.store) return null;
  }
  if(skip!=='brand'){
    var pb=Object.keys(F.brands);
    if(pb.length){ if(!F.brands[g.brand]) return null; }
    else if(F.brand&&F.brand!=='all' && g.brand!==F.brand) return null;
  }
  for(var fi=0;fi<g.flav.length;fi++){
    var fl=g.flav[fi];
    for(var vi=0;vi<fl.variants.length;vi++){
      if(variantPasses(g,fl.variants[vi],skip,q,st)) return {f:fi,v:vi};
    }
  }
  return null;
}
function facetCount(skip){
  var out={};
  PGROUPS.forEach(function(g){
    if(!passes(g,skip)) return;
    if(skip==='store')    out[g.key]=(out[g.key]||0)+1;
    if(skip==='brand'&&g.brand) out[g.brand]=(out[g.brand]||0)+1;
    if(skip==='dept'){ var d=deptOf(g); out[d]=(out[d]||0)+1; }
    if(skip==='strength'){
      g.flav.forEach(function(f){ f.variants.forEach(function(v){
        var mg=Number(v.strength);
        var band = (v.strength===''||v.strength==null||mg===0) ? '0'
          : mg<=4?'1-4' : mg<=8?'5-8' : mg<=15?'9-15' : '16-99';
        out[band]=(out[band]||0)+1;
      });});
    }
  });
  return out;
}

/* ============================================================
   RENDER
   ============================================================ */
function apply(reset){
  /* A new filter or shelf starts the strip back at the best prices —
     landing halfway down someone else's ranking would be nonsense. */
  if(reset!==false){ PAGE=0; RAILP=0; }
  var q=F.q.trim().toLowerCase();

  VIEW=PGROUPS.filter(function(g){
    var hit=passes(g,null);
    if(!hit) return false;
    var cur=gsel(g);
    if(cur.f!==hit.f||cur.v!==hit.v){
      var cf=g.flav[cur.f];
      var stillOk = cf && cf.variants[cur.v] &&
        variantPasses(g,cf.variants[cur.v],null,q,SMAP[g.key]||{});
      if(!stillOk) SELV[g.gid]={f:hit.f,v:hit.v};
    }
    return true;
  });

  var s=F.sort;
  VIEW.sort(function(a,b){
    var ia=gitem(a), ib=gitem(b);
    if(s==='unit'){
      /* Ranked on the CONVERTED value. Grouping by currency was honest
         while nothing converted — a £ figure beating a $ figure would
         have been fiction — but it meant "best value per unit" listed
         every DKK row ahead of every EUR row regardless of worth, and
         the rail, which reads off the top of this list, could only ever
         show one currency. A currency with no rate sorts last rather
         than being ranked against a number we cannot compute. */
      var ua=unitPrice(ia), ub=unitPrice(ib);
      var va=ua?usdOf(ua.value,ia.currency||'USD'):null;
      var vb=ub?usdOf(ub.value,ib.currency||'USD'):null;
      return (va==null?1e9:va)-(vb==null?1e9:vb);
    }
    if(s==='price-asc') return (Number(ia.price)||1e9)-(Number(ib.price)||1e9);
    if(s==='price-desc')return (Number(ib.price)||-1)-(Number(ia.price)||-1);
    return String(a.title).localeCompare(String(b.title));
  });

  var mount=document.getElementById('mount');
  if(!VIEW.length && !PGROUPS.length){
    mount.innerHTML='<div class="state"><b>No catalogue connected yet</b>'+
      'The design is live but no store data has been pulled. In your Apps Script '+
      'project run <code>setup()</code>, then <code>diagnose()</code>, then '+
      '<code>refreshInventory()</code> — then reload this page.'+
      (CONN?'<br><br><span style="font-size:12px;color:var(--dim)">'+esc(CONN)+'</span>':'')+'</div>';
  }else if(!VIEW.length){
    var st2=F.store!=='all'?SMAP[F.store]:null;
    if(st2 && !SHOW_ALL && !storeShipsHere(st2)){
      mount.innerHTML='<div class="state"><b>'+esc(st2.name)+' can’t ship to '+
        esc(locLabel())+'</b>They deliver to '+
        esc((st2.ships||[]).join(' / ').replace('INTL','Worldwide'))+
        '. Change your destination at the top, or pick another store.</div>';
    }else{
      var ban = F.dept!=='all' && !SHOW_ALL ? legalFor(F.dept) : ['ok'];
      mount.innerHTML= ban[0]==='banned'
        ? '<div class="state"><b>'+esc(DEPTS[F.dept].label)+
          ' can’t be sold where you are</b>'+esc(ban[1])+'</div>'
        : '<div class="state"><b>Nothing matches that</b>'+
          'Try another department, a wider destination, or clear the filters.</div>';
    }
  }else{
    var slice=VIEW.slice(0,(PAGE+1)*PER);
    mount.innerHTML='<div class="grid">'+slice.map(card).join('')+'</div>'+
      (slice.length<VIEW.length
        ? '<button class="loadmore" id="more">Load more ('+(VIEW.length-slice.length)+' left)</button>'
        : '');
    var more=document.getElementById('more');
    if(more)more.addEventListener('click',function(){PAGE++;apply(false);});
  }

  var live={}, nProd=0;
  VIEW.forEach(function(g){ live[g.key]=1; nProd+=gvariants(g).length; });
  document.getElementById('rcount').innerHTML=
    '<b>'+VIEW.length.toLocaleString()+'</b> listing'+(VIEW.length===1?'':'s')+
    ' <em>'+nProd.toLocaleString()+' buyable options · '+
    Object.keys(live).length+' store'+(Object.keys(live).length===1?'':'s')+'</em>';

  var on=F.q||F.dept!=='all'||F.store!=='all'||F.deals||F.instock||
    (F.strength&&F.strength!=='all')||(F.price&&F.price!=='all')||
    (F.brand&&F.brand!=='all')||
    Object.keys(F.stores).length||Object.keys(F.brands).length;
  document.getElementById('clear').hidden=!on;

  /* heroStats() used to run only from ingest(), so the three figures
     were whatever the last load computed and never followed the shelf. */
  renderHero(); setRouteMeta(); heroStats();
  renderRail(); refreshFacets(); setWarn(); setNotices(); saveSelv();
}

/* How deep into each shelf's ranking the strip is currently showing.
   Reset by apply(), advanced by the shuffle button. */
var RAILP=0;

/* One ranked bucket per department, each on the converted value so a kr
   row and a $ row can sit in the same strip honestly. Devices and gear
   have no honest unit, so those shelves rank on price. */
function railPool(){
  var by={};
  VIEW.forEach(function(g){
    var it=gitem(g); if(!it||!it.available) return;
    var u=unitPrice(it);
    var v=u ? usdOf(u.value,it.currency||'USD')
            : usdOf(it.price,it.currency||'USD');
    if(v==null||!(v>0)) return;
    var d=deptOf(g);
    (by[d]||(by[d]=[])).push({g:g,v:v});
  });
  Object.keys(by).forEach(function(k){
    by[k].sort(function(a,b){ return a.v-b.v; });
  });
  return by;
}

/* The strip was VIEW.slice(0,10) — the head of a list sorted by unit
   price, which on the "everything" shelf meant ten rows from whichever
   department and currency happened to sort first. One category, every
   time, and never the one you were looking at.

   It takes the best of each shelf in turn now, so pouches, disposables,
   e-liquid, cigars, devices and gear all get a place.

   RAILP walks every shelf one step deeper at once, so shuffling shows
   the NEXT best prices rather than reshuffling the same ten cards. It
   wraps, so the strip can be cycled indefinitely without emptying. */
function renderRail(){
  var sec=document.getElementById('railsec');
  var by=railPool();
  var order=DEPT_ORDER.filter(function(d){ return by[d]&&by[d].length; });
  var total=0, deepest=0;
  order.forEach(function(d){
    total+=by[d].length;
    if(by[d].length>deepest) deepest=by[d].length;
  });
  if(total<4){ sec.hidden=true; return; }
  sec.hidden=false;

  var want=Math.min(12,total), pick=[], seen={};
  for(var r=0; r<deepest && pick.length<want; r++){
    for(var i=0; i<order.length && pick.length<want; i++){
      var list=by[order[i]];
      var row=list[(r+RAILP)%list.length];
      if(!row || seen[row.g.gid]) continue;
      seen[row.g.gid]=1; pick.push(row.g);
    }
  }

  var d=F.dept!=='all'?DEPTS[F.dept]:null;
  document.getElementById('railTitle').textContent=
    d?('Best '+(d.unitLabel||'value')+' right now'):'Best value right now';
  document.getElementById('railSub').textContent=
    d ? ('cheapest '+(d.unitLabel||'')+' we can find')
      : (order.length>1
          ? 'best value on each of '+order.length+' shelves, converted so they compare'
          : 'cheapest per pouch, per 1k puffs, per ml and per stick');

  /* nothing to shuffle to when the strip already holds everything */
  var sh=document.getElementById('railShuffle');
  if(sh) sh.hidden = total<=want;

  document.getElementById('rail').innerHTML=pick.map(card).join('');
}

/* Rebuild every selector from what is still reachable. Each list is
   counted with its own selection lifted, so picking a store narrows
   the brand list without emptying the store list. */
function refreshFacets(){
  var cStore=facetCount('store'), cBrand=facetCount('brand'),
      cDept=facetCount('dept'),  cStr=facetCount('strength');

  var sel=document.getElementById('f-store');
  if(sel){
    var liveS=STORES.filter(function(s){ return cStore[s.key]; });
    var prev=F.store;
    sel.innerHTML='<option value="all">All stores</option>'+
      liveS.map(function(s){
        return '<option value="'+esc(s.key)+'">'+esc(s.name)+' ('+cStore[s.key]+')</option>';
      }).join('');
    sel.value=(prev&&cStore[prev])?prev:'all';
    if(prev!=='all'&&!cStore[prev]) F.store='all';
  }

  var bsel=document.getElementById('f-brand');
  if(bsel){
    var bl=Object.keys(cBrand).sort();
    var pb=F.brand;
    bsel.innerHTML='<option value="all">All brands</option>'+
      bl.map(function(b){
        return '<option value="'+esc(b)+'">'+esc(b)+' ('+cBrand[b]+')</option>';
      }).join('');
    bsel.value=(pb&&cBrand[pb])?pb:'all';
    if(pb!=='all'&&!cBrand[pb]) F.brand='all';
  }

  var stEl=document.getElementById('f-strength');
  if(stEl){
    var BANDS=[['all','Any strength'],['0','Nicotine-free'],['1-4','Light · 1–4 mg'],
               ['5-8','Medium · 5–8 mg'],['9-15','Strong · 9–15 mg'],['16-99','Extra strong · 16 mg+']];
    var ps=F.strength;
    stEl.innerHTML=BANDS.filter(function(b){ return b[0]==='all'||cStr[b[0]]; })
      .map(function(b){
        return '<option value="'+b[0]+'">'+b[1]+(b[0]!=='all'?' ('+cStr[b[0]]+')':'')+'</option>';
      }).join('');
    stEl.value=(ps&&(ps==='all'||cStr[ps]))?ps:'all';
    if(ps!=='all'&&!cStr[ps]) F.strength='all';
  }

  DEPT_ORDER.forEach(function(d){
    var el=document.getElementById('c-'+d);
    if(el) el.textContent=cDept[d]||'';
    var tab=document.querySelector('.dept[data-dept="'+d+'"]');
    if(tab){
      var empty=!cDept[d];
      tab.style.opacity=empty?'.34':'';
      tab.style.pointerEvents=empty?'none':'';
    }
  });

  var ns=document.getElementById('nstores');
  if(ns) ns.textContent=Object.keys(cStore).length;

  renderStoreRow(cStore); renderBrandRow(cBrand);
}

/* ============================================================
   LOGO STRIPS
   ------------------------------------------------------------
   Stores use the mark harvested from their own homepage; anything
   missing gets a tinted monogram rather than the old invisible
   fallback. Brands have no domain to harvest from, so the product
   shot stands in — presented as a rounded square, which is what it
   honestly is.
   ============================================================ */
/* `sz` matters now that the spotlight watermark wants the same mark at
   poster size. Existing callers pass no size and keep the 128 they had. */
function logoFor(st,sz){
  if(st.logo) return st.logo;
  return 'https://www.google.com/s2/favicons?sz='+(sz||128)+
    '&domain='+encodeURIComponent(st.domain||'');
}
/* deterministic tint per store so the row reads as distinct shops */
function monoTint(key){
  var h=0; String(key).split('').forEach(function(c){ h=(h*31+c.charCodeAt(0))%360; });
  return {a:'hsl('+h+' 32% 30%)', b:'hsl('+h+' 34% 17%)'};
}
function monoAttrs(name,key){
  var t=monoTint(key);
  return 'data-letter="'+esc(String(name||'?').charAt(0).toUpperCase())+'" '+
         'style="--mono-a:'+t.a+';--mono-b:'+t.b+'"';
}
function renderStoreRow(counts){
  var row=document.getElementById('storeRow'), box=document.getElementById('storeLogos');
  if(!box) return;
  var live=STORES.filter(function(s){ return counts[s.key]; });
  if(live.length<2){ row.hidden=true; return; }
  row.hidden=false;
  box.innerHTML=live.map(function(s){
    var on=!!F.stores[s.key];
    return '<button class="lchip'+(on?' on':'')+'" data-logostore="'+esc(s.key)+'" '+
      'aria-pressed="'+on+'" title="'+esc(s.name)+'">'+
      '<span class="limg" '+monoAttrs(s.name,s.key)+'>'+
        '<img src="'+esc(logoFor(s))+'" alt="" loading="lazy" referrerpolicy="no-referrer" '+
        'onerror="this.parentNode.classList.add(\'mono\');this.remove();"></span>'+
      '<span class="lname">'+esc(s.name)+'</span>'+
      '<span class="lcount">'+counts[s.key]+'</span></button>';
  }).join('');
  document.getElementById('clearStores').hidden=!Object.keys(F.stores).length;
}
function renderBrandRow(counts){
  var row=document.getElementById('brandRow'), box=document.getElementById('brandLogos');
  if(!box) return;
  var img={};
  PGROUPS.forEach(function(g){
    if(!g.brand||img[g.brand]) return;
    if(!passes(g,'brand')) return;
    var f=g.flav[0]; if(f&&f.image) img[g.brand]=f.image;
  });
  var list=Object.keys(counts).filter(function(b){ return counts[b]>1; });
  list.sort(function(a,b){ return counts[b]-counts[a] || a.localeCompare(b); });
  list=list.slice(0,40);
  if(list.length<3){ row.hidden=true; return; }
  row.hidden=false;
  document.getElementById('brandNote').textContent=
    list.length+' brand'+(list.length===1?'':'s')+' available here';
  box.innerHTML=list.map(function(b){
    var on=!!F.brands[b];
    return '<button class="lchip brand'+(on?' on':'')+'" data-logobrand="'+esc(b)+'" '+
      'aria-pressed="'+on+'" title="'+esc(b)+'">'+
      '<span class="limg" '+monoAttrs(b,b)+'>'+(img[b]
        ? '<img src="'+esc(img[b])+'" alt="" loading="lazy" referrerpolicy="no-referrer" '+
          'onerror="this.parentNode.classList.add(\'mono\');this.remove();">'
        : '')+'</span>'+
      '<span class="lname">'+esc(b)+'</span>'+
      '<span class="lcount">'+counts[b]+'</span></button>';
  }).join('');
  if(!list.some(function(b){return img[b];})) box.querySelectorAll('.limg').forEach(function(el){el.classList.add('mono');});
  document.getElementById('clearBrands').hidden=!Object.keys(F.brands).length;
}

function renderStoreList(){
  var el=document.getElementById('slist'); if(!el) return;
  el.innerHTML=STORES.map(function(s){
    var n=ALL.filter(function(i){return i.key===s.key;}).length;
    var here=storeShipsHere(s);
    var zones=(s.ships||[]).join(' / ').replace('INTL','Worldwide')||'—';
    var note=!here ? 'doesn’t ship here' : (n? n+' listed · '+zones : zones);
    var accent=(DEPTS[s.dept]||{}).accent||'var(--dim)';
    return '<button class="schip'+(here?'':' away')+'" data-storefilter="'+esc(s.key)+'">'+
      '<i style="background:'+accent+'"></i>'+esc(s.name)+'<small>'+esc(note)+'</small></button>';
  }).join('');
}

/* Warnings and caveats. Standing notices above the grid were reference
   material stacked on products; what remains is only what bites here. */
function setWarn(){
  var eu = zoneOf()==='EU' || zoneOf()==='UK';
  var el = document.getElementById('warnbar');
  if(F.dept==='all'){ el.innerHTML = eu ? EUALL : ALLWARN; return; }
  el.innerHTML = eu ? (EUWARN[F.dept]||EUALL) : (DEPTS[F.dept]||{}).warn||ALLWARN;
}
function setNotices(){
  var box=document.getElementById('notices'); if(!box) return;
  var html='';
  if(PREVIEW_MODE){
    html+='<div class="previewbar">PREVIEW MODE — shipping limits and local law are '+
          'being ignored. Set <code>PREVIEW_MODE = false</code> before launch.</div>';
  }
  if(!SHOW_ALL){
    var cav = F.dept!=='all' ? regionCaveat(F.dept)
      : (regionCaveat('disposable')||regionCaveat('liquid'));
    if(cav) html+='<div class="caveat"><b>Heads up.</b> '+esc(cav)+'</div>';
  }
  box.innerHTML=html;
}

/* ============================================================
   DEPARTMENT HEROES
   ------------------------------------------------------------
   Legal-Leaf gives each page its own hero by serving a separate HTML
   file per page. We cannot do that: every department URL rewrites to
   index.html and the shelf is chosen client-side (CLAUDE.md §3), so
   here the hero is DATA and renderHero() swaps it.

   Each entry argues its own shelf's unit, because that unit is the
   reason the shelf exists. The colour comes from the department token
   via data-hero, so a new shelf needs a HEROES entry and one CSS line.
   ============================================================ */
var HEROES={
  all:{ eyebrow:'every store, one price you can compare',
    lead:'what it actually', head:'costs',
    sub:'Pouches, disposables, e-liquid and cigars from every shop we carry — priced '+
        'per pouch, per 1,000 puffs, per ml and per stick, so a five-can roll and a '+
        'single tin finally compare honestly.' },
  pouch:{ eyebrow:'pouches & snus · priced per pouch',
    lead:'the only number', head:'that matters',
    sub:'A tin of 20 and a roll of five never compared on the shelf price. Every pouch '+
        'here carries its own per-pouch cost, converted to one currency — so a kroner '+
        'listing and a euro listing can actually be ranked against each other.' },
  disposable:{ eyebrow:'disposables · priced per 1,000 puffs',
    lead:'puffs, not', head:'packaging',
    sub:'A 30K at $16.99 and a 60K at $19.99 look three dollars apart and are 42% apart. '+
        'Pricing by the thousand puffs is the entire reason this shelf exists.' },
  device:{ eyebrow:'devices & pods · priced flat',
    lead:'hardware, judged', head:'honestly',
    sub:'Mods, kits, pods, tanks and coils. No invented unit here — a device is a device, '+
        'so this shelf compares on flat price, stock, and what each store will ship you.' },
  liquid:{ eyebrow:'e-liquid · priced per ml',
    lead:'per millilitre,', head:'not per bottle',
    sub:'A 100ml shortfill and a 10ml nic salt are not the same purchase. Every bottle '+
        'shows its cost per ml, so the big bottle has to earn its shelf price.' },
  cigar:{ eyebrow:'cigars · priced per stick',
    lead:'per stick,', head:'every time',
    sub:'Singles, fivers and full boxes reduced to one comparable number. Cutters, cases '+
        'and humidors live on the Gear shelf — a $199 humidor is not a $199 cigar.' },
  gear:{ eyebrow:'gear & accessories · priced flat',
    lead:'everything', head:'around it',
    sub:'Humidors, cutters, cases and pipe gear. This shelf exists so that nothing without '+
        'nicotine in it gets priced per stick, which is exactly what used to happen.' }
};

function renderHero(){
  var sec=document.getElementById('hero'); if(!sec) return;
  var d=F.dept||'all', h=HEROES[d]||HEROES.all;
  sec.setAttribute('data-hero',d);
  [['heroEyebrow',h.eyebrow],['heroLead',h.lead],
   ['heroHead',h.head],['heroSub',h.sub]].forEach(function(p){
    var el=document.getElementById(p[0]); if(el) el.textContent=p[1];
  });
}

/* ============================================================
   DEPARTMENT ROUTES — path in, path out
   ------------------------------------------------------------
   CLAUDE.md §3 states the department is chosen client-side from the
   path. It was not. NOTHING read location.pathname, so /pouches,
   /cigars and the rest rewrote to index.html and every one of them
   landed on "Everything" — a dead end for the visitor, and six landing
   pages search engines had no reason to keep apart.

   Compounding it, index.html carried ONE title, ONE description and a
   canonical hardcoded to "/", so all six routes deduplicated into the
   homepage. Unique titles cost nothing and are the single biggest
   organic-traffic lever on a comparison site.

   NOTE: this is client-side metadata. Google renders JS and will see
   it; other crawlers and social unfurlers often will not. Serving real
   per-route <head> content is stronger — but that needs either a build
   step or six near-duplicate HTML files, and §2/§5 rule both out. This
   is the honest maximum without changing the architecture.
   ============================================================ */
var DEPT_PATH={pouch:'pouches', disposable:'disposables', device:'devices',
               liquid:'e-liquid', cigar:'cigars', gear:'gear'};
var PATH_DEPT={}; Object.keys(DEPT_PATH).forEach(function(d){ PATH_DEPT[DEPT_PATH[d]]=d; });

var DEPT_SEO={
  all:{ t:'Nicotia Market — Pouches, Vape & Cigars, Priced by the Unit',
    d:'Compare nicotine pouches, snus, disposables, e-liquid and cigars across every store we carry. Priced per pouch, per 1,000 puffs, per ml and per stick. Adults 21+.' },
  pouch:{ t:'Nicotine Pouches & Snus — Compared Per Pouch | Nicotia Market',
    d:'Every nicotine pouch and snus tin we track, priced per pouch and converted to one currency so a five-can roll and a single tin compare honestly. ZYN, VELO, Pablo, Iceberg and more. Adults 21+.' },
  disposable:{ t:'Disposable Vapes — Compared Per 1,000 Puffs | Nicotia Market',
    d:'Disposable vapes priced per 1,000 puffs, not per device. A 30K and a 60K look three dollars apart and are 42% apart — see the real cost. Adults 21+.' },
  device:{ t:'Vape Devices, Pods, Kits & Coils — Compared | Nicotia Market',
    d:'Mods, kits, pods, tanks and coils compared across every store we carry, on flat price, stock and where each one actually ships. Adults 21+.' },
  liquid:{ t:'E-Liquid & Vape Juice — Compared Per ml | Nicotia Market',
    d:'Shortfills, nic salts and freebase e-liquid priced per millilitre, so a 100ml bottle has to earn its shelf price against a 10ml. Adults 21+.' },
  cigar:{ t:'Cigars — Compared Per Stick | Nicotia Market',
    d:'Singles, fivers and full boxes reduced to one comparable number: the price per stick. Cutters, cases and humidors live on the Gear shelf. Adults 21+.' },
  gear:{ t:'Humidors, Cutters, Cases & Pipe Gear | Nicotia Market',
    d:'Humidors, cutters, cases and pipe gear compared across every store we carry. Accessories only — nothing here contains nicotine. Adults 21+.' }
};

function deptFromPath(){
  var seg=String(location.pathname||'').replace(/^\/+|\/+$/g,'').toLowerCase();
  return PATH_DEPT[seg]||'';
}

/* Title, description and canonical per shelf. Canonical points at the
   department's OWN url — pointing all six at "/" told Google they were
   the homepage wearing a hat, which is why none of them could rank. */
function setRouteMeta(){
  var d=F.dept||'all', s=DEPT_SEO[d]||DEPT_SEO.all;
  var path=d==='all'?'/':('/'+DEPT_PATH[d]);
  document.title=s.t;
  var set=function(sel,attr,val){
    var el=document.querySelector(sel); if(el) el.setAttribute(attr,val);
  };
  set('meta[name="description"]','content',s.d);
  set('link[rel="canonical"]','href','https://nicotiamarket.com'+path);
  set('meta[property="og:title"]','content',s.t);
  set('meta[property="og:description"]','content',s.d);
  set('meta[property="og:url"]','content','https://nicotiamarket.com'+path);
}

/* Keep the address bar honest when the shelf changes, so a department
   is linkable and the back button steps through shelves. Spotlights own
   the hash, so this only ever rewrites the path. */
function pushDeptPath(){
  if(currentRoute().view==='spotlight') return;
  var d=F.dept||'all', want=d==='all'?'/':('/'+DEPT_PATH[d]);
  if(!want||location.pathname===want) return;
  try{ history.pushState({dept:d},'',want+location.search); }catch(e){}
}

/* the tab strip follows F.dept, whoever set it — click, path or Back */
function syncDeptTabs(){
  var d=F.dept||'all';
  Array.prototype.forEach.call(document.querySelectorAll('.dept'),function(x){
    if(x.tagName==='A') return;
    x.setAttribute('aria-pressed', x.getAttribute('data-dept')===d?'true':'false');
  });
}
window.addEventListener('popstate',function(){
  F.dept=deptFromPath()||'all'; syncDeptTabs(); apply();
});

/* The headline number, and the one most easily made a liar.

   It used to walk only each group's SELECTED variant, skip the
   `available` check that every shelf applies, compare bare numbers
   across four currencies, and then print the winner's own symbol on the
   result. That is how the hero could claim a cheapest pouch of £0.003
   while the site's own "best value per unit" sort, filtered to the same
   store, put the real floor at £0.03.

   It now shares computeBestUnits()' yardstick exactly: in stock, every
   variant, one currency.

   DISPLAYED IN USD for now. Once PREVIEW_MODE goes false and shipping
   limits are enforced, this should follow the shopper's own region —
   the conversion already runs through usdOf(), so that becomes a
   question of which target currency to format into, not new maths. */
var SHELF_NOUN={all:'products tracked', pouch:'pouches tracked',
  disposable:'disposables tracked', device:'devices tracked',
  liquid:'e-liquids tracked', cigar:'cigars tracked', gear:'gear items tracked'};

/* What the three figures are counted over.

   Scope is THIS SHELF plus reachability — deliberately NOT the filter
   bar. The hero is a standing statement about the department; #rcount
   directly above the grid is the live filtered count. Tying both to the
   filters made the hero twitch on every keystroke and said the same
   thing twice. */
function shelfGroups(){
  var d=F.dept||'all';
  return PGROUPS.filter(function(g){
    if(d!=='all' && deptOf(g)!==d) return false;
    if(!SHOW_ALL){
      if(!storeShipsHere(SMAP[g.key])) return false;
      if(legalFor(deptOf(g))[0]==='banned') return false;
    }
    return true;
  });
}

function heroStats(){
  var el=document.getElementById('heroStats'); if(!el) return;
  var d=F.dept||'all';
  var groups=shelfGroups();

  /* The unit this shelf is actually priced by. 'all' stays on pouches
     because that is the homepage's headline claim; every other shelf
     answers in its own unit, which is why the Disposables page used to
     advertise a "cheapest pouch". Devices and gear are priced flat, so
     there is no honest unit and the figure becomes lowest price. */
  var unitDept = d==='all' ? 'pouch' : d;
  var dd = DEPTS[unitDept]||{};
  var flat = !dd.unit || dd.unit==='flat';

  var stores={}, rows=0, best=null;
  groups.forEach(function(g){
    stores[g.key]=1;
    gvariants(g).forEach(function(v){
      rows++;
      if(!v.available) return;
      var val;
      if(flat){
        val=usdOf(v.price,v.currency||'USD');
      }else{
        if(deptOf(g)!==unitDept) return;      /* 'all' ranks pouches only */
        var u=unitPrice(v); if(!u) return;
        val=usdOf(u.value,v.currency||'USD');
      }
      if(val==null||!val) return;
      if(best==null||val<best) best=val;
    });
  });

  var bits=[
    '<div><b>'+rows.toLocaleString()+'</b><span>'+
      esc(SHELF_NOUN[d]||SHELF_NOUN.all)+'</span></div>',
    '<div><b>'+Object.keys(stores).length+'</b><span>stores compared</span></div>'
  ];
  if(best!=null){
    var lbl = flat ? 'lowest price (USD)'
                   : 'cheapest '+(dd.unitLabel||'per unit')+' (USD)';
    bits.push('<div><b>'+unitFmt(best,'USD')+'</b><span>'+esc(lbl)+'</span></div>');
  }
  el.innerHTML=bits.join('');
}

function stamp(){
  var el=document.getElementById('stamp'); if(!el) return;
  var bits=[];
  if(UPDATED){
    var m=Math.round((Date.now()-new Date(UPDATED).getTime())/60000);
    bits.push('Checked '+(m<60?m+' min ago':m<1440?Math.round(m/60)+' hr ago'
      :Math.round(m/1440)+' days ago'));
  }
  if(SRC.seeded) bits.push(SRC.seeded+' from saved listings');
  if(CONN) bits.push(CONN);
  if(!bits.length){ el.textContent=''; return; }
  el.innerHTML=bits.join(' · ')+' <span class="how">why?</span>';
  el.querySelector('.how').onclick=showDiag;
}
function showDiag(){
  if(!META.length){ toast('No refresh report yet — run refreshInventory() in Apps Script.'); return; }
  var rows=META.map(function(m){
    var st=SMAP[m.key]||{name:m.key};
    var mine=ALL.filter(function(i){return i.key===m.key;});
    var inStock=mine.filter(function(i){return i.available;}).length;
    return {name:st.name||m.key, result:m.result, count:m.count,
            stock:mine.length?inStock+' / '+mine.length:'—', detail:m.detail};
  });
  var body=rows.map(function(r){
    var col=r.result==='ok'?'var(--sage)':'var(--red)';
    return '<div style="display:grid;grid-template-columns:1.2fr .7fr .5fr .7fr 2fr;gap:10px;'+
      'padding:9px 0;border-bottom:1px solid var(--line);font-size:12.5px;align-items:baseline">'+
      '<span style="font-weight:600">'+esc(r.name)+'</span>'+
      '<span style="color:'+col+'">'+esc(r.result)+'</span>'+
      '<span>'+r.count+'</span><span style="color:var(--muted)">'+esc(r.stock)+'</span>'+
      '<span style="color:var(--dim)">'+esc(r.detail)+'</span></div>';
  }).join('');
  document.getElementById('boardBody').innerHTML=
    '<p class="dnote">Which stores pulled live, and why the rest are showing saved listings.</p>'+body;
  document.querySelector('#board .dhead h2').textContent='Store status';
  drawer('board',true);
}

/* ============================================================
   CART + PASSWORDLESS ACCOUNT + PER-STORE CHECKOUT
   ------------------------------------------------------------
   Ported from Herbal-Leaf: browse and add freely, never asked to sign
   in; the account gate sits ONLY on checkout; no password anywhere;
   the cart groups by store and hands each group to that store's basket.
   ============================================================ */
var CART = {};
function loadCart(){ try{CART=JSON.parse(read_('nm_cart'))||{};}catch(e){CART={};}
  if(typeof CART!=='object'||!CART) CART={}; }
function saveCart(){ store_('nm_cart', JSON.stringify(CART)); }
function cartCount(){ var n=0; for(var k in CART) n+=CART[k].qty||0; return n; }
function addToCart(it){
  var k=it.id;
  if(CART[k]) CART[k].qty++;
  else CART[k]={qty:1, key:it.key, title:it.title, variant:it.variant||'',
                price:Number(it.price)||0, currency:it.currency||'USD',
                image:it.image||'', url:it.url||'', vid:it.vid||'',
                pid:it.pid||'', attrs:it.attrs||'',
                aff:it.aff||it.url||''};
  saveCart(); badges(); renderCart(); pulseCart();
  toast((it.title||'Item')+' added');
}
function setQty(k,q){ q=parseInt(q,10); if(isNaN(q)||q<=0) delete CART[k];
  else CART[k].qty=q; saveCart(); badges(); renderCart(); }
function bumpQty(k,d){ setQty(k,(CART[k]?CART[k].qty:0)+d); }
function clearCart(){ CART={}; saveCart(); badges(); renderCart(); }
function pulseCart(){ var b=document.getElementById('openList'); if(!b) return;
  b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }

/* One owner for both badges. The old code had cartBadge() set the cart
   count and counts() immediately overwrite it from an object that was
   never populated, so the cart badge sat at 0 no matter what. */
function badges(){
  var c=document.getElementById('nList'), b=document.getElementById('nBoard');
  if(c){ var n=cartCount(); c.textContent=n; c.classList.toggle('zero',!n); }
  if(b){ var m=Object.keys(BOARD).length; b.textContent=m; b.classList.toggle('zero',!m); }
}
var _tt=null;
function toast(m){ var t=document.getElementById('toast'); if(!t) return;
  t.textContent=m; t.classList.add('show');
  clearTimeout(_tt); _tt=setTimeout(function(){t.classList.remove('show');},2800); }

function getUser(){ try{return JSON.parse(read_('nm_user'));}catch(e){return null;} }
function setUser(u){ store_('nm_user', JSON.stringify(u)); accountUI(); }
function syncUserLoc(){
  var u=getUser(); if(!u||!u.email) return;
  u.country=LOC.country; u.region=LOC.region; u.locUpdated=Date.now();
  store_('nm_user',JSON.stringify(u));
}
function restoreUserLoc(){
  var u=getUser();
  if(u&&u.country&&!LOC.country){ LOC.country=u.country; LOC.region=u.region||''; saveLoc(); }
}
function signOut(){ store_('nm_user',''); try{localStorage.removeItem('nm_user');}catch(e){}
  MEM['nm_user']=''; accountUI(); toast('Signed out'); }
function isLoggedIn(){ var u=getUser(); return !!(u&&u.email); }
function accountUI(){ var el=document.getElementById('acctLabel'); if(!el) return;
  var u=getUser(); el.textContent=(u&&u.name)?u.name.split(' ')[0]:(u&&u.email?'Account':'Sign in'); }

var PENDING=null, AUTH_MODE='signup';
function requireLoginThen(fn,why){ if(isLoggedIn()){fn();return;}
  PENDING=fn;
  var s=document.getElementById('authSub');
  if(s) s.textContent=why||'No password. Your email is your account.';
  openAuth(); }
function openAuth(){ setAuthMode(AUTH_MODE);
  document.getElementById('authWrap').classList.add('on');
  setTimeout(function(){var e=document.getElementById('authEmail'); if(e)e.focus();},80); }
function closeAuth(){ document.getElementById('authWrap').classList.remove('on'); PENDING=null; }
function setAuthMode(m){ AUTH_MODE=m;
  var nr=document.getElementById('authNameRow'), t=document.getElementById('authTitle'),
      s=document.getElementById('authSubmit'), tg=document.getElementById('authToggle');
  if(m==='signup'){ nr.style.display='block'; t.textContent='Create your account';
    s.textContent='Create account and continue';
    tg.innerHTML='Already have one? <a href="#" data-authmode="login">Sign in</a>'; }
  else { nr.style.display='none'; t.textContent='Welcome back';
    s.textContent='Sign in and continue';
    tg.innerHTML='New here? <a href="#" data-authmode="signup">Create an account</a>'; }
}
function submitAuth(){
  var email=(document.getElementById('authEmail').value||'').trim();
  var name=(document.getElementById('authName').value||'').trim();
  var err=document.getElementById('authErr');
  if(!email||email.indexOf('@')===-1||email.indexOf('.')===-1){
    err.textContent='Please enter a valid email address.'; err.style.display='block'; return; }
  if(AUTH_MODE==='signup'&&!name){
    err.textContent='Please enter your name.'; err.style.display='block'; return; }
  err.style.display='none';
  setUser({email:email,name:name||email.split('@')[0],joined:Date.now(),
           country:LOC.country,region:LOC.region});
  closeAuth();
  toast('Welcome'+(name?', '+name.split(' ')[0]:''));
  var fn=PENDING; PENDING=null; if(typeof fn==='function') setTimeout(fn,140);
}

function itemsForStore(key){ var o=[]; for(var k in CART) if(CART[k].key===key)
  o.push(Object.assign({lineKey:k},CART[k])); return o; }
function shipEstimate(st, after){
  var flat=Number(st.shipFlat)||0, freeOver=Number(st.shipFree)||0;
  if(!flat) return null;
  var free=(freeOver>0&&after>=freeOver);
  return {cost:free?0:flat, free:free, freeOver:freeOver};
}
/* Shopify takes a cart permalink that fills the basket and applies a
   code in one hop — that is why variant IDs are worth capturing.
   WooCommerce takes ?add-to-cart= on any page, but NOT always at
   /cart/: Wave Vape's basket lives at /cart-2/ and their own buttons
   post to /store/. `cartPath` carries that per store, and only one
   line can be added per hop, so we send the rest as a note. */
/* Append params without ever emitting an empty one. `&ref=` with
   nothing after it is worse than no ref: GoAffPro reads it as an
   explicit empty attribution and can clear a cookie set earlier in the
   session, so a sale we DID earn stops tracking. */
function addParams(url, params){
  var qs=[];
  for(var k in params){
    var v=params[k];
    if(v===undefined||v===null||v==='') continue;
    qs.push(encodeURIComponent(k)+'='+encodeURIComponent(v));
  }
  if(!qs.length) return url;
  return url+(url.indexOf('?')>-1?'&':'?')+qs.join('&');
}

/* Some stores enforce a quantity rule the catalogue APIs do not expose
   — Snus O'Clock rejects a hand-off with "Quantity must be in
   increments of Multiple of 10" on certain bundles. We send 1, their
   checkout blocks, and the shopper is stuck on a page they cannot
   submit. Where a store's rule is known, set qtyStep in the registry
   and quantities round UP to it.

   This is per STORE, not per product, so only set it where the rule
   genuinely applies to the whole catalogue. Left unset it is a no-op. */
function stepQty(st, q, item){
  /* A per-product minimum stated in the title beats any store-wide
     rule, because it IS the store's rule for that product. */
  var min=item?minQtyOf(item.title):1;
  var step=Number(st.qtyStep)||min||1;
  if(step<2) return Math.max(q,min);
  return Math.max(step, Math.ceil(q/step)*step);
}

function checkoutUrl(st, items){
  var base='https://'+st.domain;
  if(st.platform==='shopify'){
    var parts=items.filter(function(x){return x.vid;})
                   .map(function(x){return encodeURIComponent(x.vid)+':'+stepQty(st,x.qty,x);});
    /* The cart permalink jumps straight to /cart, skipping any product
       page — so the affiliate cookie was never set on the way through
       and Shopify handoffs were tracking to nobody. ?ref= rides along
       on the permalink itself. */
    if(parts.length) return addParams(base+'/cart/'+parts.join(','),
      {discount:st.coupon, ref:st.ref});
    return st.coupon
      ? addParams(base+'/discount/'+encodeURIComponent(st.coupon),{redirect:'/cart', ref:st.ref})
      : addParams(base+'/cart',{ref:st.ref});
  }
  /* WooCommerce takes ONE line per request — there is no core equivalent
     of Shopify's multi-item cart permalink. So we send the first item
     and say so plainly rather than pretending otherwise.

     For a VARIABLE product the id shape matters and getting it wrong
     fails loudly: ?add-to-cart=<variation_id> is rejected with "please
     choose product options" and the cart lands empty. Woo wants the
     PARENT id, variation_id, and each attribute as its own param. */
  if(st.platform==='woocommerce' && items[0] && items[0].vid){
    var x=items[0], path=st.cartPath||'/cart/';
    var url;
    if(x.pid){
      url=addParams(base+path,{'add-to-cart':x.pid, variation_id:x.vid,
                               quantity:stepQty(st,x.qty,x), ref:st.ref});
      if(x.attrs) url+='&'+x.attrs;      /* already url-encoded by the store */
    }else{
      url=addParams(base+path,{'add-to-cart':x.vid, quantity:stepQty(st,x.qty,x), ref:st.ref});
    }
    return url;
  }
  return items[0] ? (items[0].aff||items[0].url) : addParams(base+'/',{ref:st.ref});
}
function checkoutStore(key){
  if(!isLoggedIn()) toast('One step first — we need an email to send your order details');
  requireLoginThen(function(){
    var st=SMAP[key]; if(!st) return;
    var items=itemsForStore(key); if(!items.length) return;
    if(st.coupon){ try{navigator.clipboard.writeText(st.coupon);}catch(e){} }
    var url=checkoutUrl(st,items);
    var auto=(st.platform==='shopify'&&items.some(function(x){return x.vid;}))||
             (st.platform==='woocommerce'&&items[0]&&items[0].vid);
    var partial=(st.platform==='woocommerce'&&items.length>1);
    toast(partial ? ('Opening '+st.name+' with your first item — add the rest there')
        : auto ? ('Cart sent to '+st.name+(st.coupon?' — code applied':''))
               : ('Opening '+st.name+(st.coupon?' — code '+st.coupon+' copied':'')));
    window.open(url,'_blank','noopener');
  }, 'We send your basket straight to the store. Your email keeps the order '+
     'linked to you if anything needs sorting.');
}

function renderBoard(){
  var ids=Object.keys(BOARD), body=document.getElementById('boardBody');
  document.querySelector('#board .dhead h2').textContent='Saved';
  if(!ids.length){body.innerHTML='<div class="dempty"><b>Nothing saved yet</b>'+
    'Tap the star on any product to keep it here.</div>';return;}
  body.innerHTML=ids.map(function(id){
    var it=BOARD[id], st=SMAP[it.key]||{};
    return '<div class="ditem">'+
      (it.image?'<img src="'+esc(it.image)+'" alt="" referrerpolicy="no-referrer">':'<div class="dnoimg"></div>')+
      '<div class="m"><div class="t">'+esc(it.title)+'</div>'+
      '<div class="s">'+esc(st.name||it.key)+'</div>'+
      '<div class="p">'+(money(it.price,it.currency)||'Price at store')+'</div></div>'+
      '<button class="x" data-unsave="'+esc(id)+'" aria-label="Remove">&times;</button></div>';
  }).join('')+'<p class="dnote">Saved in this browser.</p>';
}

function renderCart(){
  var keys=Object.keys(CART), body=document.getElementById('listBody'),
      cta=document.getElementById('listCta');
  if(!keys.length){
    body.innerHTML='<div class="dempty"><b>Your cart is empty</b>'+
      'Add anything from any store. We group it by shop when you check out.</div>';
    cta.innerHTML=''; return;
  }
  var groups={};
  keys.forEach(function(k){ (groups[CART[k].key]=groups[CART[k].key]||[]).push(
    Object.assign({lineKey:k},CART[k])); });

  var gSub=0, gAfter=0, gShip=0, html='';
  Object.keys(groups).forEach(function(sk){
    var st=SMAP[sk]||{name:sk,domain:'',platform:''}, items=groups[sk], sub=0;
    var cur=(items[0]||{}).currency||'USD';
    var rows=items.map(function(x){
      var line=x.price*x.qty; sub+=line;
      var e=esc(x.lineKey);
      return '<div class="ditem">'+
        (x.image?'<img src="'+esc(x.image)+'" alt="" referrerpolicy="no-referrer">':'<div class="dnoimg"></div>')+
        '<div class="m"><div class="t">'+esc(x.title)+'</div>'+
        (x.variant?'<div class="s">'+esc(x.variant)+'</div>':'')+
        '<div class="qty"><button data-qty="-1" data-k="'+e+'">&minus;</button>'+
        '<input value="'+x.qty+'" data-qtyset="'+e+'" inputmode="numeric">'+
        '<button data-qty="1" data-k="'+e+'">+</button>'+
        '<button class="rm" data-qty="0" data-k="'+e+'">remove</button></div></div>'+
        '<div class="lt">'+money(line,cur)+'</div></div>';
    }).join('');

    var off=Number(st.off)||0;
    var after=off>0?sub*(1-off):sub;
    var ship=shipEstimate(st,after);
    gSub+=sub; gAfter+=after; if(ship) gShip+=ship.cost;

    var bd='<div class="dbd"><div class="r"><span>Subtotal</span><span>'+money(sub,cur)+'</span></div>';
    if(off>0) bd+='<div class="r save"><span>Code '+esc(st.coupon)+' ('+Math.round(off*100)+
      '% off)</span><span>−'+money(sub-after,cur)+'</span></div>';
    if(ship){
      if(ship.free) bd+='<div class="r"><span>Est. shipping</span><span class="free">FREE</span></div>';
      else{
        var away=ship.freeOver>0?(ship.freeOver-after):0;
        bd+='<div class="r"><span>Est. shipping'+(away>0?
          ' <i>add '+money(away,cur)+' for free</i>':'')+'</span><span>'+money(ship.cost,cur)+'</span></div>';
      }
    }
    bd+='<div class="r otd"><span>Est. total</span><span>'+
      money(after+(ship?ship.cost:0),cur)+'</span></div></div>';

    var auto=(st.platform==='shopify');
    var multiWoo=(st.platform==='woocommerce'&&items.length>1);
    /* Everything the shopper needs to judge this hand-off, immediately
       above the button that performs it: who checks age, where it ships
       from, and how long it takes. */
    var facts=[ageBadge(st)];
    if(st.days) facts.push('<span class="shipchip">'+esc(st.days)+'</span>');
    if(st.from&&st.from!=='US') facts.push('<span class="shipchip">Ships from '+esc(st.from)+'</span>');
    html+='<div class="dgroup"><h3>'+esc(st.name)+'</h3>'+rows+bd+
      '<div class="dfacts">'+facts.filter(Boolean).join('')+'</div>'+
      '<button class="dcheckout" data-checkout="'+esc(sk)+'">Checkout at '+
        esc(st.name)+' →</button>'+
      '<p class="dnote">'+(multiWoo
        ? 'Opens '+esc(st.name)+' with your first item in the basket — add the others there.'
        : auto
        ? 'Your basket fills automatically at '+esc(st.name)+
          (st.coupon?' with code '+esc(st.coupon)+' applied':'')+'.'
        : 'Opens '+esc(st.name)+(st.coupon?' with code '+esc(st.coupon)+' copied':'')+'.')+'</p></div>';
  });

  var nStores=Object.keys(groups).length;
  var grand='<div class="dgrand"><div class="r sm"><span>Items</span><span>'+
    money(gSub,'USD')+'</span></div>'+
    (gAfter<gSub?'<div class="r sm save"><span>Code savings</span><span>−'+
      money(gSub-gAfter,'USD')+'</span></div>':'')+
    (gShip>0?'<div class="r sm"><span>Est. shipping</span><span>'+money(gShip,'USD')+'</span></div>':'')+
    '<div class="r"><span>Est. total</span><span>'+money(gAfter+gShip,'USD')+'</span></div></div>';

  body.innerHTML=html+grand+
    (isLoggedIn()?'':'<p class="dlogin">A free sign-in is needed at checkout. '+
      'No password — just an email, so your basket stays linked to you across stores.</p>')+
    '<p class="dfine">Totals are estimates. Each store shows final price, tax and shipping '+
    'at its own checkout. Mixed currencies are not converted.</p>'+
    '<button class="dclear" data-clearcart>Empty cart</button>';
  cta.innerHTML='<p class="dnote" style="margin:0">'+nStores+
    ' store'+(nStores===1?'':'s')+' · pay each separately</p>';
}

/* ============================================================
   EVENTS
   ------------------------------------------------------------
   Click order matters. Named controls win, real links and inputs pass
   straight through, and ANY other click inside a card flips it. Get
   this order wrong and Add to Cart flips the card instead of adding,
   because the front face is itself a flip target.
   ============================================================ */
function drawer(id,open){
  document.getElementById(id).classList.toggle('on',open);
  document.getElementById('scrim').classList.toggle('on',open);
}
function groupById(gid){ var g=null; PGROUPS.forEach(function(x){if(x.gid===gid)g=x;}); return g; }

document.addEventListener('click',function(e){
  var t=e.target;
  var hit=function(sel){ return t.closest(sel); };

  var el;
  if((el=hit('[data-authclose]'))){ closeAuth(); return; }
  if((el=hit('[data-authmode]'))){ e.preventDefault(); setAuthMode(el.getAttribute('data-authmode')); return; }
  if(t.id==='authSubmit'){ submitAuth(); return; }

  if((el=hit('[data-save]'))){ e.preventDefault(); e.stopPropagation();
    var g=groupById(el.getAttribute('data-save'));
    if(g){ if(BOARD[g.gid]) delete BOARD[g.gid]; else BOARD[g.gid]=gitem(g);
      badges(); apply(false); }
    return; }
  if((el=hit('[data-add]'))){ e.preventDefault(); e.stopPropagation();
    var gg=groupById(el.getAttribute('data-add'));
    if(gg) addToCart(gitem(gg));
    return; }
  if((el=hit('[data-unsave]'))){ delete BOARD[el.getAttribute('data-unsave')];
    badges(); renderBoard(); apply(false); return; }
  if((el=hit('[data-checkout]'))){ checkoutStore(el.getAttribute('data-checkout')); return; }
  if((el=hit('[data-qty]'))){ var d=Number(el.getAttribute('data-qty'));
    if(d===0) setQty(el.getAttribute('data-k'),0); else bumpQty(el.getAttribute('data-k'),d);
    return; }
  if(hit('[data-clearcart]')){ clearCart(); return; }

  if((el=hit('[data-sadd]'))){ e.preventDefault(); e.stopPropagation();
    var m=(location.hash||'').match(/^#\/store\/([a-z0-9_-]+)/i);
    if(m){ var mine=ALL.filter(function(x){return x.key===m[1];});
      var pick=mine[Number(el.getAttribute('data-sadd'))]; if(pick) addToCart(pick); }
    return; }
  if((el=hit('[data-logostore]'))){ e.preventDefault();
    var k=el.getAttribute('data-logostore');
    if(F.stores[k]) delete F.stores[k]; else F.stores[k]=1;
    F.store='all'; apply(); return; }
  if((el=hit('[data-logobrand]'))){ e.preventDefault();
    var b=el.getAttribute('data-logobrand');
    if(F.brands[b]) delete F.brands[b]; else F.brands[b]=1;
    F.brand='all'; apply(); return; }
  if((el=hit('[data-storefilter]'))){ e.preventDefault();
    F.stores={}; F.stores[el.getAttribute('data-storefilter')]=1;
    F.store='all';
    var sel=document.getElementById('f-store'); if(sel) sel.value='all';
    if(location.hash) location.hash='';
    drawer('list',false); drawer('board',false);
    apply(); window.scrollTo({top:0,behavior:'smooth'}); return; }
  if((el=hit('[data-addall]'))){ e.preventDefault();
    var ak=el.getAttribute('data-addall'), n=0;
    PGROUPS.filter(function(g){return g.key===ak;}).forEach(function(g){
      g.flav.forEach(function(f){ var v=f.variants.filter(function(x){return x.available;})[0];
        if(v){ addToCart(v); n++; } }); });
    toast(n?(n+' added to your cart'):'Nothing in stock to add');
    if(n) drawer('list',true); return; }

  /* anything genuinely interactive is left alone */
  if(t.closest('a,input,select,textarea,label,button[data-close]')) return;

  var card=t.closest('.card');
  if(card){
    var on=card.classList.toggle('on');
    var ft=card.querySelector('.front .turn');
    if(ft) ft.setAttribute('aria-expanded',on?'true':'false');
  }
});

document.addEventListener('change',function(e){
  var t=e.target;
  if(t.matches('[data-flav]')){ SELV[t.getAttribute('data-flav')]={f:parseInt(t.value,10)||0,v:0};
    saveSelv(); refreshCard(t.getAttribute('data-flav')); return; }
  if(t.matches('[data-str]')){ var gid=t.getAttribute('data-str');
    var s=SELV[gid]||{f:0,v:0};
    SELV[gid]={f:parseInt(s.f,10)||0, v:parseInt(t.value,10)||0};
    saveSelv(); refreshCard(gid); return; }
  if(t.matches('[data-qtyset]')){ setQty(t.getAttribute('data-qtyset'),t.value); return; }
});

var _qt;
document.getElementById('q').addEventListener('input',function(e){
  clearTimeout(_qt); var v=e.target.value;
  _qt=setTimeout(function(){F.q=v;apply();},170);});
['store','brand','strength','price','sort'].forEach(function(k){
  document.getElementById('f-'+k).addEventListener('change',function(e){F[k]=e.target.value;apply();});});
document.getElementById('f-deals').addEventListener('click',function(){
  F.deals=!F.deals; this.classList.toggle('active',F.deals);
  this.setAttribute('aria-pressed',F.deals); apply();});
document.getElementById('f-instock').addEventListener('click',function(){
  F.instock=!F.instock; this.classList.toggle('active',F.instock);
  this.setAttribute('aria-pressed',F.instock); apply();});
document.getElementById('depts').addEventListener('click',function(e){
  var b=e.target.closest('.dept'); if(!b||b.tagName==='A') return;
  this.querySelectorAll('.dept').forEach(function(x){x.setAttribute('aria-pressed','false');});
  b.setAttribute('aria-pressed','true'); F.dept=b.getAttribute('data-dept');
  leaveSpotlight(); pushDeptPath(); apply();});
/* Shuffle only moves the strip — it must NOT run apply(), which would
   reset RAILP to 0 and land you back on the same twelve cards. */
(function(){
  var b=document.getElementById('railShuffle');
  if(b) b.addEventListener('click',function(){ RAILP++; renderRail(); });
})();
document.getElementById('clearStores').addEventListener('click',function(){F.stores={};apply();});
document.getElementById('clearBrands').addEventListener('click',function(){F.brands={};apply();});
document.getElementById('clear').addEventListener('click',function(){
  F={q:'',dept:'all',store:'all',brand:'all',strength:'all',price:'all',
     sort:'unit',deals:false,instock:false,stores:{},brands:{}};
  document.getElementById('q').value='';
  ['store','brand','strength','price'].forEach(function(k){
    var el=document.getElementById('f-'+k); if(el) el.value='all'; });
  document.getElementById('f-sort').value='unit';
  document.getElementById('f-deals').classList.remove('active');
  document.getElementById('f-instock').classList.remove('active');
  document.querySelectorAll('.dept').forEach(function(x){x.setAttribute('aria-pressed','false');});
  document.querySelector('.dept[data-dept="all"]').setAttribute('aria-pressed','true');
  leaveSpotlight(); pushDeptPath(); apply();});

document.getElementById('scrim').addEventListener('click',function(){
  drawer('board',false);drawer('list',false);});
document.querySelectorAll('[data-close]').forEach(function(b){
  b.addEventListener('click',function(){drawer('board',false);drawer('list',false);});});
document.getElementById('openBoard').addEventListener('click',function(){renderBoard();drawer('board',true);});
document.getElementById('openList').addEventListener('click',function(){renderCart();drawer('list',true);});
document.getElementById('acctBtn').addEventListener('click',function(){
  if(isLoggedIn()){ if(confirm('Sign out of Nicotia Market?')) signOut(); }
  else { setAuthMode('login'); openAuth(); }});
function toggleFilters(on){ document.body.classList.toggle('filters-open',on); }
document.getElementById('filterToggle').addEventListener('click',function(){
  toggleFilters(!document.body.classList.contains('filters-open'));});
document.getElementById('mfClose').addEventListener('click',function(){toggleFilters(false);});
document.getElementById('fscrim').addEventListener('click',function(){toggleFilters(false);});

/* ============================================================
   ROUTING + SPOTLIGHT
   ============================================================ */
function currentRoute(){
  var m=(location.hash||'').match(/^#\/store\/([a-z0-9_-]+)/i);
  return m ? {view:'spotlight', key:m[1]} : {view:'mall'};
}

/* Leaving a spotlight is part of picking a department.

   The #depts handler set F.dept and called apply(), which faithfully
   re-rendered a #mallview that was still `hidden` behind #spotview — so
   on /#/store/* every department button, Everything included, looked
   completely dead. Only the masthead logo escaped, because it is an
   <a href="#/"> and so moved the hash.

   route() performs the swap on hashchange; calling it directly too
   makes the order deterministic instead of depending on when the event
   drains. Running twice is harmless — it only toggles `hidden`. */
function leaveSpotlight(){
  if(currentRoute().view!=='spotlight') return false;
  location.hash='';
  route();
  return true;
}
function route(){
  var r=currentRoute();
  var mall=document.getElementById('mallview');
  var spot=document.getElementById('spotview');
  if(r.view==='spotlight' && SPOTLIGHT[r.key]){
    mall.hidden=true; spot.hidden=false; renderSpotlight(r.key);
    window.scrollTo(0,0);
  }else{
    spot.hidden=true; mall.hidden=false;
    if(ALL.length) apply();
  }
  document.querySelectorAll('[data-route]').forEach(function(a){
    a.setAttribute('aria-current', a.getAttribute('href')===location.hash ? 'page':'false');
  });
}
window.addEventListener('hashchange',route);

/* Brand-shelf spotlight. Reuses card() and the grouping engine rather
   than inventing a second product renderer — Nicokick's 410 pouches
   already collapse to 17 brand cards, each carrying its own flavour
   and strength dropdowns, so a flat grid is the right shape. */
function renderBrandSpotlight(key, cfg, st){
  var el=document.getElementById('spotview');
  var groups=PGROUPS.filter(function(g){ return g.key===key; });
  if(!groups.length){
    el.innerHTML='<div class="shell"><div class="state"><b>'+esc(cfg.headline)+
      ' has no products loaded</b>Check /api/products?debug for this store.'+
      '<br><br><a class="btn" href="#/">Back to the market</a></div></div>';
    return;
  }
  /* biggest ranges first — that is how their own nav is ordered */
  groups.sort(function(a,b){ return gvariants(b).length-gvariants(a).length; });

  var rows=0, cheapest=null, cur='USD';
  groups.forEach(function(g){
    gvariants(g).forEach(function(v){
      rows++;
      var u=unitPrice(v);
      if(u && (cheapest===null || u.value<cheapest)){ cheapest=u.value; cur=v.currency||'USD'; }
    });
  });

  var usps=(cfg.usps||[]).map(function(u){
    return '<div class="uspcard"><b>'+esc(u[0])+'</b><span>'+esc(u[1])+'</span></div>';
  }).join('');

  /* The store's mark, poster-sized, behind its own page. aria-hidden and
     pointer-events:none — this is texture, not content.

     Real artwork if the SPOTLIGHT entry supplies `logo`; otherwise the
     store's NAME set in our display face, not a favicon. Google's
     favicon service ignores sz= and hands back 48x48 whatever you ask
     for — upscaled to ~900px that is an unreadable smear, and pushing
     the opacity up to compensate only makes the smear obvious. Type
     stays crisp at any size, costs no request, and cannot 404. */
  var mark=cfg.logo||'';

  el.innerHTML=
    '<div class="shell spot-brand" style="--spot:'+esc(cfg.accent||'var(--ember)')+
      ';--spot2:'+esc(cfg.accent2||'var(--gold)')+'">'+
      '<div class="spotmark" aria-hidden="true">'+
        (mark
          ? '<img src="'+esc(mark)+'" alt="" referrerpolicy="no-referrer" '+
            'onerror="this.parentNode.remove();">'
          : '<span class="spotword">'+esc(st.name||key)+'</span>')+
      '</div>'+
      '<a class="sbacklink" href="#/">&larr; All stores</a>'+
      '<header class="shero">'+
        '<p class="eyebrow spot-eyebrow">'+esc(cfg.eyebrow)+'</p>'+
        '<h1>'+esc(cfg.headline)+'</h1>'+
        '<p class="sblurb">'+esc(cfg.blurb)+'</p>'+
        '<div class="sstats">'+
          '<div><b>'+rows.toLocaleString()+'</b><span>products</span></div>'+
          '<div><b>'+groups.length+'</b><span>brands</span></div>'+
          (cheapest!==null?'<div><b>'+unitFmt(cheapest,cur)+'</b><span>cheapest per pouch</span></div>':'')+
        '</div>'+
        (usps?'<div class="uspgrid">'+usps+'</div>':'')+
      '</header>'+
      '<div class="brandbar">'+groups.map(function(g){
        return '<a class="brandpill" href="#brand-'+esc(nk(g.brand))+'">'+esc(g.brand)+
               '<span>'+gvariants(g).length+'</span></a>';
      }).join('')+'</div>'+
      '<div class="grid">'+groups.map(function(g){
        return '<div id="brand-'+esc(nk(g.brand))+'">'+card(g)+'</div>';
      }).join('')+'</div>'+
      '<footer class="sfoot">'+
        '<button class="btn" data-storefilter="'+esc(key)+'">See '+esc(st.name)+
          ' in the market</button>'+
        '<p>'+esc(cfg.note||'')+' Add what you want, then check out at '+esc(st.name)+
        ' from your cart. We earn a commission on purchases made through this page. '+
        'It never changes your price.</p>'+
      '</footer>'+
    '</div>';
}

function renderSpotlight(key){
  var cfg=SPOTLIGHT[key], st=SMAP[key]||{name:key,domain:''};
  var el=document.getElementById('spotview');
  if(!ALL.length){ el.innerHTML='<div class="shell"><div class="state"><b>Loading…</b></div></div>'; return; }
  if(cfg.layout==='brands') return renderBrandSpotlight(key,cfg,st);

  var mine=ALL.filter(function(i){return i.key===key;});
  if(!mine.length){
    el.innerHTML='<div class="shell"><div class="state"><b>'+esc(cfg.headline)+
      ' has no products loaded</b>Run refreshInventory() in Apps Script, then reload.'+
      '<br><br><a class="btn" href="#/">Back to the market</a></div></div>';
    return;
  }
  var inStock=mine.filter(function(i){return i.available;}).length;
  var prices=mine.map(function(i){return Number(i.price)||0;}).filter(Boolean);
  var lo=prices.length?Math.min.apply(null,prices):0;
  var hi=prices.length?Math.max.apply(null,prices):0;
  var cur=(mine[0]||{}).currency||'USD';

  var cards=mine.map(function(it,ix){
    var p=spotlightPrice(it,cfg), u=unitPrice(it);
    var desc=String(it.desc==null?'':it.desc).trim();
    return '<article class="card"><div class="card-in">'+
      '<div class="face front" data-turn tabindex="0" role="button">'+
        '<div class="shot">'+(it.image
          ? '<img src="'+esc(it.image)+'" alt="'+esc(it.title)+'" loading="lazy" referrerpolicy="no-referrer">'
          : '<div class="shot-empty">No photo</div>')+
          (it.available?'':'<span class="oos">Out of stock</span>')+'</div>'+
        '<div class="cbody"><h3 class="ctitle">'+esc(it.title)+'</h3>'+
          (it.variant?'<div class="cvar">'+esc(it.variant)+'</div>':'')+
          '<div class="cprice"><b>'+money(p.now,cur)+'</b>'+
            (p.orig&&p.orig>p.now?'<s>'+money(p.orig,cur)+'</s>':'')+
            (u?'<span class="unitchip">'+unitFmt(u.value,cur)+' <span class="u">'+esc(u.label)+'</span></span>':'')+
          '</div>'+
          '<div class="cfoot"><button class="turn" type="button"><span class="ico">↻</span> Details</button></div>'+
          '<button class="addcart" type="button" data-sadd="'+ix+'">Add to cart</button>'+
        '</div></div>'+
      '<div class="face back"><div class="backin">'+
        '<h4>'+esc(it.title)+'</h4>'+
        (desc?'<p class="bdesc">'+esc(desc)+'</p>'
             :'<p class="bdesc dim">'+esc(st.name)+' publishes no description for this one.</p>')+
        '<dl class="bspec">'+
          (it.brand&&it.brand!==st.name?'<dt>Brand</dt><dd>'+esc(it.brand)+'</dd>':'')+
          (u?'<dt>Unit price</dt><dd>'+unitFmt(u.value,cur)+' '+esc(u.label)+'</dd>':'')+
          '<dt>Stock</dt><dd>'+(it.available?'In stock':'Out of stock')+'</dd></dl>'+
        (p.coupon?'<div class="sdeal">Code <b>'+esc(p.coupon)+'</b> at checkout</div>':'')+
      '</div><div class="backfoot">'+
        '<button class="buy" type="button" data-sadd="'+ix+'">Add — '+money(p.now,cur)+'</button>'+
        '<button class="turn-back" type="button">↺</button>'+
      '</div></div></div></article>';
  }).join('');

  el.innerHTML='<div class="shell">'+
    '<a class="sbacklink" href="#/">&larr; All stores</a>'+
    '<header class="shero"><p class="eyebrow">'+esc(cfg.eyebrow)+'</p>'+
      '<h1>'+esc(cfg.headline)+'</h1><p class="sblurb">'+esc(cfg.blurb)+'</p>'+
      '<div class="sstats"><div><b>'+mine.length+'</b><span>products</span></div>'+
        '<div><b>'+inStock+'</b><span>in stock</span></div>'+
        (lo?'<div><b>'+money(lo,cur)+(hi>lo?'–'+money(hi,cur):'')+'</b><span>price range</span></div>':'')+
      '</div>'+
      (cfg.coupon&&cfg.off>0
        ? '<div class="sdeal">Prices shown include <b>'+Math.round(cfg.off*100)+
          '% off</b> — enter <b>'+esc(cfg.coupon)+'</b> at checkout</div>':'')+
    '</header><div class="grid">'+cards+'</div>'+
    '<footer class="sfoot">'+
      '<button class="btn" data-addall="'+esc(key)+'">Add everything in stock to cart</button>'+
      '<button class="btn" data-storefilter="'+esc(key)+'">See '+esc(st.name)+' in the market</button>'+
      '<p>'+esc(cfg.note||'')+' Add what you want, then check out at '+esc(st.name)+
      ' from your cart — it arrives filled. We earn a commission on purchases '+
      'made through this page. It never changes your price.</p>'+
    '</footer></div>';
}

/* ============================================================
   LOAD
   ============================================================ */
function skeleton(){var h='';for(var i=0;i<12;i++)h+='<div class="sk"></div>';
  document.getElementById('mount').innerHTML='<div class="skel">'+h+'</div>';}

function ingest(items){
  ALL=items;
  PGROUPS=buildGroups(ALL);
  GROUPS={}; PGROUPS.forEach(function(g){
    var k=nk(g.brand); (GROUPS[k]=GROUPS[k]||[]).push(g); });
  computeBestUnits();
  var sl=document.getElementById('spotLink');
  if(sl) sl.hidden = !ALL.some(function(i){return SPOTLIGHT[i.key];});
  /* The cart renders on boot, before the API has returned, so SMAP is
     still the inline fallback and any store missing from it fell back
     to showing its KEY — "Checkout at eightvape" rather than
     "EightVape". Re-render now that the real registry is in. */
  renderCart(); badges();
  facets(); heroStats(); stamp(); route();
}
function facets(){ refreshFacets(); renderStoreList(); }

function failed(msg){
  CONN='Backend said: '+msg;
  if(SEED.length && !ALL.length){
    var seeded=SEED.filter(function(it){return !!SMAP[it.key];})
      .map(function(it,i){it.id=it.id||(it.key+'-s'+i);it.seeded=true;return it;});
    var sk={}; seeded.forEach(function(it){sk[it.key]=1;});
    SRC={live:0,seeded:Object.keys(sk).length};
    ingest(seeded); return;
  }
  var setup=/SHEET_ID|spreadsheet id|no sheet yet/i.test(msg);
  document.getElementById('mount').innerHTML='<div class="state"><b>'+
    (setup?'Not connected to your catalogue yet':'Can’t load products right now')+'</b>'+
    (setup?'Set <code>SHEET_ID</code> in <code>Code.gs</code>, then run <code>diagnose()</code>.'
          :esc(msg))+'</div>';
  document.getElementById('rcount').textContent='';
}

/* The API ships rows slim: falsy fields are omitted, `id` and `aff`
   are dropped entirely because both are pure functions of data already
   present, and a few names are shortened. Rehydrate here so nothing
   downstream has to know. */
function hydrate(it){
  var st=SMAP[it.k]||{};
  var url=it.url||'';
  return {
    id: it.k+'-'+(it.vid||url),
    key: it.k,
    dept: it.dept||st.dept||'',
    brand: it.brand||st.name||'',
    title: it.title||'',
    variant: it.variant||'',
    strength: it.strength==null?'':it.strength,
    puffs: it.puffs==null?'':it.puffs,
    price: it.price||'',
    compareAt: it.compareAt||'',
    available: !it.oos,
    tobacco: !!it.tobacco,
    image: it.image||'',
    url: url,
    currency: it.cur||'USD',
    desc: it.desc||'',
    vid: it.vid||'',
    pid: it.pid||'',        /* Woo variable parent */
    attrs: it.attrs||'',    /* attribute_flavor=White+Gummy */
    markets: it.markets||'',
    aff: (url && st.ref) ? url+(url.indexOf('?')>-1?'&':'?')+'ref='+st.ref
       : (url || (st.domain?'https://'+st.domain+'/':''))
  };
}

function received(res){
  if(!res){failed('No response');return;}
  /* Code.gs is the source of truth for the store list; the inline copy
     is only a fallback so the page renders if the API is down. */
  if(res.stores && res.stores.length){
    STORES = res.stores;
    SMAP = {}; STORES.forEach(function(s){ SMAP[s.key]=s; });
  }
  if(res.ok===false){failed(res.error||'Unknown error');return;}

  META=res.meta||META; UPDATED=res.updated||UPDATED;
  BYDEPT=res.byDept||BYDEPT;

  /* Live FX if the API ever sends it, otherwise the dated table in FX_USD.
     Only accepted with a usable rates object, so a malformed payload
     falls back rather than emptying the yardstick. */
  var fx=res.fx||(res.meta&&!Array.isArray(res.meta)&&res.meta.fx)||null;
  if(fx&&fx.rates&&typeof fx.rates==='object'&&fx.rates.USD) FXR=fx;

  var live=(res.items||[])
    .filter(function(it){ return !!SMAP[it.k]; })
    .map(hydrate);
  var dropped=live.filter(function(it){return !it.available;}).length;
  if(dropped) CONN=dropped.toLocaleString()+' out-of-stock rows hidden';

  var liveKeys={}; live.forEach(function(it){liveKeys[it.key]=1;});
  var filled=SEED.filter(function(it){return SMAP[it.key] && !liveKeys[it.key];});
  filled.forEach(function(it,i){ it.id=it.id||(it.key+'-s'+i); it.seeded=true; });

  var merged=live.concat(filled);
  SRC={live:Object.keys(liveKeys).length, seeded:0};
  var sk={}; filled.forEach(function(it){sk[it.key]=1;});
  SRC.seeded=Object.keys(sk).length;

  if(!merged.length && !ALL.length){
    CONN='API reached OK but returned no products.'; apply(); return;
  }
  ingest(merged);
}

/* ------------------------------------------------------------
   PROGRESSIVE LOAD
   ------------------------------------------------------------
   EightVape alone is ~6,000 rows once its 4,925 variations are in, so
   waiting for one payload before painting anything is a bad trade.

   Instead: fetch the manifest first (a few KB — store list, per-dept
   counts, refresh report) and render the chrome from it immediately,
   then pull the departments in parallel and merge each as it lands.
   The shelf you are looking at is requested first.
   ------------------------------------------------------------ */
var BYDEPT={}, LOADED={};

function mergeDept(res){
  if(!res || res.ok===false) return;
  var add=(res.items||[]).filter(function(it){ return !!SMAP[it.k]; }).map(hydrate);
  if(!add.length) return;
  var seen={}; ALL.forEach(function(it){ seen[it.id]=1; });
  add.forEach(function(it){ if(!seen[it.id]){ seen[it.id]=1; ALL.push(it); } });
  LOADED[res.dept||'all']=1;
  ingest(ALL);
}

/* ONE request. This used to fan out into ?summary plus six ?dept=
   calls in parallel, which was an outage waiting to happen and duly
   became one:

     - each is a DIFFERENT URL, so each is its own CDN cache entry
     - each misses the per-instance in-memory cache
     - so each kicks off a full scrape of every store

   Seven concurrent full scrapes, none of which finish inside the
   budget, and the page spins forever. Fetching a single URL means one
   CDN entry and one scrape per s-maxage window, so only the first
   visitor in ten minutes ever waits.

   The real fix is a SHARED cache (Vercel KV, like Legal-Leaf's
   overrides) so no visitor pays for a scrape at all — see CLAUDE.md.
   Until then, one request is the honest trade: slower first paint,
   but a page that actually loads. The slim row shape is what was
   carrying the payload win anyway, not the fan-out. */
function loadCatalogue(){
  var refresh = location.search.indexOf('refresh')>-1;
  fetch(API_URL+(refresh?'?refresh':''),{redirect:'follow'})
    .then(function(r){
      if(!r.ok) throw new Error('API returned HTTP '+r.status);
      return r.json();
    })
    .then(received)
    .catch(function(e){ failed(e.message||'Network error'); });
}

/* boot */
loadLoc(); restoreUserLoc(); locPillUI(); setAgeCopy(); setWarn(); setNotices();
loadSelv(); loadCart(); badges(); accountUI(); setAuthMode('signup'); renderCart();
/* The path picks the opening shelf BEFORE the first render, so /pouches
   opens on Pouches instead of dumping the visitor into Everything. */
F.dept=deptFromPath()||'all'; syncDeptTabs(); setRouteMeta();
skeleton(); renderStoreList(); route();
if(read_('nm_age')==='1' && hasLoc()) closeGate(); else openGate(false);

/* The Apps Script google.script.run branch is gone — this is a static
   page on Vercel and the catalogue comes from api/products.js.
   ?refresh on the page URL bypasses the API cache, which is how you
   check a store fix without waiting out the TTL. */
loadCatalogue();
