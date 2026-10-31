/* netlify/functions/api.mjs — every /api/* URL, in production on Netlify.
 *
 * /api/<name> runs the default export of api/<name>.js, unchanged. The handlers
 * are written as handler(req, res); netlify/lib/node-compat.mjs translates
 * Netlify's web Request/Response to that shape at the door, so nothing in api/
 * knows which host it is on and server.mjs keeps working as the local preview.
 * Adding an endpoint is still just adding a file to api/.
 */
import { serve } from '../lib/node-compat.mjs';
import { decorate } from '../lib/edge-headers.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

const cache = new Map();
async function load(name) {
  if (!cache.has(name)) cache.set(name, import(`../../api/${name}.js`).then((m) => (typeof m.default === 'function' ? m.default : null)));
  return cache.get(name);
}

export default async function api(request, context = {}) {
  const m = new URL(request.url).pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
  /* `_helper.js` is a library, never an endpoint. */
  if (!m || m[1].startsWith('_')) return json(404, { error: 'Not found' });

  let handler;
  try { handler = await load(m[1]); }
  catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND' && String(err.message).includes(`api/${m[1]}.js`)) return json(404, { error: 'Not found' });
    console.error(`[api] could not load api/${m[1]}.js:`, err && err.stack ? err.stack : err);
    return json(500, { error: 'server error' });
  }
  if (!handler) return json(404, { error: 'Not found' });

  return serve(handler, request, {
    client: { ip: context.ip, geo: context.geo },
    waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : undefined,
    /* vercel.json gave every /api/* answer this policy from config, and the
       handlers rely on it (api/products.js sets none itself; CLAUDE.md §7c).
       Netlify has no config equivalent for functions, so it is applied here,
       to GETs that did not choose their own, and never to a forced refresh. */
    decorate(headers, info) {
      const u = new URL(request.url);
      if (request.method === 'GET' && info.status === 200 && !headers.has('cache-control') && !u.searchParams.has('refresh'))
        headers.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
      decorate(headers, info);
    },
  });
}

/* A literal: Netlify reads it from the source at build time. */
export const config = { path: '/api/*' };
