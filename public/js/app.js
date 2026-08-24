
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
               warn:'<b>Cigar smoking</b> can cause cancers of the mouth and throat, even if you do not inhale. <em>Shown voluntarily, federal cigar warning rules were vacated and are not enforced.</em>'},
  gear:       {label:'Gear & Accessories', unit:'flat', unitLabel:'',
               accent:'var(--gear)',
               warn:'<b>Accessories.</b> Age 21+ still applies. Items containing nicotine are on the other shelves.'}
};
var DEPT_ORDER = ['pouch','disposable','device','liquid','cigar','gear'];

/* ============================================================
   FALLING LEAVES — the animated backdrop
   ------------------------------------------------------------
   Spawned here rather than hand-authored in HTML/CSS: randomised
   size/speed/drift/colour per leaf is what makes "a lot of leaves,
   blustery day" read as weather rather than a handful of repeating
   copies. Each leaf is one SVG element with a plain CSS animation —
   this only runs once, on load, never per frame, so a few dozen of
   them cost nothing at runtime. Reduced motion is handled by the
   sitewide `*{animation-duration:.001ms!important}` rule in app.css;
   nothing extra needed here.

   Two shapes: #leafIcon (the house mark, its own fixed palette) and
   #leafFall (a plainer silhouette, fill="currentColor" so it can be
   recoloured per instance) — reusing one shape for every leaf reads
   as a decoration; mixing two, one of them tinted across the site's
   own autumn hues, reads as an actual pile of different leaves.

   Biased toward the OUTER thirds of the viewport, not spread evenly
   0-100%. The center column is `.shell`-width opaque content almost
   everywhere on the page (header, the shop-by strip, the cards) — a
   leaf spawned at left:50% is behind a card for its entire fall and
   is never actually seen. The margins outside .shell are the one
   strip nothing else ever paints over, so that is where "prominent"
   actually has to live. */
var LEAF_HUES=['var(--gold)','var(--ember)','var(--cigar)','#c8862a','var(--red)','var(--sage-dk)'];
/* The `dense` variant went with the hero — it was the only caller, and
   its .fleaf-hero keyframes are gone from the stylesheet with it. What
   is left is the one sitewide pass over .bgscape.

   leafLeft() actually applies the "biased toward the outer thirds" bias
   the comment above promises — 70% of leaves land in the outer 15% band
   on either side, where nothing else on the page ever paints over them;
   the rest scatter across the middle for the gaps between cards. */
function leafLeft(){
  if(Math.random()<0.7){
    var band=Math.random()*15;
    return (Math.random()<0.5?band:100-band).toFixed(2);
  }
  return (Math.random()*100).toFixed(2);
}
function spawnLeaves(container, count){
  if(!container) return;
  var frag=document.createDocumentFragment();
  for(var i=0;i<count;i++){
    var useFall=Math.random()<0.55;
    var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox', useFall?'0 0 40 56':'0 0 60 72');
    svg.setAttribute('class','fleaf');
    var use=document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href', useFall?'#leafFall':'#leafIcon');
    svg.appendChild(use);

    var sz=24+Math.random()*46;
    var dur=14+Math.random()*15;
    var delay=-Math.random()*dur;               /* negative: starts mid-fall, not all at once */
    var drift=(Math.random()<0.5?-1:1)*80*(0.6+Math.random()*0.8);
    var spin=(Math.random()<0.5?-1:1)*(220+Math.random()*280);
    var left=leafLeft();
    var op=(0.26+Math.random()*0.22).toFixed(2);

    svg.style.cssText=
      '--l:'+left+'%;--sz:'+sz.toFixed(0)+'px;'+
      '--drift:'+drift.toFixed(0)+'px;--spin:'+spin.toFixed(0)+'deg;'+
      'opacity:'+op+';animation-duration:'+dur.toFixed(1)+'s;animation-delay:'+delay.toFixed(1)+'s'+
      (useFall?(';color:'+LEAF_HUES[Math.floor(Math.random()*LEAF_HUES.length)]):'');
    frag.appendChild(svg);
  }
  container.appendChild(frag);
}

/* ============================================================
   SUBCATEGORIES
   ------------------------------------------------------------
   The shelf below the shelf. api/products.js assigns `sub` from the
   title; this is only the ordering and the wording a shopper reads.

   Order is deliberate — the thing most people came for goes first, and
   the accessories that are not the product go last. "Devices & Pods"
   was the department that most needed this: a replacement coil and a
   200W mod are not the same purchase and were sharing one shelf.
   ============================================================ */
var SUBS = {
  pouch: [['nicotine','Nicotine pouches'],['snus','Snus'],['lozenge','Lozenges'],
          ['chew','Chew'],['energy','Energy & caffeine']],
  disposable: [['vape','Disposable vapes'],['prefilled','Prefilled pods']],
  device: [['kit','Kits & devices'],['mod','Mods & batteries'],['pod','Pods & cartridges'],
           ['tank','Tanks & atomisers'],['coil','Coils'],['accessory','Accessories']],
  liquid: [['eliquid','E-liquid'],['shortfill','Shortfills'],['salt','Nic salts']],
  /* "Cigarillos", not "Cigarillos & little cigars" — the shelf is
     cigarillos. The classifier in api/products.js still MATCHES "little
     cigars" and "small cigars", because that is how some vendors title
     them and those rows belong here; it is only the label that changes. */
  cigar: [['premium','Cigars'],['cigarillo','Cigarillos'],
          ['pipe','Pipe tobacco'],['rolling','Tubes & rolling'],['sampler','Samplers']],
  gear: [['wraps','Wraps & papers'],['cutter','Cutters & punches'],['lighter','Lighters & torches'],
         ['humidor','Humidors & humidity'],['case','Cases & stands'],['ashtray','Ashtrays'],
         ['pipe','Pipe accessories'],['tool','Tools'],['accessory','Other accessories']]
};
function subLabel(dept,key){
  var l=(SUBS[dept]||[]).filter(function(p){ return p[0]===key; })[0];
  return l?l[1]:key;
}
function subOf(x){ return (x&&x.sub)||''; }
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
   api/products.js, then mirror them here — never only here.

   Falsy fields are omitted rather than written out, which is why `only`
   appears once.

   `click` — the affiliate wrapper template for the Impact and CJ stores
   — is deliberately absent, and this path is therefore UNATTRIBUTED, as
   it already is for Nicokick's CJ ids. It only bites in one narrow
   case: the API is down AND a cart saved earlier is checked out now.
   Copying the template here would close that, and it would also be a
   second copy of a value whose whole design is that it lives in exactly
   one place — api/products.js §IMPACT — so it is the kind of copy that
   is right the day it is written and wrong three edits later. If you do
   mirror it, mirror the FINISHED template (with the `{url}` hole), and
   expect to keep it in step by hand.

   The durable fix, if this ever matters commercially, is to stop
   hand-writing this list: cache the last good publicStores() payload in
   localStorage and fall back to THAT, which fixes every stale field
   here at once rather than one field at a time. */
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
  /* Impact. `ref` empty for the wrapping-network reason; `ageCheck`
     unverified because their policy has not been read. */
  {key:'gotpouches',name:'GotPouches',dept:'pouch',domain:'gotpouches.com',
   ref:'',ships:['US'],guess:1,perPack:15,platform:'shopify',
   from:'US',days:'1–3 days',ageCheck:'unknown'},

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
  /* No `platform`: the storefront has not been opened yet, so nothing
     establishes one and a wrong pin costs a working door. Upstream note
     explains how to settle it. CHECKOUT_CAP has no entry for '', so the
     drawer correctly offers to open the item rather than promise a
     basket it cannot fill. */
  {key:'vapecouk',name:'VAPE.CO.UK',dept:'liquid',domain:'vape.co.uk',
   ref:'',ships:['UK'],guess:1,perPack:20,
   from:'GB',days:'next day',ageCheck:'unknown'},
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
  FR: { pouch:['banned','France banned nicotine pouches on 1 April 2026 under Decree n°2025-898. It is the strictest ban in Europe, manufacture, sale, import, possession and use are all prohibited, not just retail. We will not link you to them.'],
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
             detail:'This store publishes no age verification at its checkout.'},
  /* "We have not read their policy" is not the same claim as "they
     publish nothing", and printing the second when we mean the first
     is the exact error §7b exists to prevent — in the direction that
     flatters us, since `none` at least warns. A store whose policy
     nobody has read yet says so. */
  unknown:  {label:'Age check unverified', tone:'soft',
             detail:'We have not been able to read this store’s own age policy yet, '+
                    'so we cannot tell you what it checks. Assume nothing and look at '+
                    'their checkout.'}
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
/* Subcategories whose honest unit is NOT their department's.

   Pipe tobacco sits on the cigar shelf and is sold by WEIGHT — a 2oz
   tin is not "a stick" — so per-stick pricing on 408 rows was the same
   fault as the $199 humidor rendering "$199.00 per stick" that made
   CLAUDE.md §6 create the gear shelf. Tubes and rolling papers are
   counted in hundreds and are not sticks either. No unit is better than
   an invented one: these fall back to flat price. */
var FLAT_SUBS={'cigar/pipe':1,'cigar/rolling':1};

function unitPrice(it){
  var st=SMAP[it.key]||{}, d=DEPTS[deptOf(it)];
  var price=Number(it.price);
  if(!price||!d||d.unit==='flat') return null;
  if(FLAT_SUBS[deptOf(it)+'/'+subOf(it)]) return null;
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
    /* Eyebrow names the STORE. It read "US nicotine pouches", which made
       this look like the site's complete US pouch shelf. It is one
       store's range, and other stores in the registry carry US pouches
       that never appear on this page. */
    eyebrow : 'Store spotlight · Nicokick',
    headline: 'Every pouch America’s actually buying',
    blurb   : 'ZYN, on!, VELO and Rogue are owned by Swedish Match, Altria, BAT '+
              'and Turning Point, and none of them sell to you directly. Nicokick '+
              'carries all four plus the challengers, and every can here is '+
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
/* Subcategory is part of the key. Without it a store's "XROS Kit" and
   "XROS Replacement Pod" share a leading token, group by brand, and
   collapse onto one card — a device and its consumable behind the same
   dropdown, which is exactly the split this shelf needed. */
function groupKeyFor(it){
  var dept=deptOf(it);
  var brand=String(it.brand==null?'':it.brand).trim();
  var sub=subOf(it);
  if(it.variant) return it.key+'|'+dept+'|'+sub+'|t:'+nk(it.title);
  return it.key+'|'+dept+'|'+sub+'|b:'+nk(brand||it.title);
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
    var flav=it.variant || flavourOf(brand,it.title) || it.title || '-';
    /* WITH NO BRAND, FALL BACK TO THE TITLE — NOT THE VARIANT.
       This used to take `flav`, which is the variant when the store
       supplies one, so a row with no brand was labelled "20MG",
       "0.8ohm" or "Blue Razz Ice". Those are specs and flavours, and
       they went on to fill the brand pills and the logo strip. The
       product's own title is at least a truthful name for itself.
       Grouping is unaffected: groupKeyFor() already falls back to the
       title for a brandless row. */
    if(!brand){ brand=it.title||flav; flav=it.variant||'-'; }
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
      esc(variantLabel(v))+', '+money(v.price,v.currency)+'</option>';
  }).join('');
}
function strengthList(vars){
  var mg={};
  vars.forEach(function(v){ if(v.strength!==''&&v.strength!=null) mg[v.strength]=1; });
  var k=Object.keys(mg).sort(function(a,b){ return a-b; });
  return k.length ? k.join(', ')+' mg' : '-';
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
  var hasFlav=!g.split&&(g.flav.length>1||(g.flav[0]&&g.flav[0].name!=='-'));

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
      var zoomBtn=shot.querySelector('.zoom');
      var alt=g.brand+(f.name&&f.name!=='-'?' '+f.name:'');
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
        /* keep the zoom button pointed at whatever photo is now showing —
           switching flavour/strength swaps the image but this element
           otherwise never gets touched */
        if(zoomBtn){ zoomBtn.setAttribute('data-zoom',src); zoomBtn.setAttribute('data-zoomalt',alt); }
        else shot.insertAdjacentHTML('beforeend',zoomBtnHtml(src,alt));
      }else if(img){
        img.parentNode.removeChild(img);
        if(zoomBtn) zoomBtn.parentNode.removeChild(zoomBtn);
        shot.insertAdjacentHTML('afterbegin','<div class="shot-empty">No photo</div>');
      }
    }
    /* Whole element, not just a select's options — the chosen flavour
       decides whether this is a strength SELECT or a static one-variant
       line, and switching flavours can flip between the two shapes. */
    var c2=card.querySelector('.cselect2');
    if(c2) c2.innerHTML=secondSelectHtml(g,f,s,it,esc(g.gid),hasFlav);
    var pr=card.querySelector('.cprice');
    if(pr) pr.innerHTML=priceHtml(it,cur,off,u,best);
    var buy=card.querySelector('.buy');
    if(buy) buy.textContent='Add to cart, '+(money(it.price,cur)||'see store');
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
/* the same door, opened from the reach notice */
document.addEventListener('click',function(e){
  if(e.target.closest&&e.target.closest('[data-shipto]')) openGate(true);
});

