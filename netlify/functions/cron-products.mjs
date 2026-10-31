/* netlify/functions/cron-products.mjs — 06:00 UTC daily (was vercel.json's cron).
 *
 * A scheduled function is stopped after 30 seconds and a cold scrape takes ~42,
 * so this only starts cron-worker (a background function, 15 minutes) and
 * returns. The refresh URL is public already (?refresh), so the worker needs no
 * secret: it can do nothing a visitor cannot.
 */
export default async function cronProducts(request, context) {
  const site = String((context && context.site && context.site.url) || process.env.URL || '').replace(/\/+$/, '');
  if (!site) throw new Error('[cron] site URL unknown, refresh not started');
  const r = await fetch(`${site}/.netlify/functions/cron-worker`, { method: 'POST' });
  if (r.status !== 202) throw new Error(`[cron] worker answered ${r.status}, not 202`);
  console.log('[cron] products-refresh handed to cron-worker');
}

export const config = { schedule: '0 6 * * *' };
