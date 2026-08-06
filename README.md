# Nicotia Market

Compare nicotine pouches, snus, disposables, devices, e-liquid and cigars across every
store we carry — **priced by the unit**, so packs, rolls and big-puff disposables actually
compare.

Sister site to [Legal-Leaf Market](https://legal-leafmarket.com) (hemp & cannabinoids) and
[Herbal-Leaf Market](https://herballeafmarket.com) (botanicals). Same architecture, same
design system.

Adults 21+ only.

---

## The point

A shelf price tells you nothing. A five-can roll next to a single tin, or a 30,000-puff
disposable next to a 60,000-puff one, are not comparable until you divide.

| department | unit | example |
|---|---|---|
| Pouches & Snus | per pouch | 5-can roll at $24.99 → **$0.25/pouch** |
| Disposables | per 1,000 puffs | Geek Bar Mate 60K at $19.99 → **$0.33/1k** |
| E-Liquid | per ml | 100ml shortfill at $22 → **$0.22/ml** |
| Cigars | per stick | bundle of 20 at $89 → **$4.45/stick** |
| Devices & Pods | — | no honest unit; none claimed |
| Gear & Accessories | — | no honest unit; none claimed |

That last row matters: a $199 humidor should not be advertised as "$199.00 per stick".

---

## Stack

Static HTML/CSS/JS + zero-dependency Node serverless functions on Vercel.
No framework, no build step, Node ≥ 18.

```
api/products.js    live scraper across all stores (registry lives here)
public/            the site
server.mjs         local preview, reads vercel.json
```

## Run locally

```bash
npm run dev
```

Then open <http://localhost:3000>. No install step — there are no dependencies.

Useful endpoints:

```bash
curl "http://localhost:3000/api/products?debug"
```

## Deploy

Push to GitHub; Vercel builds automatically. `vercel.json` pins
`framework: null` and `outputDirectory: public` — do not add a build pipeline.

---

## Before going live

- [ ] Set `previewMode: false` in `public/js/config.js`
- [ ] Verify every store's `ships` array against its real shipping policy (most carry `guess: 1`)
- [ ] Confirm Wave Vape's flat shipping rate (`shipFlat` is currently an estimate)
- [ ] Recruit a US pouch vendor — the biggest gap in the catalogue

See [CLAUDE.md](./CLAUDE.md) for the full operating guide.
