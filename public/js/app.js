
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

/* Fallback registry. Code.gs is the source of truth and overwrites
   this at load; this only exists so the page renders if the API is
   down. Add stores in Code.gs, not here. */
var STORES = [
  {key:'snusoclock',name:'Snus O’Clock',dept:'pouch',domain:'snusoclock.com',ref:'nicotinebaby',perPack:20,ships:['EU'],platform:'shopify'},
  {key:'europesnus',name:'Europesnus',dept:'pouch',domain:'europesnus.com',ref:'rjuntxyu',perPack:20,ships:['EU'],platform:'shopify'},
  {key:'nikopouches',name:'NikoPouches.dk',dept:'pouch',domain:'nikopouches.dk',ref:'idtzhxpu',perPack:20,ships:['EU'],platform:'shopify'},
  /* Wave Vape — GoAffPro 10%, WooCommerce. Foger + Geek Bar, the two
     disposable brands most people actually search for. Their cart lives
     at /cart-2/, not /cart/, which is why cartPath exists. */
  {key:'wavevape',name:'Wave Vape',dept:'disposable',domain:'wavevape.shop',ref:'nicotinebaby',
   ships:['US'],platform:'woocommerce',cartPath:'/store/',featured:1,shipFlat:5.99,shipFree:55},
  {key:'vaporesso',name:'Vaporesso',dept:'device',domain:'store.vaporesso.com',ref:'nicotinebaby',featured:1,ships:['US','INTL'],platform:'shopify'},
  {key:'geekvape',name:'Geekvape',dept:'device',domain:'store.geekvape.com',ref:'nicotinebaby',featured:1,ships:['US','INTL'],platform:'shopify'},
  {key:'freemax',name:'Freemax',dept:'device',domain:'www.freemaxvape.com',ref:'nicotinebaby',ships:['US'],platform:'woocommerce'},
  {key:'relxuk',name:'RELX UK',dept:'device',domain:'www.relxvape.co.uk',ref:'nicotinebaby',ships:['UK'],platform:'shopify'},
  {key:'montero',name:'Montero Cigars',dept:'cigar',domain:'monterocigars.com',ref:'nicotinebaby',featured:1,ships:['US'],platform:'shopify'},
  {key:'beardedcigar',name:'Beard Cigars',dept:'cigar',domain:'beardcigars.com',ref:'nicotinebaby',ships:['US'],platform:'bigcommerce'},
  {key:'xifei',name:'XIFEI',dept:'gear',domain:'xifeicigaraccessory.com',ref:'nicotinebaby',ships:['US','INTL'],platform:'shopify'}
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
  if(!st||!st.ships||!st.ships.length) return true;
  var z=zoneOf();
  return st.ships.indexOf(z)>-1 || st.ships.indexOf('INTL')>-1;
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

  var count=parseCount(text);
  if(d.unit==='pouch'){
    var rolls=/rolls?\b/i.test(text)?parseCount(text):null;
    if(rolls) count=rolls*(st.perPack||20);
    else if(!count) count=st.perPack||20;
  }
  if(d.unit==='stick'&&!count) count=1;
  if(!count||count<1) return null;
  return {value:price/count,label:d.unitLabel,count:count};
}

var SEED = [];   /* run exportSeed() in Apps Script and paste here */