function locPillUI(){
  var el=document.getElementById('locVal');
  if(el) el.textContent=locLabel();
  var p=document.getElementById('locPill');
  if(p) p.classList.toggle('unset',!hasLoc());
}
function setAgeCopy(){
  var a=minAge();
  var t=document.getElementById('gt'); if(t) t.innerHTML='Are you <em>'+a+'</em><br>or older?';
  /* No !disabled guard here: on first open the button IS disabled until a
     country/state is chosen, which froze this label at "Yes, I'm 18+" while
     the headline above it already said 21 (US audit finding N1). */
  var y=document.getElementById('gyes'); if(y) y.textContent="Yes, I'm "+a+'+';
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
/* Brands that are real, judged ONCE against the whole catalogue.
   The brand strip used to decide this from the filtered view instead, with
   `counts[b] > 1`. That silently broke the moment a filter narrowed things:
   selecting Nicokick collapses its 409 rows into 16 product groups, so every
   brand it carries lands on a count of exactly 1, the whole list is thrown
   away and the strip hides itself. ZYN, VELO, Rogue and on! all vanished
   behind the one retailer that stocks them.
   The guard is still needed, because one-off junk does reach the brand slot
   ("Pouch", "Christmas", "Better"), so it now asks the catalogue rather than
   the current view. */
var BRANDOK={};
var CONN='',META=[],SRC={live:0,seeded:0},UPDATED=null;
var BESTUNIT={};   /* dept -> cheapest unit value ON THE SITE, in USD */

/* `subs` is a SET, keyed "dept/sub", not a single value. Multi-select
   because that is what a facet is, and department-qualified because the
   keys collide otherwise: `pipe` is both pipe tobacco and pipe
   accessories, `accessory` is both a device part and a cigar tool.

   `depts` is a SET too, same shape as `stores`/`brands` — empty means
   unrestricted (every department), same as those two. Department used
   to be F.dept, a single string with 'all' standing for unrestricted;
   the boot default is now a curated two-department mix rather than one
   shelf or everything, which a single value can't express. soleDept()
   below is what everything that only makes sense for ONE department
   (a hero image, an SEO title, a legal ban, the /department path)
   reads instead — it answers '' unless exactly one is selected, and
   those callers already had an 'all'-shaped fallback for that case. */
var F={q:'',depts:{},subs:{},store:'all',brand:'all',strength:'all',price:'all',
       sort:'unit',deals:false,stores:{},brands:{}};
function soleDept(){
  var ks=Object.keys(F.depts);
  return ks.length===1 ? ks[0] : '';
}

/* A subcategory chosen on one shelf is meaningless on another, so
   switching department keeps only the keys that still belong. */
function pruneSubs(dept){
  if(dept==='all') return F.subs;
  var out={};
  Object.keys(F.subs).forEach(function(k){
    if(k.indexOf(dept+'/')===0) out[k]=1;
  });
  return out;
}

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
  var hasFlav=!g.split && (nFlav>1||(g.flav[0]&&g.flav[0].name!=='-'));
  var peers=GROUPS[nk(g.brand)]||[];
  var nSt={}; peers.forEach(function(x){ nSt[x.key]=1; });
  var nStores=Object.keys(nSt).length||1;
  var desc=String(it.desc==null?'':it.desc).trim();
  var approx=u?usdApprox(u.value,cur):'';

  return '<div class="bstore">'+esc(st.name||g.key)+'</div>'+
    '<h4>'+esc(g.split?g.title:(g.brand+(f.name!=='-'?' '+f.name:'')))+'</h4>'+
    (desc?'<p class="bdesc">'+esc(desc)+'</p>'
         :'<p class="bdesc dim">No description published for this one.</p>')+
    '<dl class="bspec">'+
      '<dt>Department</dt><dd>'+esc(d.label||'-')+'</dd>'+
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

/* Magnifier-plus, matching the header search icon's stroke style. Built
   once and reused everywhere a .zoom button is rendered (the shelf grid,
   the rail, brand spotlights via card(), and store spotlights). */
var ZOOM_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '+
  'stroke-linecap="round"><circle cx="10" cy="10" r="6"/><path d="M20 20l-4.5-4.5"/>'+
  '<path d="M10 7v6M7 10h6"/></svg>';
function zoomBtnHtml(src,alt){
  return '<button class="zoom" type="button" data-zoom="'+esc(src)+'" data-zoomalt="'+esc(alt)+
    '" aria-label="View full image">'+ZOOM_ICON+'</button>';
}

/* The second control under Flavour: a strength/size SELECT when the
   chosen flavour has more than one variant, otherwise a static line
   naming the one it has. Which shape applies depends on the SELECTED
   flavour, not the group, so switching flavours can flip between them —
   a flavour with 5 strengths next to one sold in only one. Shared by
   card() and refreshCard() so a flavour change updates this correctly —
   wrapped in one element in the markup so a static line can be swapped
   for a live select and back, not just have its own text refreshed. */
function secondSelectHtml(g,f,s,it,gid,hasFlav){
  var nStr=f.variants.length;
  return (nStr>1||!hasFlav)
    ? '<label class="sellabel'+(hasFlav?'':' first')+'">'+esc(optionNoun(deptOf(g)))+'</label>'+
      '<select class="vsel str" aria-label="Choose '+esc(optionNoun(deptOf(g)).toLowerCase())+
      '" data-str="'+gid+'">'+strengthOptions(f,s.v)+'</select>'
    : '<div class="cvar">'+esc(optionLabel(it))+'</div>';
}

function card(g){
  var st=SMAP[g.key]||{name:g.key,dept:g.dept};
  var d=DEPTS[deptOf(g)]||{};
  var s=gsel(g), f=g.flav[s.f], it=gitem(g), cur=it.currency;
  var u=unitPrice(it), best=isBestUnit(g,u);
  var allV=gvariants(g);
  var nFlav=g.flav.length, nStr=f.variants.length;
  var hasFlav=!g.split && (nFlav>1||(g.flav[0]&&g.flav[0].name!=='-'));
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
        (f.image?'<img src="'+esc(f.image)+'" alt="'+esc(g.brand+' '+f.name)+'" loading="lazy" referrerpolicy="no-referrer">'+
                zoomBtnHtml(f.image,g.brand+' '+f.name)
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
            ? '<label class="sellabel first">Flavour</label>'+
              '<select class="vsel flav" aria-label="Choose flavour" data-flav="'+gid+'">'+flavOpts+'</select>'
            : '')+
          '<span class="cselect2">'+secondSelectHtml(g,f,s,it,gid,hasFlav)+'</span>'+
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
        '<button class="buy" type="button" data-add="'+gid+'">Add to cart, '+
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
  /* The "Ships today" toggle is gone — it filtered on `available`, which
     is a stock flag and not a dispatch promise, so it was answering a
     question it could not actually answer. Out-of-stock rows still carry
     their own badge on the card. */
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
  if(skip!=='dept' && Object.keys(F.depts).length && !F.depts[deptOf(g)]) return null;
  /* Sitewide now: the chips work on the combined shelf as well as inside
     a department, so you can hold "Coils" and "Nic salts" at once
     without first choosing a shelf. Empty set means no constraint. */
  if(skip!=='sub'){
    var ps2=Object.keys(F.subs);
    if(ps2.length && !F.subs[deptOf(g)+'/'+subOf(gitem(g))]) return null;
  }
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
  /* NO SHELF LEADS THE GRID. Pouches used to be pinned above everything
     else on the combined shelf, whatever the sort — the argument being
     that per-pouch pricing is what the site is for, so the flagship
     shelf belongs above the fold.

     The rails already make that argument, and better: "Best per pouch
     right now" is a pouch shelf by name, sitting directly above this
     grid. Pinning here meant the grid underneath repeated it — every
     pouch, then everything else — so the front page read as a pouch
     catalogue with an appendix rather than as a mix worth scrolling.

     The chosen sort now orders the whole combined shelf, so the best
     value on the site leads it whichever shelf that comes from. */
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

  /* THE COMBINED SHELF INTERLEAVES; A DEPARTMENT SHELF DOES NOT.

     "Best value per unit" is the default sort, and across departments
     its numbers are not comparable — a per-pouch price is pennies and a
     per-stick price is dollars, because they measure different things.
     Sorted globally on that figure, pouches take every slot above the
     fold and the front page reads as a pouch catalogue however much
     else is in stock. Removing the old explicit pouch pin did not fix
     that; the sort was doing the same thing by arithmetic.

     So on the combined shelf this ranks WITHIN each department and then
     deals one from each in turn. Every card is still the best of its
     shelf that has not been shown yet, and the reader gets a mix of
     categories — and with them stores and brands — rather than one
     shelf followed by the others.

     Only for the unit sort. An explicit price sort compares a real
     currency amount, which IS comparable across shelves, so honouring
     it globally is the honest answer there. */
  if(!soleDept() && s==='unit' && VIEW.length){
    var lanes={}, order=[];
    VIEW.forEach(function(g){
      var d=deptOf(g)||'other';
      if(!lanes[d]){ lanes[d]=[]; order.push(d); }
      lanes[d].push(g);
    });
    if(order.length>1){
      /* DEPT_ORDER first so the deal is stable and the flagship shelf
         still leads — it simply no longer occupies the whole screen.
         Anything not in DEPT_ORDER follows in first-seen order. */
      order.sort(function(a,b){
        var ia=DEPT_ORDER.indexOf(a), ib=DEPT_ORDER.indexOf(b);
        return (ia<0?99:ia)-(ib<0?99:ib);
      });
      var mixed=[], any=true;
      for(var i=0; any; i++){
        any=false;
        for(var j=0;j<order.length;j++){
          var lane=lanes[order[j]];
          if(i<lane.length){ mixed.push(lane[i]); any=true; }
        }
      }
      VIEW=mixed;
    }
  }

  var mount=document.getElementById('mount');
  if(!VIEW.length && !PGROUPS.length){
    mount.innerHTML='<div class="state"><b>No catalogue connected yet</b>'+
      'The design is live but no store data has been pulled. In your Apps Script '+
      'project run <code>setup()</code>, then <code>diagnose()</code>, then '+
      '<code>refreshInventory()</code>, then reload this page.'+
      (CONN?'<br><br><span style="font-size:12px;color:var(--dim)">'+esc(CONN)+'</span>':'')+'</div>';
  }else if(!VIEW.length){
    var st2=F.store!=='all'?SMAP[F.store]:null;
    if(st2 && !SHOW_ALL && !storeShipsHere(st2)){
      mount.innerHTML='<div class="state"><b>'+esc(st2.name)+' can’t ship to '+
        esc(locLabel())+'</b>They deliver to '+
        esc((st2.ships||[]).join(' / ').replace('INTL','Worldwide'))+
        '. Change your destination at the top, or pick another store.</div>';
    }else{
      var soleD=soleDept();
      var ban = soleD && !SHOW_ALL ? legalFor(soleD) : ['ok'];
      mount.innerHTML= ban[0]==='banned'
        ? '<div class="state"><b>'+esc(DEPTS[soleD].label)+
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

  var on=F.q||Object.keys(F.depts).length||F.store!=='all'||F.deals||
    (F.strength&&F.strength!=='all')||(F.price&&F.price!=='all')||
    (F.brand&&F.brand!=='all')||
    Object.keys(F.subs).length||
    Object.keys(F.stores).length||Object.keys(F.brands).length;
  document.getElementById('clear').hidden=!on;

  /* Both follow the shelf, not the load: renderHero() swaps the (now
     hidden) h1 and setRouteMeta() the title/description/canonical, so a
     department change updates what a crawler reads without a refetch. */
  renderHero(); setRouteMeta();
  renderRail(); refreshFacets(); setWarn(); setNotices(); saveSelv();
}

/* How deep into each shelf's ranking the strip is currently showing.
   Reset by apply(), advanced by the shuffle button. */
var RAILP=0;

/* SUBCATEGORIES THE VALUE STRIP IGNORES.

   Not a hiding mechanism: these keep their shelf, their price and their
   unit chip everywhere else. They just do not compete for a slot in a
   strip whose whole job is to show what this market is FOR.

   Cigarette tubes are the case that forced this. They have no honest
   per-unit price (see FLAT_SUBS), so the strip ranks them on flat price
   — and a couple of dollars for a box of two hundred beats every pouch
   and disposable on the site, every time. They were winning the strip
   by being cheap in a way nobody came here to compare. */
var RAIL_SKIP={'cigar/rolling':1};

/* WHAT THE FRONT PAGE IS ABOUT. Pouches and disposables are the volume
   shelves and the reason people arrive, so they get three chances at a
   slot per round to everything else's one. A flat round-robin gave a
   humidor the same billing as a pouch. */
var RAIL_WEIGHT={pouch:3, disposable:3, device:1, liquid:1, cigar:1, gear:1};

/* One ranked bucket per department, each on the converted value so a kr
   row and a $ row can sit in the same strip honestly. Devices and gear
   have no honest unit, so those shelves rank on price. */
function railPool(){
  var by={};
  VIEW.forEach(function(g){
    var it=gitem(g); if(!it||!it.available) return;
    var d=deptOf(g);
    if(RAIL_SKIP[d+'/'+subOf(it)]) return;
    var u=unitPrice(it);
    var v=u ? usdOf(u.value,it.currency||'USD')
            : usdOf(it.price,it.currency||'USD');
    if(v==null||!(v>0)) return;
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
/* The old sub-category/brand pill row (#subnav) is gone — it was the
   thing three rounds of feedback kept calling "the pills" (colored
   dots, "Nicotine pouches" / "Disposable vapes" / etc.), not the
   shelf buttons removed earlier or the category strip added since.
   F.subs and the passes(g,'sub') check it feeds stay in place — they
   just never get set now that nothing writes to them, so this is a
   no-op path rather than a removed one, which is the safer of the two
   given how much else reads F.subs. */

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

  /* One weighted pass per round: a shelf with weight 3 appears three
     times in `seq`, so it gets three chances at a slot before the round
     restarts. Each shelf keeps its OWN cursor, otherwise those three
     chances would all land on the same product and be deduped away. */
  var seq=[];
  order.forEach(function(d){
    var w=RAIL_WEIGHT[d]||1;
    for(var k=0;k<w;k++) seq.push(d);
  });
  var cursor={};
  order.forEach(function(d){ cursor[d]=RAILP; });

  var want=Math.min(12,total), pick=[], seen={}, guard=0;
  while(pick.length<want && guard++ < deepest+40){
    var moved=false;
    for(var i=0; i<seq.length && pick.length<want; i++){
      var list=by[seq[i]];
      if(!list||!list.length) continue;
      var row=list[cursor[seq[i]]%list.length];
      cursor[seq[i]]++;
      if(!row || seen[row.g.gid]) continue;
      seen[row.g.gid]=1; pick.push(row.g); moved=true;
    }
    if(!moved) break;   /* every shelf exhausted */
  }

  var d=soleDept()?DEPTS[soleDept()]:null;
  document.getElementById('railTitle').textContent=
    d?('Best '+(d.unitLabel||'value')+' right now'):'Best value right now';
  document.getElementById('railSub').textContent=
    d ? ('cheapest '+(d.unitLabel||'')+' we can find')
      : (order.length>1
          ? 'best value, searching all Nicotia Market stores'
          : 'cheapest per pouch, per 1k puffs, per ml and per stick');

  /* nothing to shuffle to when the strip already holds everything */
  var sh=document.getElementById('railShuffle');
  if(sh) sh.hidden = total<=want;

  /* THE STRIP IS RENDERED TWICE. That is what makes the loop seamless:
     when the scroll passes the end of the first copy we subtract its
     width, which lands on a pixel-identical frame, so the jump is
     invisible and the carousel simply starts over.

     The clones are aria-hidden — a screen reader should hear each
     product once, not twice — and refreshCard() already updates EVERY
     node carrying a gid rather than the first, so a flavour change
     stays in step across both copies. */
  var rail=document.getElementById('rail');
  rail.scrollLeft=0;
  rail.innerHTML=pick.concat(pick).map(card).join('');
  for(var j=pick.length;j<rail.children.length;j++){
    rail.children[j].setAttribute('aria-hidden','true');
  }
}

/* THERE IS NO MOUSE-GESTURE SCROLLING LEFT ON THIS PAGE, and that is
   the conclusion of a long argument rather than an oversight.

   wheelToScroll() turned a vertical wheel over a horizontal strip into
   horizontal scroll. It was walked back twice — once narrowed to hand
   the gesture back at the box's ends (#25), once removed outright (#26)
   after the looping value rail proved the hand-back unreachable, then
   restored for the lanes only (#29) with the scroll-behavior:smooth
   read-back bug fixed. dragToScroll() gave click-and-drag alongside it.

   Both are gone now because both carousels stopped being scrollers on
   desktop: the value rail moves by its arrows (railNudge) and the three
   picker lanes by theirs (laneNudge), and .rail / .lrscroll are both
   overflow:hidden above the phone breakpoint. A drag on a box that does
   not scroll is a control nobody can find, and the wheel belongs to the
   page.

   On a phone both are real touch scrollers and need no JavaScript.

   If a wheel affordance is ever wanted again: it must not
   preventDefault() on a looping container, and it must not read
   scrollLeft back from a container with scroll-behavior:smooth to decide
   whether it has reached its end. Those are the two bugs, in order. */

/* Attached once — #rail survives every re-render, so binding inside
   renderRail() would stack a new listener on every shuffle. */
(function(){
  var rail=document.getElementById('rail'); if(!rail) return;
  /* THE ARROWS ARE THE ONLY THING THAT MOVES THIS RAIL.

     dragToScroll(rail) is gone and .rail is overflow:hidden (see
     app.css) — a reader who put the cursor on this band and kept
     scrolling used to stay on this band, because the rail loops and so
     has no end at which to hand the gesture back. overflow:hidden still
     leaves the box scrollable from script, which is what this uses.

     The wrap is handled HERE rather than in a scroll listener now that
     one function is the only mover: step to the target, and if that
     step would cross the seam, jump a whole lap first so the smooth
     animation never runs through it. A listener that wrapped mid-flight
     would fight the animation instead. */
  function railNudge(dir){
    var half=rail.scrollWidth/2; if(!(half>0)) return;
    var step=Math.max(rail.clientWidth*0.85, 220);
    var target=rail.scrollLeft+dir*step;
    if(target<0){ rail.scrollLeft+=half; target+=half; }
    else if(target>=half){ rail.scrollLeft-=half; target-=half; }
    var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({left:target, behavior: still?'auto':'smooth'});
  }
  var prev=document.getElementById('railPrev'), next=document.getElementById('railNext');
  if(prev) prev.addEventListener('click',function(){ railNudge(-1); });
  if(next) next.addEventListener('click',function(){ railNudge(1); });

  /* Focus moving to a card the rail has scrolled out of view scrolls the
     container itself — the one mover that is not railNudge(), and the
     one case that can still land past the seam. Put back on the lap it
     belongs to, so a keyboard tab through the strip cannot walk it off
     the end of the duplicated set. */
  rail.addEventListener('scroll',function(){
    var half=rail.scrollWidth/2;
    if(half>0 && rail.scrollLeft>=half) rail.scrollLeft-=half;
  },{passive:true});

  /* Edge fades, now that the scrollbar is hidden. Both sides light up
     together because this rail loops: there is no first or last card, so
     dimming one would claim an end that is not there. Only the "does it
     overflow at all" question matters, which is why this is one class
     rather than the can-prev/can-next pair the logo strips use.
     The rail is rebuilt on every shuffle and filter change, so this is
     observed rather than called from renderRail(). */
  var wrap=rail.parentElement;
  if(wrap&&wrap.classList.contains('railwrap')){
    var sync=function(){
      /* Drives the edge fades AND the two arrows: with nothing to move
         to, an arrow is a button that does nothing. */
      wrap.classList.toggle('can-scroll', rail.scrollWidth-rail.clientWidth>2);
    };
    if(window.MutationObserver)
      new MutationObserver(sync).observe(rail,{childList:true});
    if(window.ResizeObserver) new ResizeObserver(sync).observe(rail);
    window.addEventListener('resize',sync,{passive:true});
    sync();
  }
})();

/* ---- logo strip carousels: Shop by store / Shop by brand ----
   The scrollbar under these was the ugliest thing on the page, so the
   arrows replace it. Unlike #rail these strips are REBUILT on every
   filter change, so the click handler is delegated on document and the
   state is driven by a MutationObserver. Binding per button would either
   die with the old nodes or stack a new listener on each render.

   Deliberately not looping like #rail does: that works for an endless
   deals carousel, but a brand list has a first and a last brand and
   wrapping past Z back to A reads as a bug. */
(function(){
  var IDS=['categoryLogos','storeLogos','brandLogos'];

  function sync(box){
    var wrap=box.parentElement;
    if(!wrap||!wrap.classList.contains('lrwrap')) return;
    var max=box.scrollWidth-box.clientWidth;
    /* THE THRESHOLD HAS TO CLEAR THE CONTAINER'S OWN PADDING, not just be
       "a couple of px". .lrscroll carries 8px of horizontal padding (so
       the first/last chip and its selection ring aren't clipped by
       overflow — see the comment above .lrscroll), and on mobile with
       scroll-snap active Chromium can report scrollLeft as that padding
       value at rest, before the reader has scrolled at all. A flat `2`
       read that as "already scrolled" and showed a prev-arrow pointing
       at nothing on first load — invisible as a few degrees of an edge
       fade, not invisible as a whole button. Reading the real padding
       keeps this correct if it's ever changed, instead of reintroducing
       the same bug at a new number. */
    var cs=getComputedStyle(box);
    var padL=(parseFloat(cs.paddingLeft)||0)+2, padR=(parseFloat(cs.paddingRight)||0)+2;
    var scrollable=max>2,
        canPrev=scrollable&&box.scrollLeft>padL,
        canNext=scrollable&&box.scrollLeft<max-padR;
    /* Drives the edge fades AND the two bone arrows, which are display:
       none without these classes — an arrow pointing at nothing is worse
       than no arrow. */
    wrap.classList.toggle('can-prev',canPrev);
    wrap.classList.toggle('can-next',canNext);
  }

  /* Category, store and brand each need to read as OBVIOUSLY scrollable
     with a bone arrow at each end to say so — at every width. On desktop
     that arrow is the only control, since .lrscroll is overflow:hidden
     there; on a phone the lane is ALSO a real touch scroller, so a swipe
     and an arrow tap both work and both keep the arrows in sync (sync()
     runs off the lane's own 'scroll' event, not off which input moved
     it). Unlike the value rail these lanes have real ends, so sync()
     hides an arrow rather than wrapping past one. */
  IDS.forEach(function(id){
    var box=document.getElementById(id); if(!box) return;
    box.addEventListener('scroll',function(){ sync(box); },{passive:true});
    if(window.MutationObserver)
      new MutationObserver(function(){ sync(box); }).observe(box,{childList:true});
    /* Logos arrive as images, so the strip's width changes after the
       chips do. ResizeObserver catches that; the observers above do not. */
    if(window.ResizeObserver) new ResizeObserver(function(){ sync(box); }).observe(box);
    sync(box);
  });

  /* THE ARROWS ARE THE DESKTOP CONTROL, and the only one.

     No wheel hijack and no drag — see the note above the rail's own
     nudge for why both are gone. On desktop .lrscroll is overflow:hidden
     and these arrows are the whole control; on a phone the lane is a
     plain touch scroller and needs no JS at all.

     These lanes DO have ends, unlike the looping value rail, so this
     clamps rather than wrapping and sync() hides an arrow with nothing
     behind it. behavior:'auto' rather than the CSS smooth, so a second
     click lands from the true position instead of mid-animation — the
     same trap that made the old wheel guard fail to notice its end. */
  function laneNudge(box, dir){
    var max=box.scrollWidth-box.clientWidth;
    if(max<=0) return;
    var step=Math.max(box.clientWidth*0.8, 120);
    var to=Math.max(0, Math.min(max, box.scrollLeft + dir*step));
    var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({left:to, behavior: still?'auto':'smooth'});
    /* scrollTo is async even at behavior:auto in some engines, and the
       arrows must vanish the moment an end is reached rather than one
       interaction later. */
    setTimeout(function(){ sync(box); }, 60);
    setTimeout(function(){ sync(box); }, 420);
  }
  /* Delegated: the chips inside a lane are re-rendered constantly, and
     binding per button would stack listeners on every filter change.
     The buttons themselves live in .lrwrap, outside the re-rendered
     .lrscroll, but one handler is still the cheaper contract. */
  document.addEventListener('click',function(e){
    var btn=e.target&&e.target.closest?e.target.closest('[data-lnudge]'):null;
    if(!btn) return;
    var box=document.getElementById(btn.getAttribute('data-lane-for'));
    if(box) laneNudge(box, Number(btn.getAttribute('data-lnudge'))||1);
  });

  window.addEventListener('resize',function(){
    IDS.forEach(function(id){ var b=document.getElementById(id); if(b) sync(b); });
  },{passive:true});
})();

/* Rebuild everything that reflects what is still reachable.

   This used to repopulate four <select> elements too. They are gone:
   Store and Brand said the same thing as the logo strips below, only
   slower to read, and strength and budget are printed on every card.
   The counts they were built from are still needed — the logo strips
   and the department tabs run on them — so only the selects went.

   `facetCount('strength')` went with them; nothing reads it now. */
function refreshFacets(){
  var cStore=facetCount('store'), cBrand=facetCount('brand'),
      cDept=facetCount('dept');

  var ns=document.getElementById('nstores');
  if(ns) ns.textContent=Object.keys(cStore).length;

  renderPickerRow(cDept,cStore,cBrand);
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
/* Picks a real product photo for a department chip the same way brand
   chips already do it — the first PGROUPS entry in that department
   (respecting every OTHER active filter, same as the brand image
   lookup below) that actually has one. Falls back to the coloured
   monogram when nothing qualifies, same fallback path a broken store
   logo already uses. */
function repImageForDept(d){
  for(var i=0;i<PGROUPS.length;i++){
    var g=PGROUPS[i];
    if(deptOf(g)!==d||!passes(g,'dept')) continue;
    var f=g.flav[0];
    if(f&&f.image) return f.image;
  }
  return '';
}
/* Category, store and brand as THREE INDEPENDENT carousels sharing one
   compact row — not one shared strip you scroll through in sequence.
   That was tried first and rejected: reaching Store meant scrolling
   past every Category chip, which read as one carousel with three
   tabs in it, not three carousels. Each lane gets its own container
   and hides on its own when it has nothing to show; the whole row
   only hides when all three come up empty. No card chrome on the
   chips — bare logo (bigger) plus a label, which is what "get rid of
   the pills" turned out to mean: not the shelf buttons (gone two
   passes ago), the bordered box around every item in this row.
   Category chips get a real product photo, the same treatment as
   brand, rather than a plain monogram — the monogram is still the
   fallback when a department has no image to show, exactly like a
   broken store logo falls back to one. */
function renderPickerRow(cDept,cStore,cBrand){
  var row=document.getElementById('pickerRow');
  /* NOT ON A SPOTLIGHT. The row lives outside #mallview (it sits above
     both views in the markup), so hiding #mallview left it stranded on
     /#/store/* — three lanes of Category / Store / Brand on a page that
     is already one store, and already one card per brand. All three
     filter the mall grid underneath, which nobody on a spotlight can
     see, so every chip reads as dead.

     The guard belongs here rather than only in route() because apply()
     can run while a spotlight is open — that is the same path that once
     re-rendered a hidden #mallview (see leaveSpotlight()) — and it would
     otherwise un-hide the row again on the next keystroke. */
  if(row && currentRoute().view==='spotlight'){ row.hidden=true; return; }
  var catBox=document.getElementById('categoryLogos'),
      storeBox=document.getElementById('storeLogos'),
      brandBox=document.getElementById('brandLogos');
  if(!catBox||!storeBox||!brandBox) return;

  var catChips=DEPT_ORDER.filter(function(d){ return cDept[d]; }).map(function(d){
    var on=!!F.depts[d], meta=DEPTS[d]||{}, img=repImageForDept(d);
    /* --cat-accent rides on the BUTTON, not the image plate: the
       selected ring, the filled label pill and the count all read it,
       and only the plate can see --mono-a. One department hue, four
       cues, declared once. */
    return '<button class="llogo cat'+(on?' on':'')+'" data-logocat="'+esc(d)+'" '+
      'style="--cat-accent:'+esc(meta.accent||'var(--gold)')+'" '+
      'aria-pressed="'+on+'" title="'+esc(meta.label||d)+'">'+
      '<span class="limg'+(img?'':' mono')+'" data-letter="'+esc(String(meta.label||d).charAt(0).toUpperCase())+'" '+
        'style="--mono-a:'+esc(meta.accent||'var(--gold)')+';--mono-b:var(--chip)">'+
        (img?'<img src="'+esc(img)+'" alt="" loading="lazy" referrerpolicy="no-referrer" '+
          'onerror="this.parentNode.classList.add(\'mono\');this.remove();">':'')+
      '</span>'+
      '<span class="lname">'+esc(meta.label||d)+'</span>'+
      '<span class="lcount">'+cDept[d]+'</span></button>';
  });

  var storeChips=STORES.filter(function(s){ return cStore[s.key]; }).map(function(s){
    var on=!!F.stores[s.key];
    /* noFavicon means the guess itself is known-wrong (Google's favicon
       service returning a generic globe, not this store's actual mark) —
       skip straight to the monogram instead of loading a placeholder that
       reads as a real logo. Everyone else still gets the favicon guess,
       with onerror as the fallback for an actual load failure. */
    var img=s.noFavicon?'':logoFor(s);
    return '<button class="llogo'+(on?' on':'')+'" data-logostore="'+esc(s.key)+'" '+
      'aria-pressed="'+on+'" title="'+esc(s.name)+'">'+
      '<span class="limg'+(img?'':' mono')+'" '+monoAttrs(s.name,s.key)+'>'+
        (img?'<img src="'+esc(img)+'" alt="" loading="lazy" referrerpolicy="no-referrer" '+
          'onerror="this.parentNode.classList.add(\'mono\');this.remove();">':'')+
      '</span>'+
      '<span class="lname">'+esc(s.name)+'</span>'+
      '<span class="lcount">'+cStore[s.key]+'</span></button>';
  });

  var bImg={};
  PGROUPS.forEach(function(g){
    if(!g.brand||bImg[g.brand]) return;
    if(!passes(g,'brand')) return;
    var f=g.flav[0]; if(f&&f.image) bImg[g.brand]=f.image;
  });
  /* Judged against the catalogue (BRANDOK), never against these counts.
     `cBrand` is the CURRENT view, so testing it here hid every brand
     the moment a single store was selected. */
  var bList=Object.keys(cBrand).filter(function(b){ return BRANDOK[nk(b)]; });
  bList.sort(function(a,b){ return cBrand[b]-cBrand[a] || a.localeCompare(b); });
  bList=bList.slice(0,40);
  var brandChips=bList.map(function(b){
    var on=!!F.brands[b];
    /* .mono set up front when there's no image to try at all, not just
       on load failure — a brand with no photo but OTHER brands that DO
       have one still needs a letter, not a blank circle. */
    return '<button class="llogo brand'+(on?' on':'')+'" data-logobrand="'+esc(b)+'" '+
      'aria-pressed="'+on+'" title="'+esc(b)+'">'+
      '<span class="limg'+(bImg[b]?'':' mono')+'" '+monoAttrs(b,b)+'>'+(bImg[b]
        ? '<img src="'+esc(bImg[b])+'" alt="" loading="lazy" referrerpolicy="no-referrer" '+
          'onerror="this.parentNode.classList.add(\'mono\');this.remove();">'
        : '')+'</span>'+
      '<span class="lname">'+esc(b)+'</span>'+
      '<span class="lcount">'+cBrand[b]+'</span></button>';
  });

  /* Two is a lane worth showing — a single chip with nothing to
     compare it to isn't a filter, it's a label. Each lane's own
     wrapping <div class="lrlane"> hides with it, so an empty lane
     doesn't leave a blank label and no content sitting in the row. */
  var catLane=catBox.closest('.lrlane'), storeLane=storeBox.closest('.lrlane'),
      brandLane=brandBox.closest('.lrlane');
  var showCat=catChips.length>1, showStore=storeChips.length>1, showBrand=brandChips.length>1;
  /* A lane can be expanded full-screen when a pick (its own, or one in
     another lane through joint faceting) narrows it to nothing worth
     showing. hidden is display:none regardless of the expanded state,
     which would leave the backdrop stuck open behind an invisible lane
     — so collapse before hiding, never leave that half-open. */
  [[catLane,showCat],[storeLane,showStore],[brandLane,showBrand]].forEach(function(pair){
    var lane=pair[0], show=pair[1];
    if(lane && !show && lane.classList.contains('expanded')) collapseLane();
    if(lane) lane.hidden=!show;
  });
  catBox.innerHTML=showCat?catChips.join(''):'';
  storeBox.innerHTML=showStore?storeChips.join(''):'';
  brandBox.innerHTML=showBrand?brandChips.join(''):'';

  row.hidden=!(showCat||showStore||showBrand);

  var anyActive=Object.keys(F.depts).length||Object.keys(F.stores).length||Object.keys(F.brands).length;
  document.getElementById('clearPicker').hidden=!anyActive;
}

function renderStoreList(){
  var el=document.getElementById('slist'); if(!el) return;
  el.innerHTML=STORES.map(function(s){
    var n=ALL.filter(function(i){return i.key===s.key;}).length;
    var here=storeShipsHere(s);
    var zones=(s.ships||[]).join(' / ').replace('INTL','Worldwide')||'-';
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
  var d=soleDept();
  if(!d){ el.innerHTML = eu ? EUALL : ALLWARN; return; }
  el.innerHTML = eu ? (EUWARN[d]||EUALL) : (DEPTS[d]||{}).warn||ALLWARN;
}
/* HOW MUCH OF THE MARKET CAN ACTUALLY REACH YOU.

   With PREVIEW_MODE off, shipping limits and local law are enforced, and
   for several destinations that removes most of the catalogue: Canada
   sees 253 of 2,451 cards, the UK 273, a vape-ban US state loses every
   vape shelf outright. Until now the page said NOTHING about it — you
   got a thin shelf and no reason, which reads as a broken site rather
   than an enforced rule. It is the single most alarming thing this
   storefront can do while working exactly as designed.

   Counted over PGROUPS with shipping and legality applied but the
   shopper's OWN filters ignored, so the number answers "what can reach
   me at all", not "what matches my current search". */
function reachNotice(){
  if(SHOW_ALL || !PGROUPS.length) return '';
  var reach=0, hereStores={}, allStores={}, banned={};
  PGROUPS.forEach(function(g){
    allStores[g.key]=1;
    var st=SMAP[g.key]||{};
    if(!storeShipsHere(st)) return;
    var d=deptOf(g);
    if(legalFor(d)[0]==='banned'){ banned[d]=1; return; }
    reach++; hereStores[g.key]=1;
  });
  var nHere=Object.keys(hereStores).length, nAll=Object.keys(allStores).length;
  /* only speak up when a real share of the market is out of reach —
     otherwise this is nagging */
  if(!nAll || reach >= PGROUPS.length*0.75) return '';

  var where=locLabel && LOC.country ? locLabel() : 'your destination';
  var bits=[];
  bits.push('<b>'+nHere+' of '+nAll+' stores</b> deliver to '+esc(where));
  bits.push(reach.toLocaleString()+' of '+PGROUPS.length.toLocaleString()+' listings can reach you');
  var bl=Object.keys(banned).map(function(d){ return (DEPTS[d]||{}).label||d; });
  if(bl.length){
    /* "A and B and C" reads like a stutter; commas until the last one */
    var list=bl.length>1 ? bl.slice(0,-1).join(', ')+' and '+bl[bl.length-1] : bl[0];
    bits.push('<b>'+esc(list)+'</b> cannot be sold where you are');
  }

  return '<div class="reachbar">'+bits.join(' · ')+
    ' <button type="button" class="reachbtn" data-shipto>Change destination</button></div>';
}

function setNotices(){
  var box=document.getElementById('notices'); if(!box) return;
  var html='';
  if(PREVIEW_MODE){
    html+='<div class="previewbar">PREVIEW MODE, shipping limits and local law are '+
          'being ignored. Set <code>PREVIEW_MODE = false</code> before launch.</div>';
  }
  html+=reachNotice();
  if(!SHOW_ALL){
    var cav = soleDept() ? regionCaveat(soleDept())
      : (regionCaveat('disposable')||regionCaveat('liquid'));
    if(cav) html+='<div class="caveat"><b>Heads up.</b> '+esc(cav)+'</div>';
  }
  box.innerHTML=html;
}

/* ============================================================
   DEPARTMENT HEADINGS (was: DEPARTMENT HEROES)
   ------------------------------------------------------------
   Legal-Leaf gives each page its own hero by serving a separate HTML
   file per page. We cannot do that: every department URL rewrites to
   index.html and the shelf is chosen client-side (CLAUDE.md §3), so
   this is DATA and renderHero() swaps it.

   The visible hero is gone; `lead` + `head` still fill the hidden h1,
   so /pouches reads "the honest per-pouch price" to a crawler and not
   whatever the last shelf set. `eyebrow` and `sub` are kept because
   each argues its own shelf's unit in the site's voice — the natural
   source if these shelves ever want a real intro paragraph — but
   nothing renders them today. Adding a shelf still means adding an
   entry here.
   ============================================================ */
var HEROES={
  all:{ eyebrow:'every store, one price you can compare',
    lead:'what it actually', head:'costs',
    sub:'Pouches, disposables, e-liquid and cigars from every shop we carry, priced '+
        'per pouch, per 1,000 puffs, per ml and per stick, so a five-can roll and a '+
        'single tin finally compare honestly.' },
  pouch:{ eyebrow:'pouches & snus · priced per pouch',
    lead:'the only number', head:'that matters',
    sub:'A tin of 20 and a roll of five never compared on the shelf price. Every pouch '+
        'here carries its own per-pouch cost, converted to one currency, so a kroner '+
        'listing and a euro listing can actually be ranked against each other.' },
  disposable:{ eyebrow:'disposables · priced per 1,000 puffs',
    lead:'puffs, not', head:'packaging',
    sub:'A 30K at $16.99 and a 60K at $19.99 look three dollars apart and are 42% apart. '+
        'Pricing by the thousand puffs is the entire reason this shelf exists.' },
  device:{ eyebrow:'devices & pods · priced flat',
    lead:'hardware, judged', head:'honestly',
    sub:'Mods, kits, pods, tanks and coils. No invented unit here. A device is a device, '+
        'so this shelf compares on flat price, stock, and what each store will ship you.' },
  liquid:{ eyebrow:'e-liquid · priced per ml',
    lead:'per millilitre,', head:'not per bottle',
    sub:'A 100ml shortfill and a 10ml nic salt are not the same purchase. Every bottle '+
        'shows its cost per ml, so the big bottle has to earn its shelf price.' },
  cigar:{ eyebrow:'cigars · priced per stick',
    lead:'per stick,', head:'every time',
    sub:'Singles, fivers and full boxes reduced to one comparable number. Cutters, cases '+
        'and humidors live on the Gear shelf. A $199 humidor is not a $199 cigar.' },
  gear:{ eyebrow:'gear & accessories · priced flat',
    lead:'everything', head:'around it',
    sub:'Humidors, cutters, cases and pipe gear. This shelf exists so that nothing without '+
        'nicotine in it gets priced per stick, which is exactly what used to happen.' }
};

function renderHero(){
  var h=HEROES[soleDept()||'all']||HEROES.all;
  [['heroLead',h.lead],['heroHead',h.head]].forEach(function(p){
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
  all:{ t:'Nicotia Market, Pouches, Vape & Cigars, Priced by the Unit',
    d:'Compare nicotine pouches, snus, disposables, e-liquid and cigars across every store we carry. Priced per pouch, per 1,000 puffs, per ml and per stick. Adults 21+.' },
  pouch:{ t:'Nicotine Pouches & Snus, Compared Per Pouch | Nicotia Market',
    d:'Every nicotine pouch and snus tin we track, priced per pouch and converted to one currency so a five-can roll and a single tin compare honestly. ZYN, VELO, Pablo, Iceberg and more. Adults 21+.' },
  disposable:{ t:'Disposable Vapes, Compared Per 1,000 Puffs | Nicotia Market',
    d:'Disposable vapes priced per 1,000 puffs, not per device. A 30K and a 60K look three dollars apart and are 42% apart, see the real cost. Adults 21+.' },
  device:{ t:'Vape Devices, Pods, Kits & Coils, Compared | Nicotia Market',
    d:'Mods, kits, pods, tanks and coils compared across every store we carry, on flat price, stock and where each one actually ships. Adults 21+.' },
  liquid:{ t:'E-Liquid & Vape Juice, Compared Per ml | Nicotia Market',
    d:'Shortfills, nic salts and freebase e-liquid priced per millilitre, so a 100ml bottle has to earn its shelf price against a 10ml. Adults 21+.' },
  cigar:{ t:'Cigars, Compared Per Stick | Nicotia Market',
    d:'Singles, fivers and full boxes reduced to one comparable number: the price per stick. Cutters, cases and humidors live on the Gear shelf. Adults 21+.' },
  gear:{ t:'Humidors, Cutters, Cases & Pipe Gear | Nicotia Market',
    d:'Humidors, cutters, cases and pipe gear compared across every store we carry. Accessories only, nothing here contains nicotine. Adults 21+.' }
};

function deptFromPath(){
  var seg=String(location.pathname||'').replace(/^\/+|\/+$/g,'').toLowerCase();
  return PATH_DEPT[seg]||'';
}

/* Title, description and canonical per shelf. Canonical points at the
   department's OWN url — pointing all six at "/" told Google they were
   the homepage wearing a hat, which is why none of them could rank. */
function setRouteMeta(){
  var set=function(sel,attr,val){
    var el=document.querySelector(sel); if(el) el.setAttribute(attr,val);
  };
  var title, desc, path;

  /* A SPOTLIGHT DESCRIBES ITSELF. Now that it has a crawlable URL there
     is something for this to be about, and pointing its canonical at
     the homepage would undo the whole point of giving it one. Title and
     description come off the SPOTLIGHT entry rather than being written
     twice — that copy is already the page's own argument. */
  var r=currentRoute();
  if(r.view==='spotlight' && SPOTLIGHT[r.key]){
    var c=SPOTLIGHT[r.key], st=SMAP[r.key]||{};
    var name=st.name||r.key;
    title = c.headline+' · '+name+' | Nicotia Market';
    /* The blurb is a paragraph; a description wants ~160 characters, cut
       on a word rather than mid-word. */
    desc = c.blurb.length>158
      ? c.blurb.slice(0,158).replace(/\s+\S*$/,'')+'…'
      : c.blurb;
    path = spotPath(r.key);
  }else{
    var d=soleDept()||'all', sq=DEPT_SEO[d]||DEPT_SEO.all;
    title=sq.t; desc=sq.d; path = d==='all'?'/':('/'+DEPT_PATH[d]);
  }

  document.title=title;
  set('meta[name="description"]','content',desc);
  set('link[rel="canonical"]','href','https://nicotiamarket.com'+path);
  set('meta[property="og:title"]','content',title);
  set('meta[property="og:description"]','content',desc);
  set('meta[property="og:url"]','content','https://nicotiamarket.com'+path);
}

/* Keep the address bar honest when the shelf changes, so a department
   is linkable and the back button steps through shelves.

   This used to bail out on a spotlight, back when a spotlight was a
   hash and the path underneath it was still the shelf's. A spotlight is
   a path now, so leaveSpotlight() sets the shelf path itself and this
   finds it already correct — no guard needed, and a guard here would
   strand a reader on /store/* after they picked a department. */
function pushDeptPath(){
  var d=soleDept()||'all', want=d==='all'?'/':('/'+DEPT_PATH[d]);
  if(!want||location.pathname===want) return;
  try{ history.pushState({depts:F.depts},'',want+location.search); }catch(e){}
}

/* A real department path (/pouches, /disposables, ...) is always a
   single-department selection — there is no URL for "pouch AND
   disposable" to restore from, so a bare "/" resolves to the curated
   boot mix rather than to a bare "show everything". That is a
   deliberate choice, not a limitation: "/" reads the same whether it
   is the very first load or the Back button landed on it. */
function bootDepts(){
  var pd=deptFromPath();
  if(pd){ var o={}; o[pd]=1; return o; }
  return {pouch:1,disposable:1};
}

/* The category logo strip follows F.depts on its own, whoever set it —
   click, path or Back — because renderCategoryRow() re-renders from F
   on every apply(). Nothing extra to sync here now that the shelf is
   chosen from that strip instead of a row of tab buttons. */
window.addEventListener('popstate',function(){
  /* Back and Forward can now cross a spotlight boundary, because the
     spotlight is a path. route() owns that swap and falls through to
     apply() on the mall side, so it replaces the bare apply() that was
     enough while only shelves lived in the path. */
  F.depts=bootDepts(); F.subs=pruneSubs(soleDept()||'all');
  route();
});

/* The hero's three stats went with the hero, and heroStats() with them,
   along with SHELF_NOUN and shelfGroups() which existed only to feed it.
   The live filtered count above the grid (#rcount) was always the more
   honest number anyway — it moves with the filters, where the hero's
   figure deliberately did not.

   Kept for whoever goes looking: that figure was a standing per-shelf
   claim ("cheapest per pouch", in USD), and it shared computeBestUnits()'
   yardstick — in stock, every variant, one currency — precisely because
   an earlier version did not, and advertised a cheapest pouch of £0.003
   against a real floor of £0.03. If anything like it comes back, it goes
   through that same yardstick, not a fresh walk of selected variants. */

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
  if(!META.length){ toast('No refresh report yet, run refreshInventory() in Apps Script.'); return; }
  var rows=META.map(function(m){
    var st=SMAP[m.key]||{name:m.key};
    var mine=ALL.filter(function(i){return i.key===m.key;});
    var inStock=mine.filter(function(i){return i.available;}).length;
    return {name:st.name||m.key, result:m.result, count:m.count,
            stock:mine.length?inStock+' / '+mine.length:'-', detail:m.detail};
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
/* The saved board persists exactly the way the cart does (Legal-Leaf keeps
   its watchlist across visits; ours evaporated on refresh, which made the
   star a lie). Board entries are gitem() snapshots, so they serialize. */
function loadBoard(){ try{BOARD=JSON.parse(read_('nm_board'))||{};}catch(e){BOARD={};}
  if(typeof BOARD!=='object'||!BOARD) BOARD={}; }
function saveBoard(){ store_('nm_board', JSON.stringify(BOARD)); }
/* Fire-and-forget beacon to /api/track, which has existed since launch with
   nothing ever calling it. sendBeacon survives the same-tab checkout
   navigation that follows immediately, the one moment a fetch would be
   cancelled mid-flight. Anonymous by design: event, store, product, value,
   country. No id, no email. */
function track(ev,extra){
  try{
    var body=JSON.stringify(Object.assign({event:ev,country:LOC.country||''},extra||{}));
    if(navigator.sendBeacon){ navigator.sendBeacon('/api/track', new Blob([body],{type:'application/json'})); }
    else{ fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){}); }
  }catch(e){}
}
/* Every per-card interaction (flip, flavour, strength, save) shares the
   same four facets a shopper picked it by — gid, department, brand,
   store — so the backend can roll popularity up any of those ways
   without the front end knowing anything about how it's aggregated.
   Looks the group up itself so call sites only ever hand over a gid. */
function trackGroup(ev,gid,extra){
  var g=groupById(gid); if(!g) return;
  track(ev,Object.assign({gid:g.gid,dept:deptOf(g),brand:g.brand||'',
    store:g.key||'',product:g.title||g.brand||''},extra||{}));
}
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
  track('add_to_cart',{store:it.key||'',product:it.title||'',value:Number(it.price)||0,
    dept:deptOf(it),brand:it.brand||''});
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
  /* New signups reach /api/subscribe, which has sat wired-to-nothing since
     launch. Signup only, not sign-in: a returning email is already on
     whatever list the webhook feeds, and double-forwarding makes dupes. */
  if(AUTH_MODE==='signup'){
    try{ fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:email,name:name||'',country:LOC.country||'',region:LOC.region||''})}).catch(function(){}); }catch(e){}
  }
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
/* THE AFFILIATE WRAPPER.
   ------------------------------------------------------------
   Not every network appends. GoAffPro and the direct programmes take
   ?ref= on the end of the product URL, which is what the rest of this
   file assumed — but Impact and CJ WRAP the destination instead, with
   their ids in the path, and the click only registers when their
   redirect runs. Nothing is appended and nothing looks wrong if you
   skip it: the shopper lands on the right page, buys, and the sale
   pays nobody.

   THIS FILE IS WHERE THAT MATTERS. row() drops `aff` on the wire and
   the browser rebuilds every outbound link, so a wrapper that only
   api/products.js knows about is a wrapper no shopper ever gets — CJ
   was set up exactly that way, and Nicokick would have gone on
   emitting bare links even after its cjPid was filled in.

   So the server ships the shape as a `{url}` template in `click` and
   this side only substitutes. One authority for the link shape, and a
   new network needs no edit here. */
function affWrap(st, url){
  if(!st||!st.click||!url) return url;
  /* Already wrapped. hydrate() wraps product links; the cart stores
     them and checkoutPlan() hands one straight back for stores whose
     basket cannot be filled by URL. Wrapping a wrapper points our own
     redirect at itself and loses the destination. */
  if(url.indexOf(st.click.split('?')[0])===0) return url;
  /* encodeURIComponent escapes `$`, so no `$&` can smuggle itself into
     the replacement and rewrite the template. */
  return st.click.replace('{url}', encodeURIComponent(url));
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

/* WHAT EACH PLATFORM'S URL SCHEME CAN ACTUALLY DO.

     all  — one URL fills the whole basket
     one  — one URL adds a single line; the rest have to be added there
     none — no URL can fill their basket at all

   This table is the difference between a working hand-off and the one
   reported broken. Nicokick is Magento: it matched neither branch
   below, fell to the final `return items[0].url`, and quietly opened
   THE FIRST ITEM'S PRODUCT PAGE under a button reading "Checkout at
   Nicokick →". Every feedcsv store and BigCommerce did the same.

   Magento has required a form_key on /checkout/cart/add since 2.2, and
   our Magento rows carry a SKU rather than the numeric entity id, so
   there is no honest URL to build for it. Saying so plainly beats
   pretending — the shopper can still open each item, and now the
   drawer says that is what will happen. */
var CHECKOUT_CAP={ shopify:'all', woocommerce:'one',
                   magento:'none', feedcsv:'none', bigcommerce:'none' };
/* checkoutPlan() can also return cap:'some' — a Shopify basket where
   only part of it carries variant ids. That is a property of the ROWS,
   not of the platform, so it has no entry here. */

/* Returns {cap, url, filled, rest} so the drawer can describe the
   hand-off truthfully instead of every store getting one caption.

   ATTRIBUTION IS APPLIED HERE, ONCE, TO WHATEVER THE PLAN DECIDED.
   checkoutPlanRaw() returns from four different places and this is the
   highest-value link on the site — the one the shopper clicks holding a
   full basket. Wrapping at each return means the next branch anybody
   adds is unattributed by default and looks identical when it is, so
   the plan is built first and attributed at the door.

   ?ref= is NOT applied here: the branches below already pass it
   through addParams(), which knows not to emit an empty one, and a
   wrapping network carries ref:'' anyway. */
function checkoutPlan(st, items){
  var plan=checkoutPlanRaw(st, items);
  plan.url=affWrap(st, plan.url);
  return plan;
}
function checkoutPlanRaw(st, items){
  var base='https://'+st.domain;
  if(st.platform==='shopify'){
    /* A cart permalink can only carry a line that HAS a variant id, and
       not every door supplies one — the JSON-LD fallback in particular
       yields rows with no vid at all. Those lines used to be filtered
       out and then forgotten: `rest` was hardcoded to [], so a basket of
       three where one had a vid returned cap:'all', filled:1, rest:[]
       and the drawer said "All 3 items go into their basket". It sent
       one and dropped two, silently, while claiming otherwise.

       Split the basket instead of filtering it. Whatever the permalink
       cannot carry comes back as `rest` and the drawer lists it. */
    var canSend=[], cannot=[];
    items.forEach(function(x){ (x.vid?canSend:cannot).push(x); });
    var parts=canSend.map(function(x){
      return encodeURIComponent(x.vid)+':'+stepQty(st,x.qty,x); });
    /* The cart permalink jumps straight to /cart, skipping any product
       page — so the affiliate cookie was never set on the way through
       and Shopify handoffs were tracking to nobody. ?ref= rides along
       on the permalink itself.

       return_to carries the shopper past the cart page and into the
       checkout once the permalink has filled the basket, which is the
       whole point of sending a basket at all. */
    if(parts.length) return {cap: cannot.length?'some':'all',
      filled:parts.length, rest:cannot, opens:'checkout',
      url:addParams(base+'/cart/'+parts.join(','),
        {discount:st.coupon, ref:st.ref, return_to:'/checkout'})};
    /* NOT ONE LINE IS SENDABLE. The old code returned rest:items.slice(1)
       here, which was the same bug wearing a different hat: the URL is a
       cart or a discount link, NOT item one's page, so item one appeared
       in neither and could not be reached from the drawer at all. Every
       item is `rest` here, because the link carries none of them.

       The discount link is still worth following when there is a code —
       it lands on an empty cart, but with the code already applied. */
    return {cap:'none', filled:0, rest:items,
      opens: st.coupon?'discount':'cart',
      url: st.coupon
        ? addParams(base+'/discount/'+encodeURIComponent(st.coupon),{redirect:'/cart', ref:st.ref})
        : addParams(base+'/cart',{ref:st.ref})};
  }
  /* WooCommerce takes ONE line per request — there is no core equivalent
     of Shopify's multi-item cart permalink. So we send the first item
     and say so plainly rather than pretending otherwise.

     For a VARIABLE product the id shape matters and getting it wrong
     fails loudly: ?add-to-cart=<variation_id> is rejected with "please
     choose product options" and the cart lands empty. Woo wants the
     PARENT id, variation_id, and each attribute as its own param. */
  if(st.platform==='woocommerce' && items[0] && items[0].vid){
    var x=items[0];
    /* add-to-cart is honoured on ANY page load, so pointing it at the
       checkout page adds the line and lands there in one hop. Only used
       where the path is KNOWN: Wave Vape's cart is not at /cart/, so
       guessing its checkout would 404, and a 404 is worse than a cart
       page. Set checkoutPath in the registry once verified. */
    var path=st.checkoutPath||st.cartPath||'/cart/';
    var url;
    if(x.pid){
      url=addParams(base+path,{'add-to-cart':x.pid, variation_id:x.vid,
                               quantity:stepQty(st,x.qty,x), ref:st.ref});
      if(x.attrs) url+='&'+x.attrs;      /* already url-encoded by the store */
    }else{
      url=addParams(base+path,{'add-to-cart':x.vid, quantity:stepQty(st,x.qty,x), ref:st.ref});
    }
    return {cap:'one', filled:1, rest:items.slice(1), opens:'cart', url:url};
  }

  /* Nothing can fill this basket by URL. Open the first item where it
     actually lives and hand the rest back, so the drawer can list them
     as their own links instead of stranding the shopper on one product
     page under a button that promised a checkout. */
  return {cap:'none', filled:0, rest:items.slice(1),
    opens: items[0]?'item':'home',
    url: items[0] ? (items[0].aff||items[0].url) : addParams(base+'/',{ref:st.ref})};
}
function checkoutStore(key){
  if(!isLoggedIn()) toast('One step first, we need an email to send your order details');
  requireLoginThen(function(){
    var st=SMAP[key]; if(!st) return;
    var items=itemsForStore(key); if(!items.length) return;
    if(st.coupon){ try{navigator.clipboard.writeText(st.coupon);}catch(e){} }
    var plan=checkoutPlan(st,items);
    track('checkout_handoff',{store:key,
      value:items.reduce(function(a,x){return a+(Number(x.price)||0)*(x.qty||1);},0)});
    /* SAME TAB. The cart lives in localStorage, so coming back is one
       Back press — and a new tab per store meant the shopper lost track
       of which of them they had actually paid. */
    location.assign(plan.url);
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

    /* Everything the shopper needs to judge this hand-off, immediately
       above the button that performs it: who checks age, where it ships
       from, and how long it takes. */
    var facts=[ageBadge(st)];
    if(st.days) facts.push('<span class="shipchip">'+esc(st.days)+'</span>');
    if(st.from&&st.from!=='US') facts.push('<span class="shipchip">Ships from '+esc(st.from)+'</span>');

    /* The button now says what it will actually do. One caption for
       every store is how "Checkout at Nicokick →" came to mean "open a
       product page". */
    var plan=checkoutPlan(st,items), n=items.length;
    /* TWO DIFFERENT CLAIMS, and they were being made with one phrase.
       The Shopify permalink carries `discount` and really does apply the
       code; every other hand-off only copies it to the clipboard, and
       saying "with code X" there told the shopper a discount was applied
       when nothing had applied it. */
    var applied = st.coupon && plan.opens!=='item' && plan.opens!=='home'
                && (plan.cap==='all'||plan.cap==='some'||plan.opens==='discount');
    var code = !st.coupon ? ''
             : (applied ? ' with code '+esc(st.coupon)+' applied'
                        : ', and code '+esc(st.coupon)+' is copied for you');
    var label, note;
    if(plan.cap==='all'){
      label='Checkout at '+esc(st.name)+' →';
      note='All '+n+' item'+(n===1?'':'s')+' go into '+esc(st.name)+"'s basket"+code+
           ', and you land on their checkout.';
    }else if(plan.cap==='some'){
      /* Part of the basket is sendable. Counting from plan.filled, never
         from items.length — that mismatch is what let the old note say
         "all 3" while the link carried one. */
      label='Send '+plan.filled+' of '+n+' to '+esc(st.name)+' →';
      note=esc(st.name)+"'s basket link can only carry items we have a variant id for, so "+
           plan.filled+' of your '+n+' go through'+code+'. The other '+plan.rest.length+
           ' are one tap each below.';
    }else if(plan.cap==='one'){
      label=(n>1?'Add first item at ':'Checkout at ')+esc(st.name)+' →';
      note=n>1
        ? esc(st.name)+' can only be sent one item per link, so this adds the first'+code+
          '. The rest are one tap each below.'
        : 'Your item goes straight into '+esc(st.name)+"'s basket"+code+'.';
    }else{
      /* cap:'none' is not one situation. The generic branch opens item
         one's own page; the Shopify no-variant-id branch opens an empty
         cart or a discount link and carries NO item, so promising "your
         first item" there was simply false. */
      var opensItem = plan.opens==='item';
      label=(opensItem?'Open at ':'Go to ')+esc(st.name)+' →';
      note = opensItem
        ? esc(st.name)+' cannot be sent a basket by link, so this opens '+
          (n>1?'your first item':'your item')+' on their site'+
          (st.coupon?', code '+esc(st.coupon)+' copied':'')+'.'
        : esc(st.name)+' cannot be sent a basket by link, so this opens their '+
          (plan.opens==='discount'?'cart with code '+esc(st.coupon)+' already applied'
                                  :'site')+'. Your '+n+' item'+(n===1?'':'s')+
          ' '+(n===1?'is':'are')+' one tap each below.';
    }

    /* Anything the link could not carry, as its own tap. This is the
       only honest way to "handle multiple items" at a store whose URL
       scheme takes one or none. */
    var rest=plan.rest.length
      ? '<div class="drest"><span>Then add at '+esc(st.name)+':</span>'+
        plan.rest.map(function(x){
          /* affWrap() again, not because hydrate() missed it, but
             because a cart is localStorage: these lines can predate
             the day this store got its tracking link. It is a no-op on
             anything already wrapped. */
          return '<a href="'+esc(affWrap(st, x.aff||x.url)||'#')+'" rel="noopener nofollow">'+
                 esc(x.title)+(x.variant?', '+esc(x.variant):'')+'</a>';
        }).join('')+'</div>'
      : '';

    html+='<div class="dgroup"><h3>'+esc(st.name)+'</h3>'+rows+bd+
      '<div class="dfacts">'+facts.filter(Boolean).join('')+'</div>'+
      '<button class="dcheckout" data-checkout="'+esc(sk)+'">'+label+'</button>'+
      '<p class="dnote">'+note+'</p>'+rest+'</div>';
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
      'No password, just an email, so your basket stays linked to you across stores.</p>')+
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

  /* The one spot on a card that opens the photo instead of flipping it —
     must run before the generic .card fallback below, same as every
     other named control on the card. */
  if((el=hit('[data-zoom]'))){ e.preventDefault(); e.stopPropagation();
    openZoom(el.getAttribute('data-zoom'),el.getAttribute('data-zoomalt')||''); return; }

  if((el=hit('[data-save]'))){ e.preventDefault(); e.stopPropagation();
    var g=groupById(el.getAttribute('data-save'));
    if(g){ if(BOARD[g.gid]) delete BOARD[g.gid]; else BOARD[g.gid]=gitem(g);
      saveBoard(); badges(); apply(false);
      trackGroup('save_toggle',g.gid,{value:BOARD[g.gid]?1:0}); }
    return; }
  if((el=hit('[data-add]'))){ e.preventDefault(); e.stopPropagation();
    var gg=groupById(el.getAttribute('data-add'));
    if(gg) addToCart(gitem(gg));
    return; }
  if((el=hit('[data-unsave]'))){ delete BOARD[el.getAttribute('data-unsave')];
    saveBoard(); badges(); renderBoard(); apply(false); return; }
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
  if((el=hit('[data-expand]'))){ e.preventDefault();
    var lk=el.getAttribute('data-expand');
    expandLane(lk); track('lane_expand',{kind:lk}); return; }
  if(hit('[data-collapse]')){ e.preventDefault(); collapseLane(); return; }

  if((el=hit('[data-logostore]'))){ e.preventDefault();
    var k=el.getAttribute('data-logostore');
    if(F.stores[k]) delete F.stores[k]; else F.stores[k]=1;
    F.store='all'; apply(); track('chip_click',{kind:'store',store:k}); return; }
  if((el=hit('[data-logobrand]'))){ e.preventDefault();
    var b=el.getAttribute('data-logobrand');
    if(F.brands[b]) delete F.brands[b]; else F.brands[b]=1;
    F.brand='all'; apply(); track('chip_click',{kind:'brand',brand:b}); return; }
  /* Category, same toggle-into-a-set affordance store/brand already
     have — pouch AND disposable can both be lit at once, which is the
     point of the boot default being a mix rather than a single shelf.
     Still prunes the subcategories that no longer belong, clears the
     brand filter so a brand picked on another shelf can't filter this
     one to nothing, leaves any open spotlight, and pushes a /department
     path when the toggle leaves exactly one department selected. */
  if((el=hit('[data-logocat]'))){ e.preventDefault();
    var newDept=el.getAttribute('data-logocat');
    if(F.depts[newDept]) delete F.depts[newDept]; else F.depts[newDept]=1;
    F.subs=pruneSubs(soleDept()||'all'); F.brands={};
    leaveSpotlight(); pushDeptPath(); apply();
    track('chip_click',{kind:'category',dept:newDept}); return; }
  if((el=hit('[data-storefilter]'))){ e.preventDefault();
    F.stores={}; F.stores[el.getAttribute('data-storefilter')]=1;
    F.store='all';
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
    /* Only the flip TO the detail face is a signal worth counting —
       flipping back isn't a second look at a different thing. */
    if(on){ var cgid=card.getAttribute('data-gid'); if(cgid) trackGroup('card_flip',cgid); }
  }
});

document.addEventListener('change',function(e){
  var t=e.target;
  if(t.matches('[data-flav]')){ var fgid=t.getAttribute('data-flav');
    SELV[fgid]={f:parseInt(t.value,10)||0,v:0};
    saveSelv(); refreshCard(fgid); trackGroup('flavor_select',fgid); return; }
  if(t.matches('[data-str]')){ var gid=t.getAttribute('data-str');
    var s=SELV[gid]||{f:0,v:0};
    SELV[gid]={f:parseInt(s.f,10)||0, v:parseInt(t.value,10)||0};
    saveSelv(); refreshCard(gid); trackGroup('strength_select',gid); return; }
  if(t.matches('[data-qtyset]')){ setQty(t.getAttribute('data-qtyset'),t.value); return; }
});

var _qt;
document.getElementById('q').addEventListener('input',function(e){
  clearTimeout(_qt); var v=e.target.value;
  _qt=setTimeout(function(){F.q=v;apply();},170);});
/* Sort is the only <select> left in the bar — store and brand are the
   logo strips now, and strength and budget are on every card. This was a
   loop over five ids with NO null guard, so one missing element would
   have thrown right here and silently killed every listener registered
   below it, including the department tabs. */
document.getElementById('f-sort').addEventListener('change',function(e){
  F.sort=e.target.value; apply();});
document.getElementById('f-deals').addEventListener('click',function(){
  F.deals=!F.deals; this.classList.toggle('active',F.deals);
  this.setAttribute('aria-pressed',F.deals); apply();});
/* Shuffle only moves the strip — it must NOT run apply(), which would
   reset RAILP to 0 and land you back on the same twelve cards. */
(function(){
  var b=document.getElementById('railShuffle');
  if(b) b.addEventListener('click',function(){ RAILP++; renderRail(); });
})();
/* One "Show all" for the merged strip, not three — it resets category,
   store AND brand together, matching the row they now share. */
document.getElementById('clearPicker').addEventListener('click',function(){
  F.depts={}; F.subs=pruneSubs('all'); F.stores={}; F.brands={};
  leaveSpotlight(); pushDeptPath(); apply();});
document.getElementById('clear').addEventListener('click',function(){
  F={q:'',depts:{},subs:{},store:'all',brand:'all',strength:'all',price:'all',
     sort:'unit',deals:false,stores:{},brands:{}};
  document.getElementById('q').value='';
  document.getElementById('f-sort').value='unit';
  document.getElementById('f-deals').classList.remove('active');
  /* Category/store/brand re-render their own "on" state from F on the
     apply() below — the old code synced .dept[data-dept] buttons by
     hand here, which is exactly the DOM those buttons no longer are. */
  leaveSpotlight(); pushDeptPath(); apply();});

document.getElementById('scrim').addEventListener('click',function(){
  drawer('board',false);drawer('list',false);});
document.querySelectorAll('[data-close]').forEach(function(b){
  b.addEventListener('click',function(){drawer('board',false);drawer('list',false);});});

/* ============================================================
   IMAGE ZOOM
   ------------------------------------------------------------
   Full-screen viewer opened by a card's .zoom button (wired into the
   click delegate above, ahead of the flip fallback). Click the photo to
   zoom in around wherever you clicked; click again to zoom back out. */
var imgzoom=document.getElementById('imgzoom');
var imgzoomImg=document.getElementById('imgzoomImg');
var imgzoomCap=document.getElementById('imgzoomCap');
function openZoom(src,alt){
  if(!src) return;
  imgzoomImg.src=src; imgzoomImg.alt=alt; imgzoomImg.classList.remove('in');
  imgzoomCap.textContent=alt;
  imgzoom.classList.add('on');
  document.body.style.overflow='hidden';
}
function closeZoom(){
  if(!imgzoom.classList.contains('on')) return;
  imgzoom.classList.remove('on');
  imgzoomImg.src='';
  document.body.style.overflow='';
}
imgzoomImg.addEventListener('click',function(e){
  e.stopPropagation();
  if(this.classList.contains('in')){ this.classList.remove('in'); return; }
  var r=this.getBoundingClientRect();
  this.style.transformOrigin=
    ((e.clientX-r.left)/r.width*100).toFixed(1)+'% '+((e.clientY-r.top)/r.height*100).toFixed(1)+'%';
  this.classList.add('in');
});
imgzoom.addEventListener('click',function(e){ if(e.target===imgzoom) closeZoom(); });
document.querySelector('[data-zoomclose]').addEventListener('click',closeZoom);

/* ============================================================
   PICKER LANE "EXPAND ALL"
   ------------------------------------------------------------
   A lane at its normal width is still a scroller — this turns ONE
   lane's own scroll container into a full-viewport wrapping grid IN
   PLACE, rather than cloning its chips into a separate overlay. Same
   DOM nodes, same ids, so a click on a chip still runs through the one
   delegated handler above and renderPickerRow()'s normal re-render (on
   state, counts, joint faceting) keeps working without knowing
   expansion exists at all.

   Left open after a pick, unlike the image zoom — store and brand are
   multi-select, and closing on the first tap would defeat the point of
   opening this to choose several. Backdrop click, the ×, or Escape
   close it. */
var lrBackdrop=document.getElementById('lrBackdrop');
function expandLane(which){
  var lane=document.querySelector('.lrlane[data-lane="'+which+'"]');
  if(!lane||lane.hidden) return;
  /* collapseLane() only ever finds and closes ONE .expanded lane — two
     open at once would leave the second stuck full-screen (with body
     scroll still locked) after the first is dismissed. */
  collapseLane();
  lane.classList.add('expanded');
  lrBackdrop.hidden=false;
  document.body.style.overflow='hidden';
}
function collapseLane(){
  var open=document.querySelector('.lrlane.expanded');
  if(!open) return;
  open.classList.remove('expanded');
  lrBackdrop.hidden=true;
  document.body.style.overflow='';
}
lrBackdrop.addEventListener('click',collapseLane);

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){ closeZoom(); collapseLane(); }
});
document.getElementById('openBoard').addEventListener('click',function(){renderBoard();drawer('board',true);track('board_open',{});});
document.getElementById('openList').addEventListener('click',function(){renderCart();drawer('list',true);track('cart_open',{});});
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
/* A SPOTLIGHT IS A REAL PATH NOW: /store/nicokick, not #/store/nicokick.

   A hash never reaches the server, so the old form was invisible to
   every crawler and every link unfurler — the department shelves were
   given real paths for exactly this reason and spotlights never got the
   same treatment. vercel.json rewrites /store/:key to this document and
   the key is read back off the path here, the same shape deptFromPath()
   already uses.

   The hash form is still READ, because links to it are already out in
   the world. migrateSpotHash() below rewrites them to the path on
   arrival, so nothing has to keep working in two shapes past boot. */
var SPOT_PATH=/^\/store\/([a-z0-9_-]+)\/?$/i;
function currentRoute(){
  var m=String(location.pathname||'').match(SPOT_PATH);
  if(m) return {view:'spotlight', key:m[1].toLowerCase()};
  var h=(location.hash||'').match(/^#\/store\/([a-z0-9_-]+)/i);
  return h ? {view:'spotlight', key:h[1].toLowerCase()} : {view:'mall'};
}
function spotPath(key){ return '/store/'+encodeURIComponent(key); }

/* Old shared links keep working, once. Rewritten in place rather than
   redirected, so the address bar and any subsequent share carry the
   crawlable form and the Back button has nothing odd in it. */
function migrateSpotHash(){
  var h=(location.hash||'').match(/^#\/store\/([a-z0-9_-]+)/i);
  if(!h) return;
  try{ history.replaceState({},'',spotPath(h[1].toLowerCase())+location.search); }catch(e){}
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
  /* Drop a legacy hash without adding a history entry for it, then push
     the shelf the reader has just chosen. pushDeptPath() runs right
     after this in every caller and finds the path already correct, so
     leaving a spotlight costs one history entry, not two. */
  if(location.hash){
    try{ history.replaceState({},'',location.pathname+location.search); }catch(e){}
  }
  var d=soleDept()||'all', want=d==='all'?'/':('/'+DEPT_PATH[d]);
  try{ history.pushState({depts:F.depts},'',want+location.search); }catch(e){}
  route();
  return true;
}
function route(){
  var r=currentRoute();
  var mall=document.getElementById('mallview');
  var spot=document.getElementById('spotview');
  if(r.view==='spotlight' && SPOTLIGHT[r.key]){
    mall.hidden=true; spot.hidden=false;
    /* apply() does not run on this branch, so the picker row would keep
       whatever the mall left behind. Hide it here; renderPickerRow()
       holds the same rule for anything that renders it later. */
    var pr=document.getElementById('pickerRow'); if(pr) pr.hidden=true;
    renderSpotlight(r.key);
    setRouteMeta();          /* apply() does not run here, so this must */
    window.scrollTo(0,0);
  }else{
    spot.hidden=true; mall.hidden=false;
    if(ALL.length) apply();
  }
  document.querySelectorAll('[data-route]').forEach(function(a){
    var href=a.getAttribute('href')||'';
    a.setAttribute('aria-current',
      (href===location.pathname || href===location.hash) ? 'page':'false');
  });
}
window.addEventListener('hashchange',route);

/* IN-PAGE NAVIGATION TO A SPOTLIGHT. The link is a real href, so it
   works with no JS, opens in a new tab on middle-click and is a real
   crawlable link — this only saves the full reload for an ordinary
   left-click. Modified clicks are left to the browser. */
document.addEventListener('click',function(e){
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
  var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
  if(!a||a.target||a.hasAttribute('download')) return;
  var href=a.getAttribute('href')||'';
  if(!SPOT_PATH.test(href)) return;
  e.preventDefault();
  if(location.pathname===href) return;
  try{ history.pushState({},'',href); }catch(err){ location.assign(href); return; }
  route();
});

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
      '<a class="sbacklink" href="/">&larr; All stores</a>'+
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
          ? '<img src="'+esc(it.image)+'" alt="'+esc(it.title)+'" loading="lazy" referrerpolicy="no-referrer">'+
            zoomBtnHtml(it.image,it.title)
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
        '<button class="buy" type="button" data-sadd="'+ix+'">Add, '+money(p.now,cur)+'</button>'+
        '<button class="turn-back" type="button">↺</button>'+
      '</div></div></div></article>';
  }).join('');

  el.innerHTML='<div class="shell">'+
    '<a class="sbacklink" href="/">&larr; All stores</a>'+
    '<header class="shero"><p class="eyebrow">'+esc(cfg.eyebrow)+'</p>'+
      '<h1>'+esc(cfg.headline)+'</h1><p class="sblurb">'+esc(cfg.blurb)+'</p>'+
      '<div class="sstats"><div><b>'+mine.length+'</b><span>products</span></div>'+
        '<div><b>'+inStock+'</b><span>in stock</span></div>'+
        (lo?'<div><b>'+money(lo,cur)+(hi>lo?'–'+money(hi,cur):'')+'</b><span>price range</span></div>':'')+
      '</div>'+
      (cfg.coupon&&cfg.off>0
        ? '<div class="sdeal">Prices shown include <b>'+Math.round(cfg.off*100)+
          '% off</b>, enter <b>'+esc(cfg.coupon)+'</b> at checkout</div>':'')+
    '</header><div class="grid">'+cards+'</div>'+
    '<footer class="sfoot">'+
      '<button class="btn" data-addall="'+esc(key)+'">Add everything in stock to cart</button>'+
      '<button class="btn" data-storefilter="'+esc(key)+'">See '+esc(st.name)+' in the market</button>'+
      '<p>'+esc(cfg.note||'')+' Add what you want, then check out at '+esc(st.name)+
      ' from your cart, it arrives filled. We earn a commission on purchases '+
      'made through this page. It never changes your price.</p>'+
    '</footer></div>';
}

/* ============================================================
   LOAD
   ============================================================ */
function skeleton(){var h='';for(var i=0;i<12;i++)h+='<div class="sk"></div>';
  document.getElementById('mount').innerHTML='<div class="skel">'+h+'</div>';}

/* ONE SPELLING PER BRAND.

   nk() strips case and punctuation, so grouping was already treating
   "ON!" and "on!" as the same brand — but every LABEL came from the raw
   string, so the same brand produced two pills, two logo chips and two
   entries in every count. Sixteen stores describing the same
   manufacturer their own way guarantees this.

   Choosing the winner is not simply "most common". Measured against the
   live catalogue, that alone returns "zone" over "Zone" (37 to 26) and
   settles KILLA/Killa on a 39-39 tie by accident. So, in order:

     1. discard all-lowercase spellings when any other exists — no brand
        here is genuinely lowercase, so those are data entry, not style
     2. most common wins
     3. on a tie, prefer FEWER shouted words: "Killa" reads as a name,
        "KILLA" reads as a warning. A brand that is genuinely
        capitalised, like STIIIZY, still wins on count at step 2
     4. alphabetical, purely so the result is deterministic */
function canonBrands(items){
  var spellings={};
  items.forEach(function(it){
    var b=it.brand; if(!b) return;
    var k=nk(b); if(!k) return;
    (spellings[k]||(spellings[k]={}))[b]=(spellings[k][b]||0)+1;
  });
  var shouted=function(s){
    return s.split(/\s+/).filter(function(w){
      return w.length>1 && w===w.toUpperCase() && w!==w.toLowerCase();
    }).length;
  };
  var best={};
  Object.keys(spellings).forEach(function(k){
    var v=spellings[k], all=Object.keys(v);
    var cased=all.filter(function(s){ return s!==s.toLowerCase(); });
    var pool=cased.length?cased:all;
    pool.sort(function(a,b){
      return (v[b]-v[a]) || (shouted(a)-shouted(b)) || a.localeCompare(b);
    });
    best[k]=pool[0];
  });
  items.forEach(function(it){
    if(!it.brand) return;
    var k=nk(it.brand);
    if(k&&best[k]) it.brand=best[k];
  });
}

/* Words that reach the brand slot often enough to look plausible but are
   never a brand: flavours, formats and marketing filler lifted out of a
   title. Frequency alone cannot catch these, because "Mint" is on hundreds
   of listings and sails through any count test you write.
   Whole single words only. Nothing here is a nicotine brand, and anything
   genuinely ambiguous is left out rather than guessed at. */
var NOTBRAND={};
/* NOT "ice". It looks like a flavour and it is not: ICE is a real pouch
   brand with 26 listings here (Ice Frost, Ice Freeze XL, Ice Cola Slush,
   Ice Jalapeno Lime). Checked before adding, and it stays out of this list.
   Check the same way before you add anything else that looks obvious. */
('mint wintergreen spearmint peppermint menthol citrus berry cherry apple '+
 'mango melon peach vanilla coffee cinnamon licorice liquorice original '+
 'classic cool fresh smooth strong bold extra slim mini regular '+
 'pouch pouches snus nicotine tobacco can cans roll tin tins flavour flavor '+
 'better best perfect premium value new sale clearance bundle sample '+
 'variety mixed assorted pack packs christmas holiday gift'
).split(' ').forEach(function(w){ NOTBRAND[w]=1; });

/* Counts LISTINGS, not groups. A brand that appears on two or more products
   anywhere in the catalogue is a brand; one that appears exactly once is
   almost always a stray word promoted out of a title. Must run after
   canonBrands so "zone" and "Zone" are counted as the same thing. */
function markRealBrands(items){
  var n={};
  items.forEach(function(it){
    if(!it.brand) return;
    var k=nk(it.brand); if(!k) return;
    n[k]=(n[k]||0)+1;
  });
  BRANDOK={};
  Object.keys(n).forEach(function(k){
    if(n[k]>1 && !NOTBRAND[k]) BRANDOK[k]=1;
  });
}

function ingest(items){
  ALL=items;
  canonBrands(ALL);
  markRealBrands(ALL);
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
  facets(); stamp(); route();
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
    sub: it.sub||'',
    /* NO STORE-NAME FALLBACK. row() omits `brand` when it equals the
       store's own name, and filling that gap with st.name here put the
       shop back in as a brand — "EightVape" showed up as a 64-product
       brand pill. buildGroups() already handles an empty brand by
       promoting the product's own flavour or title, which is a truthful
       label; the shop's name is not. */
    brand: it.brand||'',
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
    /* ?ref= first, then the wrapper — a wrapping network carries ref:''
       so only one of the two ever applies, and affWrap() is a no-op for
       every store that has no `click`. */
    aff: affWrap(st, (url && st.ref)
       ? url+(url.indexOf('?')>-1?'&':'?')+'ref='+st.ref
       : (url || (st.domain?'https://'+st.domain+'/':'')))
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
  var url = API_URL+(refresh?'?refresh':'');

  /* RETRY, because the first failure is usually not a real one.
     A cold instance with nothing in the shared cache has to scrape 17
     stores, which measures ~42s against a 60s ceiling. When one store
     drags, that request 504s and the OLD code dead-ended on "Can't load
     products right now" for good. But that failed request warmed the
     function, so the very next one lands in a second. Dead-ending there
     was throwing the page away one moment before it would have worked.

     Waits are generous on purpose: retrying instantly just races the same
     unfinished scrape. Only idempotent GETs, so a retry is always safe. */
  var WAITS = [4000, 12000, 25000];
  var tries = 0;

  /* Paint the loading state before the first request, not just between
     retries. An empty grid for 42 seconds is indistinguishable from a
     dead page, and this is the state most first-time visitors will see. */
  waiting(0, 0);

  function attempt(){
    fetch(url,{redirect:'follow'})
      .then(function(r){
        if(!r.ok) throw new Error('API returned HTTP '+r.status);
        return r.json();
      })
      .then(received)
      .catch(function(e){
        if(tries < WAITS.length){
          var wait = WAITS[tries++];
          /* Say what is happening. A spinner that never changes reads as
             broken, and this one can legitimately run for a minute. */
          waiting(tries, Math.round(wait/1000));
          setTimeout(attempt, wait);
          return;
        }
        failed(e.message||'Network error');
      });
  }
  attempt();
}

/* Shown between retries. Deliberately honest about the cause rather than
   a bare spinner: the first visitor after a quiet spell really is waiting
   on a live scrape of every store. */
function waiting(n, secs){
  var m=document.getElementById('mount'); if(!m) return;
  m.innerHTML='<div class="loadwrap"><div class="loadspin" aria-hidden="true"></div>'+
    '<b>Pulling live prices from every store</b>'+
    '<span>Nobody has loaded the market in a while, so we are fetching it fresh. '+
    'This can take up to a minute the first time, then it is instant for '+
    'everybody after you.</span>'+
    (n ? '<small>Attempt '+(n+1)+', retrying in '+secs+'s</small>' : '')+
    '</div>';
  var c=document.getElementById('rcount'); if(c) c.textContent='';
}

/* ============================================================
   INSTALL AS AN APP
   ------------------------------------------------------------
   Apple's guideline 1.4.3 bars apps that encourage tobacco or vape
   consumption or facilitate their sale, and Google Play restricts the
   same, so the App Store was never a route for this catalogue. The
   home-screen web app IS the app.

   Which means the install prompt matters more here than it usually
   would, and iOS gives us none: Safari has no beforeinstallprompt, so
   without a hint nobody ever discovers Share -> Add to Home Screen.
   ============================================================ */
/* Detection and the per-browser wording both live in js/install.js,
   because /android needs exactly the same answers and two copies of
   "where is the Share button" would drift. */
function isStandalone(){ return !!(window.NM_INSTALL && NM_INSTALL.isStandalone()); }
function isIOS(){ return !!(window.NM_INSTALL && NM_INSTALL.isIOS()); }

function dismissInstall(){
  store_('nm_install_hint','off');
  var el=document.getElementById('installhint');
  if(el) el.remove();
}

function maybeOfferInstall(){
  if(!window.NM_INSTALL) return;
  if(isStandalone()) return;                      /* already an app */
  if(read_('nm_install_hint')==='off') return;    /* they said no */
  if(document.getElementById('installhint')) return;

  var d=NM_INSTALL.detect();
  if(d.os==='desktop') return;                    /* nothing to add here */

  /* On Android, Chrome fires a real install prompt — showing menu
     instructions next to a one-tap button is worse than useless. Wait a
     beat, and only hand-hold the browsers that never offer one
     (Firefox, Samsung Internet, Opera). */
  if(d.os==='android' && DEFERRED_INSTALL) return;

  var el=document.createElement('div');
  el.id='installhint'; el.className='installhint'; el.setAttribute('role','dialog');
  /* steps() returns our own markup, not user input — inserted as HTML so
     the control names can be emphasised. */
  el.innerHTML=
    '<img src="/assets/apple-touch-icon.png" alt="" width="42" height="42">'+
    '<div class="ih-copy"><b>Add Nicotia to your Home Screen</b>'+
    '<span>'+NM_INSTALL.steps()+
    (d.os==='ios' && d.name!=='Safari'
      ? ' Installing from <b>Safari</b> also enables price alerts later.'
      : '')+'</span></div>'+
    '<button class="ih-x" type="button" aria-label="Dismiss">&times;</button>';
  document.body.appendChild(el);
  el.querySelector('.ih-x').addEventListener('click',dismissInstall);
}

/* Android and desktop Chrome DO fire this, so take the real prompt when
   it is offered instead of showing anyone the iOS instructions. */
var DEFERRED_INSTALL=null;
window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault(); DEFERRED_INSTALL=e;
  var el=document.getElementById('installhint'); if(el) el.remove();
  var bar=document.createElement('div');
  bar.id='installhint'; bar.className='installhint';
  bar.innerHTML='<img src="/assets/apple-touch-icon.png" alt="" width="42" height="42">'+
    '<div class="ih-copy"><b>Install Nicotia</b><span>Keep the whole market one tap away.</span></div>'+
    '<button class="ih-go" type="button">Install</button>'+
    '<button class="ih-x" type="button" aria-label="Dismiss">&times;</button>';
  document.body.appendChild(bar);
  bar.querySelector('.ih-go').addEventListener('click',function(){
    if(!DEFERRED_INSTALL) return;
    DEFERRED_INSTALL.prompt(); DEFERRED_INSTALL=null; dismissInstall();
  });
  bar.querySelector('.ih-x').addEventListener('click',dismissInstall);
});

/* The worker caches the SHELL ONLY — never /api/products, because the
   live-pricing promise and the "Checked N min ago" stamp both depend on
   that request actually happening. See sw.js. */
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('/sw.js').catch(function(){ /* non-fatal */ });
  });
}

