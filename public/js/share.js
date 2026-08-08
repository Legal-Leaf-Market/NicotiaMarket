/* ============================================================
   share.js — get the word out
   ------------------------------------------------------------
   Loaded by index.html and story.html. Its own file for the same reason
   install.js is: two consumers, and the share text must be identical in
   both or the campaign says two different things.

   NO THIRD-PARTY WIDGETS. Facebook's and X's official share buttons each
   pull a script and a tracker onto the page, and this repo has no build
   step, no bundler and a service worker that would end up caching them.
   Plain links to documented share endpoints do the same job with nothing
   to load and nothing watching the reader.

   Native first: on a phone, navigator.share opens the real system sheet,
   which reaches WhatsApp, Signal, Messages and every app the reader
   already uses — far more of the internet than any five buttons.
   ============================================================ */
window.NM_SHARE = (function () {

  var ORIGIN = 'https://nicotiamarket.com';

  /* The default payload — the campaign line, and what any surface without
     its own entry in PAGES falls back to. */
  var SHARE = {
    url:   'https://nicotiamarket.com/story',
    title: 'Nicotia: A Word for the People',
    /* What actually lands in a post. Kept short enough to survive X's
       limit with the URL attached. */
    text:  'Nicotia: A Word for the People. It’s a love story, really, ' +
           'four hundred years of people reaching for the same name. ' +
           'From Jean Nicot to your front door.',
    /* The longer version, for the platforms where you paste a caption
       rather than click a button. Line breaks and hashtags survive a
       paste into Instagram and TikTok; they would be noise in a tweet. */
    caption: 'Nicotia: A Word for the People.\n\n' +
             'It’s a love story, really. Four hundred years of people reaching for the ' +
             'same name, a French ambassador, a Swedish botanist, a Victorian poet, ' +
             'and a laboratory in Heidelberg.\n\n' +
             'Nicotia was what people called it long before chemistry called it nicotine. ' +
             'We took the name back.\n\n' +
             'From Jean Nicot to your front door.\n' +
             'nicotiamarket.com/story\n\n' +
             'Adults 21+ only.\n\n' +
             '#Nicotia #NicotiaMarket #nicotinepouches #snus #etymology #JeanNicot',
    /* The image Pinterest pins and the card the link unfurls to. */
    media: '/assets/og-story.png',
    /* ---- BITE-SIZE ----
       The line people actually repost is one sentence, not an article. Each
       entry carries its own citation because an unattributed claim is how
       a good fact turns into a bad meme, and because half of these are
       surprising enough that the first reply will be "source?".
       Kept under ~200 chars so the quote, the cite and the URL all survive
       X's limit together. */
    quotes: [
      { q: 'Nicotia was what people called it long before chemistry called it nicotine.',
        cite: 'Oxford English Dictionary, first attested 1830s' },
      { q: 'A French ambassador posted some seed to Paris in 1560 and ended up with his ' +
           'name on the molecule.',
        cite: 'Jean Nicot; genus fixed by Linnaeus, 1753' },
      { q: 'From Jean Nicot to your front door.',
        cite: 'Nicotia Market' }
    ],
    /* 1080 square and 1080x1920 vertical, for the platforms that want an
       image rather than a link. */
    square:   '/assets/share-square.png',
    vertical: '/assets/share-vertical.png'
  };

  /* ---- PER-PAGE PAYLOADS ----
     Every article shares ITSELF. This used to be one hardcoded object
     pointing at /story, which meant a reader who finished the manifesto and
     hit Share posted the etymology page instead — the single worst bug a
     share button can have, because it fails silently and looks fine.

     Keyed by pathname with no trailing slash. Anything not listed falls
     back to SHARE above, so adding a page is additive and forgetting one
     degrades to the campaign line rather than to a broken link. */
  var PAGES = {
    '/word-for-smoke': {
      url:   ORIGIN + '/word-for-smoke',
      title: 'The Word for Smoke Is the Word for Soul',
      media: '/assets/og-smoke.png',
      text:  'In Biblical Hebrew, breath, wind, spirit and soul are nearly the same ' +
             'handful of words, and “hevel,” the word Ecclesiastes repeats, doesn’t ' +
             'mean vanity. It means vapor. Everything is vapor. Including you.',
      caption: 'The word for smoke is the word for soul.\n\n' +
               'In Biblical Hebrew, breath, wind, spirit and soul are nearly the same ' +
               'handful of words. “Nefesh”, the word translated soul for four hundred ' +
               'years, is rooted in the word for THROAT. They put the self at the place ' +
               'where the air goes through.\n\n' +
               '“Hevel,” the word Ecclesiastes repeats over and over, has been ' +
               'translated “vanity” since 1611. It actually means VAPOR. Everything is ' +
               'vapor. Including you.\n\n' +
               'And in Exodus, the seventh day gets a verb built from the word for soul. ' +
               'Robert Alter translates it: God rested and caught His breath.\n\n' +
               'The first thing scripture ever calls holy isn’t a temple. It’s a break.\n\n' +
               'nicotiamarket.com/word-for-smoke\n\nAdults 21+ only.\n\n' +
               '#Nicotia #NicotiaMarket #hevel #Ecclesiastes #etymology #Hebrew #Sabbath',
      quotes: [
        { q: '“Hevel” doesn’t mean vanity. It means vapor. So Ecclesiastes isn’t saying ' +
             'none of this matters. It’s saying everything is a breath you can see for ' +
             'a second. Including you.',
          cite: 'Ecclesiastes 1:2, havel havalim' },
        { q: '“God rested and caught His breath.”',
          cite: 'Robert Alter’s translation of Exodus 31:17' },
        { q: 'The Hebrew word translated “soul” for four hundred years, nefesh, is ' +
             'rooted in the word for THROAT. They located the self at the place where ' +
             'the air goes through.',
          cite: 'Biblical Hebrew, standard lexicography' },
        { q: 'The first thing scripture ever calls holy is not a mountain, a temple or a ' +
             'person. It is a day. The first holy thing in the book is a break.',
          cite: 'Genesis 2:3; Heschel, “The Sabbath” (1951)' },
        { q: 'The first person in the Bible to die is named Vapor. Abel, in Hebrew, is ' +
             'Hevel, the same word Ecclesiastes repeats two hundred times.',
          cite: 'Genesis 4:2' },
        { q: 'For most of human history, smoke was how you talked to whatever was above ' +
             'you. Not a side effect of worship, the medium of it. Smoke was the ' +
             'visible part of the prayer.',
          cite: 'Psalm 141:2; incense across most traditions' },
        { q: '“If there aren’t cigarette butts in your parking lot, you’re not doing ' +
             'church right.”',
          cite: 'Common saying, American evangelical, no reliable attribution' }
      ]
    },
    '/older-than-the-word': {
      url:   ORIGIN + '/older-than-the-word',
      title: 'The Appetite Is Older Than the Word',
      media: '/assets/og-older.png',
      text:  'Our name is 190 years old. The molecule is about a hundred million. ' +
             'The atoms are 13.8 billion. The hydrogen is from the Big Bang and the ' +
             'carbon and nitrogen were made inside stars. We named a relationship. ' +
             'We did not invent one.',
      caption: 'The appetite is older than the word.\n\n' +
               'Nicotine is C10H14N2. The hydrogen in it was forged in the first ' +
               'minutes of the universe. The carbon and nitrogen had to be cooked ' +
               'inside stars, and those stars had to die, before there was an Earth ' +
               'for them to land on.\n\n' +
               'The word “Nicotia” is 190 years old. The molecule is around a hundred ' +
               'million. The atoms are 13.8 billion.\n\n' +
               'There’s also a serious scientific argument, Ed Hagen’s, that the ' +
               'mainstream “hijack” explanation quietly assumes a drug-free human past ' +
               'that never existed.\n\n' +
               'We named a relationship. We did not invent one.\n\n' +
               'nicotiamarket.com/older-than-the-word\n\nAdults 21+ only.\n\n' +
               '#Nicotia #NicotiaMarket #evolution #anthropology #deeptime',
      quotes: [
        { q: 'The word is 190 years old. The molecule is around a hundred million. ' +
             'The atoms are 13.8 billion.',
          cite: 'Nicotia Market' },
        { q: 'The hydrogen in nicotine was made in the first minutes of the universe and ' +
             'essentially none has been made since. The carbon and nitrogen had to be ' +
             'cooked inside stars first.',
          cite: 'Big Bang and stellar nucleosynthesis; C10H14N2, Melsens 1843' },
        { q: 'Nicotine is an insecticide. The plant builds it in the roots and files it ' +
             'in the leaves to poison whatever tries to eat it. Which raises an awkward ' +
             'question about us.',
          cite: 'The paradox of drug reward' },
        { q: 'The mainstream explanation for why we like drugs quietly requires a ' +
             'drug-free human past. There is a serious argument that no such past ' +
             'ever existed.',
          cite: 'Sullivan, Hagen & Hammerstein, Proc. R. Soc. B (2008)' },
        { q: 'We named a relationship. We did not invent one.',
          cite: 'Nicotia Market' }
      ]
    },
    '/nicotine-at-work': {
      url:   ORIGIN + '/nicotine-at-work',
      title: 'Nicotine at Work',
      media: '/assets/og-work.png',
      text:  'Offices used to come with ashtrays. Sixty years of policy was aimed at ' +
             'smoke, not nicotine, and now that the two have come apart, most ' +
             'workplace rules point at something that is no longer there.',
      caption: 'Nicotine at Work, the history of the smoke break, and what replaced it.' +
               '\n\nOffices used to come with ashtrays. Then sixty years of policy was ' +
               'aimed at SMOKE, the shared air, the ashtrays, the indoor haze.\n\n' +
               'Smoke and nicotine have now come apart. Most workplace rules are still ' +
               'pointing at something that isn’t there any more, and a lot of them have ' +
               'quietly stopped being about air quality at all.\n\n' +
               'From Arizona in 1973 to hiring bans and insurance surcharges.\n\n' +
               'nicotiamarket.com/nicotine-at-work\n\nAdults 21+ only.\n\n' +
               '#Nicotia #NicotiaMarket #workplace #HR #smokebreak #policy',
      quotes: [
        { q: 'Sixty years of workplace policy was aimed at SMOKE, the shared air, the ' +
             'ashtrays, the haze. Smoke and nicotine have now come apart, and most of ' +
             'those rules are pointing at something that is no longer there.',
          cite: 'Nicotia Market' },
        { q: 'Offices used to come with ashtrays. On the desk. Standard issue.',
          cite: 'Nicotia Market' },
        { q: 'The smoke break was never really about smoke. It was the only sanctioned ' +
             'way to stop working for five minutes without asking permission.',
          cite: 'Nicotia Market' }
      ]
    },
    '/poets-of-tobacco': {
      url:   ORIGIN + '/poets-of-tobacco',
      title: 'The Poets of Tobacco',
      media: '/assets/og-poets.png',
      text:  'In 1898 somebody published an entire anthology of tobacco poetry. Four ' +
             'centuries of poets wrote love letters to this plant, and then it stopped.',
      caption: 'The Poets of Tobacco, four centuries of verse about the leaf.\n\n' +
               'In 1898 somebody published “Lyra Nicotiana,” a whole anthology of ' +
               'tobacco poetry. Barclay, Rowlands, Holiday, Southey, Lowell, real ' +
               'poets, writing real love poems to this plant, for four hundred years.\n\n' +
               'Somebody wrote an elegy for a used quid of tobacco in 1798 and it is ' +
               'genuinely good.\n\nAnd then it stopped.\n\n' +
               'Includes our anthem, which is older than the United States.\n\n' +
               'nicotiamarket.com/poets-of-tobacco\n\nAdults 21+ only.\n\n' +
               '#Nicotia #NicotiaMarket #poetry #literature #tobaccohistory',
      quotes: [
        { q: 'In 1898 somebody published an entire anthology of tobacco poetry. Not a ' +
             'pamphlet, an anthology. Four centuries of poets writing love letters to ' +
             'one plant.',
          cite: '“Lyra Nicotiana” (1898)' },
        { q: 'Somebody wrote an elegy for a used quid of tobacco in 1798, and it is ' +
             'genuinely good.',
          cite: 'Collected in “Lyra Nicotiana” (1898)' },
        { q: 'Poets wrote about this plant for four hundred years. Then, quite abruptly, ' +
             'it stopped, and nobody has really written one since.',
          cite: 'Nicotia Market' }
      ]
    },
    '/library': {
      url:   ORIGIN + '/library',
      title: 'The Nicotia Market Library',
      media: '/assets/og-story.png',
      text:  'A price comparison site that writes. Etymology, evolution, Hebrew, ' +
             'workplace policy and four centuries of tobacco verse, all of it checked ' +
             'before it was written.',
      caption: 'The Nicotia Market Library.\n\n' +
               'We are a price comparison site. We also write, and we check it before ' +
               'we publish it.\n\n' +
               'The etymology of the word Nicotia. Why breath, spirit, soul and vapor ' +
               'are nearly the same word in Hebrew. What evolution says about the ' +
               'appetite. The history of the smoke break. Four hundred years of ' +
               'tobacco poetry.\n\n' +
               'nicotiamarket.com/library\n\nAdults 21+ only.\n\n' +
               '#Nicotia #NicotiaMarket #etymology #history'
    },
    '/': {
      url:   ORIGIN + '/',
      title: 'Nicotia Market, every price, by the unit',
      media: '/assets/og-default.png',
      text:  'Nicotine priced honestly: per pouch, per 1,000 puffs, per ml, per stick. ' +
             'We hold no stock and sell nothing, we just show you the real number.',
      caption: 'Nicotia Market, every price, by the unit.\n\n' +
               'Per pouch. Per 1,000 puffs. Per ml. Per stick.\n\n' +
               'Shelf prices hide the actual cost. A 30K disposable at $16.99 and a 60K ' +
               'at $19.99 are not close, one is 42% cheaper per puff, and you cannot ' +
               'see that on the shelf.\n\n' +
               'We hold no stock and we sell nothing. We just do the division.\n\n' +
               'From Jean Nicot to your front door.\n\n' +
               'nicotiamarket.com\n\nAdults 21+ only.\n\n' +
               '#Nicotia #NicotiaMarket #nicotinepouches #snus #vape',
      quotes: [
        { q: 'A 30K disposable at $16.99 and a 60K at $19.99 are not close. One is 42% ' +
             'cheaper per puff. You cannot see that on the shelf price, which is exactly ' +
             'why the shelf price is the one they show you.',
          cite: 'Nicotia Market, priced per 1,000 puffs' },
        { q: 'Per pouch. Per 1,000 puffs. Per ml. Per stick. Everything else is packaging.',
          cite: 'Nicotia Market' },
        { q: 'We hold no stock and we sell nothing. We just do the division.',
          cite: 'Nicotia Market' }
      ]
    }
  };

  /* Resolves the payload for the page we are actually on. Falls back to the
     campaign line so a new page is never worse than the old behaviour. */
  function payload(override) {
    if (override && typeof override === 'object') return merge(SHARE, override);
    var p = (location.pathname || '/').replace(/\/+$/, '') || '/';
    var hit = PAGES[p];
    /* cleanUrls means /foo and /foo.html are the same page */
    if (!hit && /\.html$/.test(p)) hit = PAGES[p.replace(/\.html$/, '')];
    return hit ? merge(SHARE, hit) : SHARE;
  }

  function merge(base, extra) {
    var o = {}, k;
    for (k in base)  if (Object.prototype.hasOwnProperty.call(base, k))  o[k] = base[k];
    for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  function enc(s) { return encodeURIComponent(s); }

  /* Documented share endpoints only. No SDKs, no scripts, no pixels.

     INSTAGRAM AND TIKTOK ARE ABSENT ON PURPOSE, and it is not an
     oversight: neither has a web endpoint that can pre-fill a post. A
     button claiming to post to them would be a lie. What actually
     reaches them is navigator.share() on a phone — the system sheet
     lists every app the reader has installed — and, failing that, the
     ready-made image plus a copyable caption. Both are provided.

     Pinterest DOES take a URL, and it wants a media image, which is why
     it can be a real button now that the cards exist. */
  function targets(o) {
    var u = enc(o.url), t = enc(o.title), tx = enc(o.text);
    var media = enc(ORIGIN + (o.media || '/assets/og-story.png'));
    return [
      ['x',         'X',         'https://twitter.com/intent/tweet?url=' + u + '&text=' + tx],
      ['facebook',  'Facebook',  'https://www.facebook.com/sharer/sharer.php?u=' + u],
      ['pinterest', 'Pinterest', 'https://pinterest.com/pin/create/button/?url=' + u +
                                 '&media=' + media + '&description=' + tx],
      ['reddit',    'Reddit',    'https://www.reddit.com/submit?url=' + u + '&title=' + t],
      ['whatsapp',  'WhatsApp',  'https://api.whatsapp.com/send?text=' + enc(o.text + ' ' + o.url)],
      ['email',     'Email',     'mailto:?subject=' + t + '&body=' + enc(o.text + '\n\n' + o.url)]
    ];
  }

  function hasNative() {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  function native(o) {
    if (!hasNative()) return Promise.reject();
    return navigator.share({ title: o.title, text: o.text, url: o.url });
  }

  function copy(o) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(o.url);
    }
    /* Older WebKit and any non-secure context: the textarea trick still
       works and is better than a dead button. */
    return new Promise(function (res, rej) {
      try {
        var ta = document.createElement('textarea');
        ta.value = o.url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        res();
      } catch (e) { rej(e); }
    });
  }

  /* Momentary confirmation on the button itself. A page-level toast would
     mean depending on app.js, which /story does not load. */
  function flash(btn, msg) {
    if (!btn || btn.dataset.busy) return;
    var was = btn.innerHTML;
    btn.dataset.busy = '1';
    btn.classList.add('is-done');
    btn.innerHTML = msg;
    setTimeout(function () {
      btn.innerHTML = was;
      btn.classList.remove('is-done');
      delete btn.dataset.busy;
    }, 1700);
  }

  /* Renders into #id. `compact` drops the network buttons and leaves the
     one-tap share plus copy, for the footer. */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* One quote, its citation, and the two things a reader might do with it.
     The X link carries quote + cite + URL because a stat with no source is
     how a true thing becomes an unbelievable one. */
  function quoteCard(o, item, i) {
    var line = item.q + ', ' + item.cite;
    var xurl = 'https://twitter.com/intent/tweet?text=' + enc(line) + '&url=' + enc(o.url);
    return '<figure class="sh-q" data-q="' + i + '">' +
             '<blockquote>' + esc(item.q) + '</blockquote>' +
             '<figcaption>' + esc(item.cite) + '</figcaption>' +
             '<div class="sh-q-acts">' +
               '<button type="button" class="sh-btn sh-mini" data-sh="quote" ' +
                 'data-i="' + i + '">Copy</button>' +
               '<a class="sh-btn sh-mini" href="' + xurl + '" target="_blank" ' +
                 'rel="noopener noreferrer">Post to X</a>' +
             '</div>' +
           '</figure>';
  }

  function mount(id, opts) {
    var box = document.getElementById(id);
    if (!box) return;
    opts = opts || {};
    var o = payload(opts.data);

    var html = '<div class="sh-row">';
    html += '<button type="button" class="sh-btn sh-primary" data-sh="go">' +
            (hasNative() ? 'Share now' : 'Copy the link') + '</button>';
    if (!opts.compact) {
      targets(o).forEach(function (t) {
        html += '<a class="sh-btn" href="' + t[2] + '" target="_blank" ' +
                'rel="noopener noreferrer" data-sh-net="' + t[0] + '">' + t[1] + '</a>';
      });
    }
    if (hasNative()) {
      html += '<button type="button" class="sh-btn sh-quiet" data-sh="copy">Copy link</button>';
    }
    html += '</div>';

    /* THE INSTAGRAM AND TIKTOK PATH. They cannot be posted to from a
       browser, so give the reader the two things they actually need:
       the image, and the words. */
    if (!opts.compact) {
      html += '<div class="sh-social">' +
        '<span class="sh-social-note">Posting to <b>Instagram</b> or <b>TikTok</b>? ' +
        'Neither can be posted to from a browser, so take the picture and the words:</span>' +
        '<div class="sh-row">' +
          '<a class="sh-btn" href="' + o.square + '" download>Square image</a>' +
          '<a class="sh-btn" href="' + o.vertical + '" download>Story / Reel image</a>' +
          '<button type="button" class="sh-btn" data-sh="caption">Copy the caption</button>' +
        '</div></div>';
    }

    /* Bite-size. Most people will not share a whole article, but they will
       absolutely share one sentence — so hand them the sentence with its
       citation already attached. */
    if (!opts.compact && o.quotes && o.quotes.length) {
      html += '<div class="sh-quotes"><span class="sh-social-note">' +
              'Or take a piece of it. Each line copies with its source attached:' +
              '</span><div class="sh-q-grid">';
      o.quotes.forEach(function (item, i) { html += quoteCard(o, item, i); });
      html += '</div></div>';
    }

    box.innerHTML = html;

    box.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-sh]') : null;
      if (!b) return;
      var what = b.getAttribute('data-sh');

      if (what === 'quote') {
        var item = (o.quotes || [])[+b.getAttribute('data-i')];
        if (!item) return;
        copy({ url: item.q + ', ' + item.cite + '\n\n' + o.url })
          .then(function () { flash(b, 'Copied &#10003;'); })
          .catch(function () { flash(b, 'Could not copy'); });
        return;
      }
      if (what === 'caption') {
        var withCaption = { url: o.caption };   /* copy() takes .url as its payload */
        copy(withCaption).then(function () { flash(b, 'Caption copied &#10003;'); })
                         .catch(function () { flash(b, 'Could not copy'); });
        return;
      }
      if (what === 'go' && hasNative()) {
        native(o).catch(function () { /* dismissed by the reader, not an error */ });
        return;
      }
      /* no native sheet: the primary button copies instead of doing nothing */
      copy(o).then(function () { flash(b, 'Link copied &#10003;'); })
             .catch(function () { flash(b, 'Press &#8984;C to copy'); });
    });
  }

  /* ---- THE QUOTE CAROUSEL ----
     Every quote from every page in one rotating band, each still carrying
     its citation and a link back to the piece it came from. This is the
     campaign surface: somebody who never scrolls the shelf still walks past
     one good sentence, and one good sentence is the whole acquisition plan.

     Rotation is paused on hover and on focus-within, and does not start at
     all under prefers-reduced-motion — a banner that moves while you are
     trying to read it is worse than no banner. */
  function pool() {
    var out = [];
    Object.keys(PAGES).forEach(function (path) {
      var pg = PAGES[path];
      (pg.quotes || []).forEach(function (item) {
        out.push({ q: item.q, cite: item.cite, url: pg.url, from: pg.title, path: path });
      });
    });
    return out;
  }

  function carousel(id, opts) {
    var box = document.getElementById(id);
    if (!box) return;
    opts = opts || {};

    var items = pool();
    if (!items.length) return;

    /* Deterministic rotation, random start. Every visitor gets the full set
       in order; they just do not all begin on the same one, so a returning
       reader is not greeted by the same sentence every single time. */
    var i = Math.floor(Math.random() * items.length);
    var timer = null;
    var DWELL = opts.dwell || 8000;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    box.classList.add('qcar');
    box.innerHTML =
      '<div class="qcar-inner">' +
        '<span class="qcar-eyebrow">Nicotia: A Word for the People</span>' +
        '<blockquote class="qcar-q" aria-live="polite"></blockquote>' +
        '<div class="qcar-foot">' +
          '<span class="qcar-cite"></span>' +
          '<a class="qcar-src" href="#"></a>' +
        '</div>' +
      '</div>' +
      '<div class="qcar-side">' +
        '<div class="qcar-acts">' +
          '<button type="button" class="sh-btn sh-mini" data-qc="copy">Copy</button>' +
          '<a class="sh-btn sh-mini" data-qc="x" href="#" target="_blank" rel="noopener noreferrer">Post to X</a>' +
        '</div>' +
        '<div class="qcar-nav">' +
          '<button type="button" class="qcar-arrow" data-qc="prev" aria-label="Previous quote">&#8249;</button>' +
          '<span class="qcar-dots" aria-hidden="true"></span>' +
          '<button type="button" class="qcar-arrow" data-qc="next" aria-label="Next quote">&#8250;</button>' +
        '</div>' +
      '</div>';

    var elQ    = box.querySelector('.qcar-q');
    var elCite = box.querySelector('.qcar-cite');
    var elSrc  = box.querySelector('.qcar-src');
    var elX    = box.querySelector('[data-qc="x"]');
    var elDots = box.querySelector('.qcar-dots');

    function paint() {
      var it = items[i];
      elQ.classList.remove('is-in');
      /* next frame, so removing and re-adding actually restarts the fade */
      requestAnimationFrame(function () {
        elQ.textContent = '“' + it.q + '”';
        elCite.textContent = it.cite;
        elSrc.textContent = it.from + ' →';
        elSrc.setAttribute('href', it.path);
        elX.setAttribute('href', 'https://twitter.com/intent/tweet?text=' +
          enc(it.q + ', ' + it.cite) + '&url=' + enc(it.url));
        elDots.textContent = (i + 1) + ' / ' + items.length;
        requestAnimationFrame(function () { elQ.classList.add('is-in'); });
      });
    }

    function go(n) { i = (n + items.length) % items.length; paint(); }
    function start() { if (!still && !timer) timer = setInterval(function () { go(i + 1); }, DWELL); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }

    box.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-qc]') : null;
      if (!t) return;
      var what = t.getAttribute('data-qc');
      if (what === 'next') { stop(); go(i + 1); }
      else if (what === 'prev') { stop(); go(i - 1); }
      else if (what === 'copy') {
        var it = items[i];
        copy({ url: it.q + ', ' + it.cite + '\n\n' + it.url })
          .then(function () { flash(t, 'Copied &#10003;'); })
          .catch(function () { flash(t, 'Could not copy'); });
      }
    });

    box.addEventListener('mouseenter', stop);
    box.addEventListener('mouseleave', start);
    box.addEventListener('focusin', stop);
    box.addEventListener('focusout', start);
    /* A tab in the background should not burn a timer for nobody. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    paint();
    start();
  }

  return { SHARE: SHARE, PAGES: PAGES, mount: mount, carousel: carousel,
           hasNative: hasNative, copy: copy, native: native };
})();
