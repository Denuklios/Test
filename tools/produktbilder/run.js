const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.argv[2], only = process.argv[3] ? process.argv[3].split(',') : null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 640 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8093/index.html'); await p.waitForFunction(() => window.WF3D_READY, null, { timeout: 30000 });
  const keys = only || await p.evaluate(() => window.WF3D.keys);
  fs.mkdirSync(OUT, { recursive: true });
  for (const k of keys) {
    const t0 = Date.now();
    try { const d = await p.evaluate((k) => window.WF3D.renderOne(k), k); fs.writeFileSync(`${OUT}/${k}.png`, Buffer.from(d.split(',')[1], 'base64')); console.log(k, Date.now() - t0, 'ms'); }
    catch (e) { console.log('FAIL', k, e.message.slice(0, 200)); }
  }
  console.log('errs', errs.slice(0, 5)); await b.close();
})();
