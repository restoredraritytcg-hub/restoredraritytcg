// End-to-end check (Playwright, plain Node script). Run the site first: `npm start` (serves on :8765).
// Usage: node tests/e2e/intake-to-portal.js [screenshot-dir]   (BASE=http://host:port/ to test elsewhere)
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.argv[2] || 'test-output'; fs.mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + p.url() + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const U = BASE, S = OUT;
  await p.goto(U + 'index.html#/submit'); await p.waitForTimeout(800);
  await p.fill('#s_name', 'Intake Tester'); await p.fill('#s_email', 'intake@example.com'); await p.fill('#s_a1', '5 Test Rd'); await p.fill('#s_city', 'Austin'); await p.fill('#s_st', 'TX'); await p.fill('#s_zip', '78701');
  await p.fill('.card-entry [data-f=name]', 'Charizard'); await p.fill('.card-entry [data-f=details]', 'Base Set · 4/102 · 1999'); await p.fill('.card-entry [data-f=value]', '650');
  await p.check('[data-addon=review]'); await p.check('[data-addon=ship]'); await p.waitForTimeout(200); await p.selectOption('[data-f=grading]', 'PSA');
  await p.click('#addCard'); await p.fill('.card-entry[data-i="1"] [data-f=name]', 'Pikachu'); await p.selectOption('.card-entry[data-i="1"] [data-f=service]', 'cleaning');
  await p.setInputFiles('.card-entry[data-i="0"] [data-photo=front]', require('path').join(__dirname, '../../brand/sae-logo-mark.png')); await p.waitForTimeout(500);
  await p.check('#s_agree'); await p.click('#sGo'); await p.waitForTimeout(500);
  console.log('SUBMITTED:', (await p.textContent('main')).replace(/\s+/g, ' ').slice(0, 160));
  const link = await p.getAttribute('a:has-text("Open my private page")', 'href'); console.log('link', link);
  await p.screenshot({ path: S + '/s_thanks.png' });
  // portal
  await p.goto(U + 'portal/admin.html'); await p.waitForTimeout(1500); await p.screenshot({ path: S + '/p_list.png', fullPage: true });
  console.log('PORTAL LIST:', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 300));
  const sid = await p.evaluate(() => JSON.parse(localStorage.getItem('sae-portal-v3')).submissions.at(-1).id);
  await p.goto(U + 'portal/admin.html#/submission/' + sid); await p.waitForTimeout(1500);
  await p.screenshot({ path: S + '/p_sub.png', fullPage: true });
  console.log('PSA:', (await p.textContent('#psa').catch(()=>'none')).replace(/\s+/g,' ').slice(0,160)); console.log('QUOTE:', (await p.textContent('#quote')).replace(/\s+/g, ' ').slice(0, 400));
  const kid = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('sae-portal-v3')); return d.cards.at(-2).id; });
  await p.goto(U + 'portal/admin.html#/card/' + kid); await p.waitForTimeout(1200); await p.screenshot({ path: S + '/p_card.png', fullPage: true });
  console.log('CARD svc selected:', await p.evaluate(() => { const s = document.querySelector('.ksv'); return s && s.selectedOptions[0].textContent; }), 'extras checked:', await p.evaluate(() => [...document.querySelectorAll('.kx:checked')].map(x => x.dataset.x)));
  // status change + reload persists
  await p.goto(U + 'portal/admin.html#/submission/' + sid); await p.waitForTimeout(1000);
  for (const t of ['site/prices', 'site/announcement', 'site/instagram', 'customers', 'cards', 'new']) { await p.goto(U + 'portal/admin.html#/' + t); await p.waitForTimeout(800); await p.screenshot({ path: S + '/p_' + t.replace('/', '_') + '.png', fullPage: true }); }
  // announcement change → storefront
  await p.goto(U + 'portal/admin.html#/site/announcement'); await p.waitForTimeout(800);
  await p.fill('#atext', 'Holiday turnaround: send by Dec 10.'); await p.click('#asave'); await p.waitForTimeout(500);
  await p.goto(U + 'index.html'); await p.waitForTimeout(1200); console.log('BAR:', await p.textContent('#announce'));
  console.log('IG section:', await p.evaluate(() => !!document.querySelector('a[href*="instagram.com/shinyassetexchange"]')));
  await p.screenshot({ path: S + '/s_home.png', fullPage: true });
  // customer view
  await p.goto(link); await p.waitForTimeout(1500); await p.screenshot({ path: S + '/v_view.png', fullPage: true });
  console.log('VIEW:', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 300));
  // order status lookup
  const code = await p.evaluate(() => JSON.parse(localStorage.getItem('sae-portal-v3')).submissions.at(-1).code);
  await p.goto(U + 'index.html#/status?q=' + code + '&e=intake%40example.com'); await p.waitForTimeout(600); console.log('STATUS:', (await p.textContent('#res')).replace(/\s+/g, ' ').slice(0, 200));
  await p.goto(U + 'portal/scan.html'); await p.waitForTimeout(1500); await p.screenshot({ path: S + '/p_scan.png' });
  await p.goto(U + 'admin.html'); await p.evaluate(() => sessionStorage.setItem('sae-admin', '1')); await p.reload(); await p.waitForTimeout(800); await p.screenshot({ path: S + '/a_dash.png', fullPage: true });
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); m.on('pageerror', e => errs.push('M ' + e.message));
  for (const r of ['portal/admin.html#/submission/' + sid, 'index.html#/submit', link.replace(U, '')]) { await m.goto(U + r); await m.waitForTimeout(1200); console.log('m overflow', r.slice(0, 30), await m.evaluate(() => document.documentElement.scrollWidth)); await m.screenshot({ path: S + '/m_' + r.slice(0, 12).replace(/\W/g, '_') + '.png', fullPage: true }); }
  { const e = errs.filter(e => !/cards\.json|Failed to load resource|instagram/.test(e)); console.log('ERRORS', e); if (e.length) process.exitCode = 1; }
  await b.close();
})();
