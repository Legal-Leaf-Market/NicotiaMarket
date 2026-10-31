/* netlify/functions/cron-worker.mjs — re-reads every shop, then primes the edge.
 *
 * ?refresh=1 answers no-store and is a different cache key from the bare path,
 * so it is followed by one plain GET, which the now-warm instance answers at
 * once and the CDN keeps: that copy is what visitors are served. A throw makes
 * Netlify retry (1 min, then 2), which is safe: a refresh is idempotent.
 */
export default async function cronWorker(request, context) {
  const site = String((context && context.site && context.site.url) || process.env.URL || '').replace(/\/+$/, '');
  if (!site) throw new Error('[cron] site URL unknown');
  for (const path of ['/api/products?refresh=1', '/api/products']) {
    const t0 = Date.now();
    const r = await fetch(site + path, { headers: { accept: 'application/json' } });
    const n = (await r.arrayBuffer()).byteLength;
    console.log(`[cron] ${path}: ${r.status} in ${Date.now() - t0}ms, ${n} bytes`);
    if (!r.ok) throw new Error(`${path} answered ${r.status}`);
  }
}

export const config = { background: true };