var SPOTLIGHT = {
  beardedcigar: {
    eyebrow:'Small-batch cigars', headline:'Beard Cigars',
    blurb:'A deliberately short list. Ten cigars, chosen and blended rather than '+
          'assembled from a catalogue — which is why this page exists instead of '+
          'ten cells in a grid.',
    off:0, coupon:'', note:'Ships from the US. Adults 21+ only.'
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

function variantLabel(it){
  var bits=[];
  var ml=String(it.title||'').match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if(ml) bits.push(ml[1]+' ml');
  var pf=parsePuffs(it.title||'');
  if(pf) bits.push((pf/1000)+'K puffs');
  if(it.strength!==''&&it.strength!=null) bits.push(it.strength+' mg');
  if(it.variant) bits.push(it.variant);
  if(!bits.length){
    var m=String(it.title||'').match(/\b(\d+\s*[- ]?(?:can|pack|ct|count)\w*)\b/i);
    bits.push(m?m[1]:'Standard');
  }
  return bits.join(' · ');
}

var SELV={};
function loadSelv(){ try{SELV=JSON.parse(read_('nm_selv'))||{};}catch(e){SELV={};}
  if(typeof SELV!=='object'||!SELV) SELV={}; }
function saveSelv(){ store_('nm_selv',JSON.stringify(SELV)); }

function buildGroups(items){
  var map={};
  /* A mall only lists what ships today. Out of stock is dropped here
     and nowhere else, so nothing downstream can re-admit it. */
  items.forEach(function(it){
    if(!it.available) return;
    var brand=String(it.brand==null?'':it.brand).trim();
    var flav=flavourOf(brand,it.title)||it.title||'—';
    if(!brand){ brand=flav; flav='—'; }
    var dept=deptOf(it);
    var gid=it.key+'|'+dept+'|'+nk(brand);
    var g=map[gid]||(map[gid]={gid:gid, key:it.key, dept:dept, brand:brand,
                               currency:it.currency||'USD', flavours:{}, order:[]});
    var fk=nk(flav);
    if(!g.flavours[fk]){ g.flavours[fk]={name:flav, image:'', variants:[]}; g.order.push(fk); }
    var f=g.flavours[fk];
    if(!f.image&&it.image) f.image=it.image;
    f.variants.push(it);
  });

  /* A brand-owned store — Vaporesso selling Vaporesso, or Wave Vape's
     34 Foger flavours — puts everything under one brand and collapses
     the catalogue into one card with a 34-entry dropdown. A dropdown is
     a good way to choose between six flavours and a terrible way to
     browse a range. Past this many, the brand splits into one card per
     flavour. */
  var MAX_FLAV=10;

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
    g.title=g.brand;
    delete g.flavours; delete g.order;
    return g;
  }).filter(function(g){ return g.flav.length; });

  var out=[];
  built.forEach(function(g){
    if(g.flav.length<=MAX_FLAV){ out.push(g); return; }
    g.flav.forEach(function(f){
      out.push({ gid:g.gid+'|'+nk(f.name), key:g.key, dept:g.dept,
                 brand:g.brand, currency:g.currency,
                 title:(g.brand+(f.name!=='—'?' '+f.name:'')).trim(),
                 image:f.image, flav:[f], split:1 });
    });
  });
  return out;
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
    var shot=card.querySelector('.shot');
    if(shot&&f.image){
      var img=shot.querySelector('img');
      if(img){ if(img.getAttribute('src')!==f.image){ img.style.opacity=0;
                 img.onload=function(){img.style.opacity=1;}; img.src=f.image; } }
      else shot.insertAdjacentHTML('afterbegin',
        '<img src="'+esc(f.image)+'" alt="'+esc(g.brand+' '+f.name)+'" loading="lazy" referrerpolicy="no-referrer">');
    }
    var ssel=card.querySelector('.vsel.str');
    if(ssel) ssel.innerHTML=strengthOptions(f,s.v);
    var pr=card.querySelector('.cprice');
    if(pr) pr.innerHTML=priceHtml(it,cur,off,u,best);
    var buy=card.querySelector('.buy');
    if(buy) buy.textContent='Add to cart — '+(money(it.price,cur)||'see store');
    var h4=card.querySelector('.back h4');
    if(h4) h4.textContent=g.brand+(f.name!=='—'?' '+f.name:'');
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
var BESTUNIT={};   /* dept -> cheapest unit value seen, per currency */

var F={q:'',dept:'all',store:'all',brand:'all',strength:'all',price:'all',
       sort:'unit',deals:false,instock:false,stores:{},brands:{}};

/* The gold unit chip means "cheapest on the whole site for this
   department", not "cheapest of this brand". Currencies are kept apart
   because converting them would be a made-up number. */
function computeBestUnits(){
  BESTUNIT={};
  PGROUPS.forEach(function(g){
    var d=deptOf(g);
    gvariants(g).forEach(function(v){
      var u=unitPrice(v); if(!u) return;
      var k=d+'|'+(v.currency||'USD');
      if(BESTUNIT[k]==null||u.value<BESTUNIT[k]) BESTUNIT[k]=u.value;
    });
  });
}
function isBestUnit(g,u){
  if(!u) return false;
  var it=gitem(g), k=deptOf(g)+'|'+(it.currency||'USD');
  var b=BESTUNIT[k];
  return b!=null && u.value<=b*1.0001;
}

function priceHtml(it,cur,off,u,best){
  var p=money(it.price,cur);
  return (p?'<b>'+p+'</b>':'<span class="noprice">Price at store</span>')+
    (off?'<s>'+money(it.compareAt,cur)+'</s>':'')+
    (u?'<span class="unitchip'+(best?' best':'')+'">'+unitFmt(u.value,cur)+
       ' <span class="u">'+esc(u.label)+'</span></span>':'');
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
            ? '<select class="vsel flav" aria-label="Choose flavour" data-flav="'+gid+'">'+flavOpts+'</select>'
            : '')+
          (nStr>1||!hasFlav
            ? '<select class="vsel str" aria-label="Choose option" data-str="'+gid+'">'+
              strengthOptions(f,s.v)+'</select>'
            : '<div class="cvar">'+esc(variantLabel(it))+'</div>')+
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
      '<div class="backin">'+
        '<div class="bstore">'+esc(st.name||g.key)+'</div>'+
        '<h4>'+esc(g.split?g.title:(g.brand+(f.name!=='—'?' '+f.name:'')))+'</h4>'+
        (desc?'<p class="bdesc">'+esc(desc)+'</p>'
             :'<p class="bdesc dim">No description published for this one.</p>')+
        '<dl class="bspec">'+
          '<dt>Department</dt><dd>'+esc(d.label||'—')+'</dd>'+
          '<dt>Brand</dt><dd>'+esc(g.brand)+'</dd>'+
          (hasFlav?'<dt>Flavours</dt><dd>'+nFlav+'</dd>':'')+
          (deptOf(g)==='disposable'&&u?'<dt>Puffs</dt><dd>'+u.count.toLocaleString()+'</dd>'
            :'<dt>Strengths</dt><dd>'+strengthList(allV)+'</dd>')+
          (u?'<dt>Unit price</dt><dd>'+unitFmt(u.value,cur)+' '+esc(u.label)+'</dd>':'')+
          (nStores>1?'<dt>Also at</dt><dd>'+(nStores-1)+' other store'+(nStores>2?'s':'')+'</dd>':'')+
          (it.markets?'<dt>Available in</dt><dd>'+
            esc(String(it.markets).replace('ROW','rest of world').replace('INTL','worldwide').split(',').join(' + '))+
            '</dd>':'')+
        '</dl>'+
      '</div>'+
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
  if(reset!==false)PAGE=0;
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
      /* Currencies are not converted, so they are grouped rather than
         interleaved — a £ figure beating a $ figure would be fiction. */
      var ca=ia.currency||'USD', cb=ib.currency||'USD';
      if(ca!==cb) return ca<cb?-1:1;
      var ua=unitPrice(ia),ub=unitPrice(ib);
      return (ua?ua.value:1e9)-(ub?ub.value:1e9);
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

  renderRail(); refreshFacets(); setWarn(); setNotices(); saveSelv();
}