/* boot */
/* Independent of the catalogue — the backdrop should be falling before
   the first product ever loads, cold-scrape or not. */
spawnLeaves(document.querySelector('.bgscape'), 64);
loadLoc(); restoreUserLoc(); locPillUI(); setAgeCopy(); setWarn(); setNotices();
loadSelv(); loadCart(); loadBoard(); badges(); accountUI(); setAuthMode('signup'); renderCart();
/* An old #/store/* link becomes /store/* before anything reads the
   route, so currentRoute(), setRouteMeta() and route() below all see
   one shape rather than each having to know about both. */
migrateSpotHash();
/* The path picks the opening shelf BEFORE the first render, so /pouches
   opens on Pouches instead of dumping the visitor into Everything —
   and the homepage opens on the curated pouch+disposable mix instead
   of either a single shelf or the full six-department "everything". */
F.depts=bootDepts(); setRouteMeta();
skeleton(); renderStoreList(); route();
if(read_('nm_age')==='1' && hasLoc()){ closeGate(); maybeOfferInstall(); }
else openGate(false);   /* never stack an install hint on top of the age gate */

/* The Apps Script google.script.run branch is gone — this is a static
   page on Vercel and the catalogue comes from api/products.js.
   ?refresh on the page URL bypasses the API cache, which is how you
   check a store fix without waiting out the TTL. */
loadCatalogue();
