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

     Currently true because the registry still has no US pouch store;
     with it false a US visitor sees an empty Pouches shelf. Flip it
     once Wave Vape and a US pouch vendor are both live. */
  previewMode: true,

  /* Sister sites — rendered in the footer strip on all three. */
  sisters: [
    { name: 'Legal-Leaf Market',  url: 'https://legal-leafmarket.com', blurb: 'Hemp & cannabinoids' },
    { name: 'Herbal-Leaf Market', url: 'https://herballeafmarket.com', blurb: 'Botanicals' }
  ]
};
