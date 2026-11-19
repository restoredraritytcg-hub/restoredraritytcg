const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 });
 for (const [f, w, h, png] of JSON.parse(process.argv[2])) { await p.setViewportSize({ width: w, height: h });
   await p.goto('file://' + path.resolve(f)); await p.waitForTimeout(150); await p.screenshot({ path: png, omitBackground: true }); }
 await b.close(); })();
