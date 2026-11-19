// End-to-end check (Playwright, plain Node script). Run the site first: `npm start` (serves on :8765).
// Usage: node tests/e2e/shop-flow.js [screenshot-dir]   (BASE=http://host:port/ to test elsewhere)
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.argv[2] || 'test-output'; fs.mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const U = BASE, S = OUT;
  await p.goto(U + 'index.html'); await p.waitForTimeout(1500); await p.screenshot({ path: S + '/home.png', fullPage: true });
  await p.goto(U + 'index.html#/p/holo-serum'); await p.waitForTimeout(800);
  await p.click('[data-v="1"]'); await p.click('[data-q="1"]'); await p.click('#add'); await p.waitForTimeout(400);
  await p.screenshot({ path: S + '/drawer.png' });
  await p.goto(U + 'index.html#/checkout'); await p.waitForTimeout(500);
  for (const [k, v] of Object.entries({ email: 'test@example.com', first: 'Test', last: 'Buyer', line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' })) await p.fill('#' + k, v);
  await p.fill('#cc', '4000000000000002'); await p.fill('#exp', '1230'); await p.fill('#cvc', '123'); await p.click('#payBtn'); await p.waitForTimeout(300);
  console.log('decline:', await p.textContent('#payErr'));
  await p.fill('#cc', '4242424242424242'); await p.click('#payBtn'); await p.waitForTimeout(600);
  console.log('after pay url', p.url()); console.log((await p.textContent('main')).slice(0, 300));
  await p.screenshot({ path: S + '/thanks.png', fullPage: true });
  const st = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('sae-demo-v3')); const h = d.products.find(x => x.handle === 'holo-serum'); return h.variants.map(v => v.stock) + ' orders=' + d.orders.length; });
  console.log('holo stock', st);
  // quiz
  await p.goto(U + 'index.html#/review'); await p.click('#go'); await p.click('[data-v=v1]'); await p.click('[data-v=crease]'); await p.click('#cont'); await p.click('[data-v=cosmetic]'); await p.click('[data-v=accept]'); await p.waitForTimeout(300);
  console.log('quiz:', (await p.textContent('.result h3')));
  // submit
  await p.click('text=Submit Your Card'); await p.waitForTimeout(500);
  await p.fill('#s_name', 'Quiz Person'); await p.fill('#s_email', 'quiz@example.com'); await p.fill('#s_a1', '2 Main St'); await p.fill('#s_city', 'Austin'); await p.fill('#s_st', 'TX'); await p.fill('#s_zip', '78701');
  await p.fill('.card-entry [data-f=name]', 'Charizard'); await p.check('#s_agree'); await p.screenshot({ path: S + '/submit.png', fullPage: true });
  await p.click('#sGo'); await p.waitForTimeout(500); console.log('submit:', (await p.textContent('main')).slice(0, 200));

  for (const r of ['pricing', 'faq', 'tools', 'recs', 'status?q=%231001&e=collector%40example.com', 'shop', 'privacy']) { await p.goto(U + 'index.html#/' + r); await p.waitForTimeout(300); }
  await p.screenshot({ path: S + '/status.png' });
  // admin
  await p.goto(U + 'admin.html'); await p.click('button:has-text("Sign in")'); await p.waitForTimeout(500); await p.screenshot({ path: S + '/adm-dash.png', fullPage: true });
  for (const r of ['inventory', 'stock', 'orders', 'customers', 'site']) { await p.goto(U + 'admin.html#/' + r); await p.waitForTimeout(400); await p.screenshot({ path: S + '/adm-' + r + '.png', fullPage: true }); }
  const oid = await p.evaluate(() => JSON.parse(localStorage.getItem('sae-demo-v3')).orders.at(-1).id);
  await p.goto(U + 'admin.html#/order/' + oid); await p.waitForTimeout(300); console.log('ORDERPAGE', p.url(), (await p.textContent('main')).slice(0,300)); await p.fill('#trk', '9400111'); await p.click('#ship'); await p.waitForTimeout(300);
  await p.screenshot({ path: S + '/adm-order.png', fullPage: true });
  const sid = null;


  const pid = await p.evaluate(() => JSON.parse(localStorage.getItem('sae-demo-v3')).products[0].id);
  await p.goto(U + 'admin.html#/product/' + pid); await p.waitForTimeout(300); await p.screenshot({ path: S + '/adm-product.png', fullPage: true });
  await p.goto(U + 'admin.html#/inventory'); await p.waitForTimeout(300); await p.click('[data-recv]'); await p.fill('#qty', '5'); await p.click('#ok'); await p.waitForTimeout(300);
  console.log('first variant after receive:', await p.evaluate(() => JSON.parse(localStorage.getItem('sae-demo-v3')).products[0].variants[0].stock));
  // phone
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }); m.on('pageerror', e => errs.push('M ' + e.message));
  for (const r of ['', 'p/card-restoration-starter-kit', 'submit', 'pricing']) { await m.goto(U + 'index.html#/' + r); await m.waitForTimeout(600); await m.screenshot({ path: S + '/m-' + (r.replace(/\W/g, '_') || 'home') + '.png', fullPage: true });
    console.log('m', r, 'overflow', await m.evaluate(() => document.documentElement.scrollWidth)); }
  await m.goto(U + 'admin.html#/inventory'); await m.evaluate(() => sessionStorage.setItem('sae-admin', '1')); await m.reload(); await m.waitForTimeout(500); await m.screenshot({ path: S + '/m-adm.png', fullPage: true });
  console.log('adm overflow', await m.evaluate(() => document.documentElement.scrollWidth));
  { const e = errs.filter(e => !/cards\.json|Failed to load resource/.test(e)); console.log('ERRORS', e); if (e.length) process.exitCode = 1; }
  await b.close();
})();
