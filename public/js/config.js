/* ============================================================
   config.js — the only front-end file you routinely edit.
   Loaded BEFORE app.js.
   ============================================================ */

window.NM_CONFIG = {

  /* Where the catalogue comes from. On Vercel this is the serverless
     function in api/products.js. Point it elsewhere only if you split
     the API onto its own host. */
  apiUrl: '/api/products',

  /* PREVIEW MODE — set to false before you take real traffic.
     ------------------------------------------------------------
     true  = ignore shipping limits and local law, so you can see every
             store's catalogue from anywhere while building.
     false = shoppers only see what can actually reach them.

     When false the toggle is not rendered at all, so nobody can turn
     it back on from the UI. There is a loud amber bar on the page
     while this is true — that is deliberate, it should be impossible
     to ship by accident.

     Was true because the registry had no US pouch store, which would
     have shown a US visitor an empty Pouches shelf. Nicokick closed
     that gap (Magento GraphQL + CJ Affiliate), so the condition §8
     set for flipping this is met and it is now FALSE.

     Consequence to expect while testing: shelves are now filtered by
     where you say you ship to, and LEGAL[] — not the vendor's own
     dropdown — decides what you are shown. A shelf looking thinner
     than it did in preview is this working, not a regression. Set your
     destination with the SHIP TO pill to see the US selection. */
  previewMode: false,

  /* Sister sites — rendered in the footer strip on all three. */
  sisters: [
    { name: 'Legal-Leaf Market',  url: 'https://legal-leafmarket.com', blurb: 'Hemp & cannabinoids' },
    { name: 'Herbal-Leaf Market', url: 'https://herballeafmarket.com', blurb: 'Botanicals' }
  ]
};
