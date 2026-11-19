// End-to-end check (Playwright, plain Node script). Run the site first: `npm start` (serves on :8765).
// Usage: node tests/e2e/shipping-shippo.js [screenshot-dir]   (BASE=http://host:port/ to test elsewhere)
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.argv[2] || 'test-output'; fs.mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const S = OUT; const errs = [];
 const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
 p.on('pageerror', e => errs.push('PAGEERR ' + p.url() + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/cards\.json|Failed to load/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
 const U = BASE;
 // 1. buy a product with Priority Mail
 await p.goto(U + 'index.html#/p/card-spray'); await p.waitForTimeout(700); await p.click('#add'); await p.goto(U + 'index.html#/checkout'); await p.waitForTimeout(500);
 for (const [k, v] of Object.entries({ email: 'ship@example.com', first: 'Ship', last: 'Tester', line1: '9 Lake Rd', city: 'Denver', state: 'CO', zip: '80202' })) await p.fill('#' + k, v);
 await p.check('input[name=sm][value=priority]'); console.log('CHECKOUT sum:', (await p.textContent('#coSum')).replace(/\s+/g, ' '));
 await p.fill('#cc', '4242424242424242'); await p.fill('#exp', '1230'); await p.fill('#cvc', '123'); await p.click('#payBtn'); await p.waitForTimeout(600);
 const oid = p.url().split('/').pop(); console.log('order placed', oid);
 // 2. admin shipping queue
 await p.goto(U + 'admin.html'); await p.evaluate(() => sessionStorage.setItem('sae-admin', '1')); await p.goto(U + 'admin.html#/ship'); await p.waitForTimeout(900);
 console.log('QUEUE:', (await p.textContent('#shipq')).replace(/\s+/g, ' ').slice(0, 420));
 await p.screenshot({ path: S + '/ship_queue.png', fullPage: true });
 const idx = await p.evaluate(oid => [...document.querySelectorAll('[data-rates]')].findIndex(b => b.closest('tr').querySelector('a').getAttribute('href').includes(oid)), oid);
 await p.click(`[data-rates="${idx}"]`); await p.waitForTimeout(800);
 console.log('RATES:', (await p.textContent('#rw')).replace(/\s+/g, ' ').slice(0, 300));
 await p.screenshot({ path: S + '/ship_rates.png', fullPage: true });
 await p.click('#rw [data-buy]'); await p.waitForTimeout(900);
 await p.click('[data-tab=moving]'); await p.waitForTimeout(300); console.log('MOVING:', (await p.textContent('#shipq')).replace(/\s+/g, ' ').slice(0, 300));
 // print label (new window)
 const [lab] = await Promise.all([ctx.waitForEvent('page'), p.click('[data-label="0"]')]); await lab.waitForTimeout(500); await lab.screenshot({ path: S + '/ship_label.png' }); await lab.close();
 for (let i = 0; i < 4; i++) { const btn = await p.$('[data-scan="0"]'); if (!btn) break; await btn.click(); await p.waitForTimeout(200); }
 await p.click('[data-tab=all]'); await p.waitForTimeout(200); console.log('ALL:', (await p.textContent('#shipq')).replace(/\s+/g, ' ').slice(0, 250));
 // 3. customer sees it
 await p.goto(U + 'index.html#/status?q=' + encodeURIComponent((await p.evaluate(oid => JSON.parse(localStorage.getItem('sae-demo-v3')).orders.find(o => o.id === oid).number, oid))) + '&e=ship%40example.com'); await p.waitForTimeout(600);
 console.log('STATUS:', (await p.textContent('#res')).replace(/\s+/g, ' ').slice(0, 300)); await p.screenshot({ path: S + '/ship_status.png', fullPage: true });
 // 4. bulk buy the rest (includes the seeded card return), then void one
 await p.goto(U + 'admin.html#/ship'); await p.waitForTimeout(700); const before = await p.evaluate(() => document.querySelectorAll('[data-rates]').length);
 await p.click('#bulk'); await p.waitForTimeout(800 * before + 1500); console.log('BULK:', before, (await p.textContent('#shipq')).replace(/\s+/g, ' ').slice(0, 260));
 await p.click('[data-tab=moving]'); await p.waitForTimeout(200); p.once('dialog', d => d.accept()); await p.click('[data-void="0"]'); await p.waitForTimeout(400);
 console.log('after void queue size:', await p.evaluate(() => { const t = document.querySelector('[data-tab=queue]'); return t && t.textContent; }));
 // 5. portal: return panel on SAE-1041 (in progress) → buy label → customer link
 const sid = await p.evaluate(() => JSON.parse(localStorage.getItem('sae-portal-v3')).submissions.find(s => s.code === 'SAE-1041').id);
 await p.goto(U + 'portal/admin.html#/submission/' + sid); await p.waitForTimeout(1500);
 console.log('PANEL:', (await p.textContent('#retship')).replace(/\s+/g, ' ').slice(0, 200));
 await p.click('#rrates'); await p.waitForTimeout(800); await p.screenshot({ path: S + '/portal_rates.png', fullPage: true }); await p.click('#rw [data-buy]'); await p.waitForTimeout(900);
 console.log('PANEL AFTER:', (await p.textContent('#retship')).replace(/\s+/g, ' ').slice(0, 220));
 for (let i = 0; i < 4; i++) { const btn = await p.$('#rscan'); if (!btn) break; await btn.click(); await p.waitForTimeout(250); }
 const st = await p.evaluate(sid => JSON.parse(localStorage.getItem('sae-portal-v3')).submissions.find(s => s.id === sid).status, sid); console.log('SUB STATUS after delivered:', st);
 const tok = await p.evaluate(sid => { const d = JSON.parse(localStorage.getItem('sae-portal-v3')); const s = d.submissions.find(x => x.id === sid); return d.customers.find(c => c.id === s.customer_id).share_token; }, sid);
 await p.goto(U + 'portal/view.html#t=' + tok); await p.waitForTimeout(1500); console.log('VIEW:', (await p.textContent('#app')).replace(/\s+/g, ' ').match(/Your cards[^]{0,160}/)?.[0]);
 await p.screenshot({ path: S + '/view_tracking.png', fullPage: true });
 // 6. live rates at checkout
 await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('sae-demo-v3')); d.content.shipping = { ...(d.content.shipping || {}), shippo: { mode: 'demo', checkout_rates: 'live', function_url: '', label_format: 'PDF_4x6' } }; localStorage.setItem('sae-demo-v3', JSON.stringify(d)); });
 await p.goto(U + 'index.html#/p/holo-serum'); await p.waitForTimeout(500); await p.click('#add'); await p.goto(U + 'index.html#/checkout'); await p.waitForTimeout(800);
 await p.fill('#line1', '9 Lake Rd'); await p.fill('#city', 'Seattle'); await p.fill('#state', 'WA'); await p.fill('#zip', '98101'); await p.dispatchEvent('#zip', 'change'); await p.waitForTimeout(900);
 console.log('LIVE RATES:', (await p.textContent('.ship-methods')).replace(/\s+/g, ' '));
 await p.screenshot({ path: S + '/ck_live.png', fullPage: true });
 const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); await m.goto(U + 'admin.html#/ship'); await m.waitForTimeout(800); console.log('mobile admin ship width', await m.evaluate(() => document.documentElement.scrollWidth));
 { const e = errs; console.log('ERRORS', e); if (e.length) process.exitCode = 1; } await b.close(); })();
