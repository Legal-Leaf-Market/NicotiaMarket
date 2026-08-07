/* ============================================================
   Nicotia Market service worker — THE SHELL, AND ONLY THE SHELL
   ------------------------------------------------------------
   /api/products is deliberately NEVER cached here.

   The whole promise of this site is live pricing: there is a LIVE
   PRICING pill in the masthead and a "Checked N min ago" stamp that
   reads the API's own `updated` field. Serving yesterday's feed from a
   service-worker cache would make both of those lie, and a price
   comparison that quietly goes stale is worse than one that fails
   loudly. The API already has its own CDN cache (s-maxage in
   vercel.json), which is the right layer for that job.

   Everything else — markup, CSS, the engine, icons — is cached so the
   app opens instantly and survives a dropped connection.
   ============================================================ */

/* Bump this to retire every old cache on the next activate. */
var VERSION = 'nm-shell-v1';

var SHELL = [
  '/',
  '/css/tokens.css',
  '/css/app.css',
  '/js/config.js',
  '/js/app.js',
  '/assets/mark.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      /* addAll is all-or-nothing: one 404 would abort the whole install
         and leave the app with no shell at all. Add them individually
         so a single missing file costs only that file. */
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () { /* skip, not fatal */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; })
                             .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Never touch a vendor's site — the checkout hand-off leaves this
     origin and must not be intercepted, cached or rewritten. */
  if (url.origin !== self.location.origin) return;

  /* Live pricing stays live. See the note at the top. */
  if (url.pathname.indexOf('/api/') === 0) return;

  /* Navigations: network first, so a deploy is picked up on the next
     open rather than after a cache expiry, with the cached shell as the
     offline fallback. Department routes all resolve to the same
     document, so '/' is the right fallback for any of them. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copy = r.clone();
          caches.open(VERSION).then(function (c) { c.put('/', copy); });
        }
        return r;
      }).catch(function () {
        return caches.match('/').then(function (m) {
          return m || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  /* THE ENGINE IS NETWORK-FIRST. /js and /css hold the pricing logic and
     the design system, and cache-first on those means a deploy does not
     reach anyone until the load AFTER the one that fetched it — so a
     fixed unit-price bug would sit stale on a shopper's phone for one
     more session. vercel.json already serves them must-revalidate, so
     the network hop is a 304 in the common case. Cache is the offline
     fallback, not the default. */
  if (/^\/(js|css)\//.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copy = r.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return r;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  /* Everything else — icons, the mark, the manifest — is immutable
     enough to serve from cache first and refresh behind. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copy = r.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return r;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
