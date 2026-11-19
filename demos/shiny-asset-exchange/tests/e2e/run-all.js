// Runs every end-to-end check in order (each starts from a fresh browser, so fresh demo data).
const { execFileSync } = require('child_process');
let failed = 0;
for (const t of ['shop-flow', 'intake-to-portal', 'shipping-shippo', 'all-pages']) {
  console.log(`\n=== ${t}`);
  try { execFileSync(process.execPath, [`${__dirname}/${t}.js`, process.argv[2] || 'test-output'], { stdio: 'inherit' }); }
  catch { failed++; console.log(`!!! ${t} failed`); }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed'); process.exitCode = failed ? 1 : 0;
