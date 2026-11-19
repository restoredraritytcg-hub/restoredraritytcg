const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
 await p.goto('file://' + path.resolve('out/pitch.html')); await p.waitForTimeout(2500);
 await p.screenshot({ path: 'out/SAE-logo-refresh-concept.png', fullPage: true });
 const h = await p.evaluate(() => document.body.scrollHeight);
 await p.pdf({ path: 'out/SAE-logo-refresh-concept.pdf', width: '1600px', height: h + 'px', printBackground: true, pageRanges: '1' });
 await b.close(); })();