function renderRail(){
  var sec=document.getElementById('railsec');
  var pick=VIEW.filter(function(g){var i=gitem(g);return unitPrice(i)&&i.available;}).slice(0,10);
  if(pick.length<4){sec.hidden=true;return;}
  sec.hidden=false;
  var d=F.dept!=='all'?DEPTS[F.dept]:null;
  document.getElementById('railTitle').textContent=
    d?('Best '+(d.unitLabel||'value')+' right now'):'Best value right now';
  document.getElementById('railSub').textContent=
    d?('cheapest '+(d.unitLabel||'')+' we can find'):'cheapest per pouch, per 1k puffs, per ml and per stick';
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
function logoFor(st){
  if(st.logo) return st.logo;
  return 'https://www.google.com/s2/favicons?sz=128&domain='+encodeURIComponent(st.domain||'');
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

function heroStats(){
  var el=document.getElementById('heroStats'); if(!el) return;
  var stores={}, best=null, bestCur='USD';
  PGROUPS.forEach(function(g){ stores[g.key]=1; });
  PGROUPS.forEach(function(g){
    if(deptOf(g)!=='pouch') return;
    var u=unitPrice(gitem(g)); if(!u) return;
    if(best==null||u.value<best){ best=u.value; bestCur=gitem(g).currency||'USD'; }
  });
  var bits=[
    '<div><b>'+ALL.length.toLocaleString()+'</b><span>products tracked</span></div>',
    '<div><b>'+Object.keys(stores).length+'</b><span>stores compared</span></div>'
  ];
  if(best!=null) bits.push('<div><b>'+unitFmt(best,bestCur)+'</b><span>cheapest pouch</span></div>');
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
                image:it.image||'', url:it.url||'', vid:it.vid||'', aff:it.aff||it.url||''};
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
function checkoutUrl(st, items){
  var base='https://'+st.domain;
  if(st.platform==='shopify'){
    var parts=items.filter(function(x){return x.vid;})
                   .map(function(x){return encodeURIComponent(x.vid)+':'+x.qty;});
    if(parts.length) return base+'/cart/'+parts.join(',')+
      (st.coupon?('?discount='+encodeURIComponent(st.coupon)):'');
    return st.coupon ? base+'/discount/'+encodeURIComponent(st.coupon)+'?redirect=/cart'
                     : base+'/cart';
  }
  if(st.platform==='woocommerce' && items[0] && items[0].vid){
    var path=st.cartPath||'/cart/';
    return base+path+(path.indexOf('?')>-1?'&':'?')+'add-to-cart='+
           encodeURIComponent(items[0].vid)+'&quantity='+items[0].qty+
           '&ref='+encodeURIComponent(st.ref||'');
  }
  return items[0] ? (items[0].aff||items[0].url) : base+'/?ref='+(st.ref||'');
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
    html+='<div class="dgroup"><h3>'+esc(st.name)+'</h3>'+rows+bd+
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
  b.setAttribute('aria-pressed','true'); F.dept=b.getAttribute('data-dept'); apply();});
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
  apply();});

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

