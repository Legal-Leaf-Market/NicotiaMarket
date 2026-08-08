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

  /* One source for the campaign copy. Changing it here changes it on
     every surface at once. */
  var SHARE = {
    url:   'https://nicotiamarket.com/story',
    title: 'Nicotia: A Word for the People',
    /* What actually lands in a post. Kept short enough to survive X's
       limit with the URL attached. */
    text:  'Nicotia: A Word for the People. It’s a love story, really — ' +
           'four hundred years of people reaching for the same name. ' +
           'From Jean Nicot to your front door.',
    /* The longer version, for the platforms where you paste a caption
       rather than click a button. Line breaks and hashtags survive a
       paste into Instagram and TikTok; they would be noise in a tweet. */
    caption: 'Nicotia: A Word for the People.\n\n' +
             'It’s a love story, really. Four hundred years of people reaching for the ' +
             'same name — a French ambassador, a Swedish botanist, a Victorian poet, ' +
             'and a laboratory in Heidelberg.\n\n' +
             'Nicotia was what people called it long before chemistry called it nicotine. ' +
             'We took the name back.\n\n' +
             'From Jean Nicot to your front door.\n' +
             'nicotiamarket.com/story\n\n' +
             'Adults 21+ only.\n\n' +
             '#Nicotia #NicotiaMarket #nicotinepouches #snus #etymology #JeanNicot',
    /* 1080 square and 1080x1920 vertical, for the platforms that want an
       image rather than a link. */
    square:   '/assets/share-square.png',
    vertical: '/assets/share-vertical.png'
  };

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
    var media = enc('https://nicotiamarket.com/assets/og-story.png');
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
  function mount(id, opts) {
    var box = document.getElementById(id);
    if (!box) return;
    opts = opts || {};
    var o = SHARE;

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
    box.innerHTML = html;

    box.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-sh]') : null;
      if (!b) return;
      var what = b.getAttribute('data-sh');

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

  return { SHARE: SHARE, mount: mount, hasNative: hasNative, copy: copy, native: native };
})();
