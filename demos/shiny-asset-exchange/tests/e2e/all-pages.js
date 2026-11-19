// End-to-end check (Playwright, plain Node script). Run the site first: `npm start` (serves on :8765).
// Usage: node tests/e2e/all-pages.js [screenshot-dir]   (BASE=http://host:port/ to test elsewhere)
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.argv[2] || 'test-output'; fs.mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const S = OUT; const errs = [];
 const routes = ['', 'pricing', 'review', 'submit', 'status', 'faq', 'shop', 'p/holo-serum', 'tools', 'recs', 'cart', 'checkout', 'agreement', 'nope'];
 for (const vw of [1280, 390]) for (const r of routes) {
   const p = await b.newPage({ viewport: { width: vw, height: 900 } }); p.on('pageerror', e => errs.push(r + ' ' + e.message));
   if (r === 'checkout' || r === 'cart') { await p.goto(BASE + 'index.html'); await p.evaluate(() => localStorage.setItem('sae-cart', JSON.stringify([{ variant_id: JSON.parse(localStorage.getItem('sae-demo-v3')).products[1].variants[1].id, qty: 2 }]))); }
   await p.goto(BASE + 'index.html#/' + r); await p.waitForTimeout(900);
   if (r === 'review') { await p.click('#go'); await p.waitForTimeout(300); }
   const h = await p.evaluate(() => document.body.scrollHeight); for (let y = 0; y < h; y += 600) { await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(80); }
   await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(700);
   const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > vw) console.log('OVERFLOW', vw, r, sw);
   await p.screenshot({ path: `${S}/w_${vw}_${r.replace(/\W/g, '_') || 'home'}.png`, fullPage: true }); await p.close(); }
 { const e = errs; console.log('ERRORS', e); if (e.length) process.exitCode = 1; } await b.close(); })();
