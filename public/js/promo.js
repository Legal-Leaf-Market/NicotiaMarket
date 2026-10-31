/* promo.js — the coupon banner, on every page. (The 21+ gate is app.js's own,
   with the ship-to country; do not add a second one here.)

   THE BANNER. Shown only for stores whose registry entry carries the code as
   its `coupon` (see promo in config.js). Read from /api/products?summary, the
   small store manifest the CDN caches, so it costs no catalogue download. */
(function () {
  var cfg = window.NM_CONFIG || {};

  function css(text) { var s = document.createElement('style'); s.textContent = text; document.head.appendChild(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  css(
    '.nm-promo{position:relative;z-index:60;background:linear-gradient(90deg,#c8632a,#e0863f 45%,#f0b93c);color:#160c06;' +
      'font:600 14px/1.35 Jost,system-ui,sans-serif;text-align:center;padding:9px 44px 9px 14px}' +
    '.nm-promo b{font-weight:800;letter-spacing:.06em}' +
    '.nm-promo button.copy{margin-left:8px;border:1.5px solid #160c06;background:transparent;color:#160c06;border-radius:999px;' +
      'font:700 12px/1 Jost,system-ui,sans-serif;padding:5px 11px;cursor:pointer}' +
    '.nm-promo button.copy:hover{background:#160c06;color:#f0b93c}' +
    '.nm-promo .x{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:none;color:#160c06;font-size:20px;cursor:pointer;line-height:1}'
  );

  /* ---- coupon banner ---- */
  var code = cfg.promo && cfg.promo.code;
  if (!code) return;
  try { if (sessionStorage.getItem('nm_promo_x') === code) return; } catch (e) {}

  fetch((cfg.apiUrl || '/api/products') + '?summary', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var stores = ((d && d.stores) || []).filter(function (s) { return String(s.coupon || '').toUpperCase() === code.toUpperCase(); });
      if (!stores.length) return;           // no store accepts it: say nothing rather than something false
      var names = stores.map(function (s) { return esc(s.name); });
      var at = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      var bar = document.createElement('div');
      bar.className = 'nm-promo'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Coupon code');
      bar.innerHTML = 'Use code <b>' + esc(code) + '</b> at ' + at + '. It is applied for you at checkout.' +
        '<button class="copy" type="button">Copy code</button><button class="x" type="button" aria-label="Dismiss">&times;</button>';
      bar.querySelector('.copy').onclick = function () {
        var b = this;
        try { navigator.clipboard.writeText(code); b.textContent = 'Copied'; } catch (e) { b.textContent = code; }
      };
      bar.querySelector('.x').onclick = function () { try { sessionStorage.setItem('nm_promo_x', code); } catch (e) {} bar.remove(); };
      document.body.insertBefore(bar, document.body.firstChild);
    })
    .catch(function () {});
})();