function renderSpotlight(key){
  var cfg=SPOTLIGHT[key], st=SMAP[key]||{name:key,domain:''};
  var mine=ALL.filter(function(i){return i.key===key;});
  var el=document.getElementById('spotview');
  if(!ALL.length){ el.innerHTML='<div class="shell"><div class="state"><b>Loading…</b></div></div>'; return; }
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

function received(res){
  if(!res){failed('No response');return;}
  /* Code.gs is the source of truth for the store list; the inline copy
     is only a fallback so the page renders if the API is down. */
  if(res.stores && res.stores.length){
    STORES = res.stores;
    SMAP = {}; STORES.forEach(function(s){ SMAP[s.key]=s; });
  }
  if(res.ok===false){failed(res.error||'Unknown error');return;}

  /* Normalise types once, here. Sheets returns numbers for
     numeric-looking cells — a brand called "77" is a real Snus O'Clock
     line — and one unexpected type used to take the whole render down.
     `available`, `tobacco` and `strength` stay untouched: they are
     booleans and numbers on purpose. */
  var dropped=(res.items||[]).filter(function(it){return !it.available;}).length;
  if(dropped) CONN=dropped.toLocaleString()+' out-of-stock rows hidden';
  var live=(res.items||[]).map(function(it){
    ['key','dept','brand','title','variant','price','compareAt','image','url',
     'currency','desc','vid','aff','markets'].forEach(function(f){
       it[f]=(it[f]==null?'':String(it[f])); });
    return it;
  }).filter(function(it){return !!SMAP[it.key];});
  var liveKeys={}; live.forEach(function(it){liveKeys[it.key]=1;});
  var filled=SEED.filter(function(it){return SMAP[it.key] && !liveKeys[it.key];});

  var merged=live.concat(filled).map(function(it,i){
    it.id=it.id||(it.key+'-'+i);
    if((!it.dept||!DEPTS[it.dept])&&SMAP[it.key]) it.dept=SMAP[it.key].dept;
    it.seeded=!liveKeys[it.key];
    return it;});

  META=res.meta||[]; UPDATED=res.updated||null;
  var sk={}; filled.forEach(function(it){sk[it.key]=1;});
  SRC={live:Object.keys(liveKeys).length, seeded:Object.keys(sk).length};
  if(!merged.length){ CONN='API reached OK, but the Inventory sheet is empty.'; apply(); return; }
  ingest(merged);
}

/* boot */
loadLoc(); restoreUserLoc(); locPillUI(); setAgeCopy(); setWarn(); setNotices();
loadSelv(); loadCart(); badges(); accountUI(); setAuthMode('signup'); renderCart();
skeleton(); renderStoreList(); route();
if(read_('nm_age')==='1' && hasLoc()) closeGate(); else openGate(false);

/* One loader. The Apps Script google.script.run branch is gone — this
   is a static page on Vercel now and the catalogue comes from the
   serverless function in api/products.js.

   ?refresh on the page URL is passed through to bypass the API's cache,
   which is how you check a store fix without waiting out the TTL. */
(function(){
  var qs = (location.search.indexOf('refresh') > -1) ? '?refresh' : '';
  fetch(API_URL + qs, {redirect:'follow'})
    .then(function(r){
      if(!r.ok) throw new Error('API returned HTTP ' + r.status);
      return r.json();
    })
    .then(received)
    .catch(function(e){ failed(e.message || 'Network error'); });
})();
