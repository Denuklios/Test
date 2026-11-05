const { chromium } = require('playwright');
const fs = require('fs');
const jobs = [
  ['tree_stage', 1300, 1250, '&spread=flat&n=3', 'tree_s1'],
  ['tree_stage', 1300, 1250, '&spread=flat&n=5', 'tree_s2'],
  ['tree_stage', 1300, 1250, '&spread=flat&n=6', 'tree_s3'],
  ['tree_front', 1300, 1250, '&spread=flat', 'tree_front'],
  ['plates', 1000, 700, '', 'plates'],
  ['tree_night', 2000, 1280, '&spread=flat&paint=green&fov=40&cx=-70&cz=430', 'tree_night'],
  ['tree_night', 1150, 1400, '&spread=flat&paint=green&fov=42&cx=-50&cz=380', 'tree_night_p'],
  ['star_lying', 1800, 1250, ''],
  ['star_top', 1400, 1200, ''],
  ['bock_standing', 1000, 1000, ''],
  ['bock_lying', 1100, 1000, ''],
  ['joint', 1700, 1050, ''],
  ['drill', 900, 900, ''],
  ['gloves', 1000, 900, ''],
  ['joint_close', 1400, 1000, ''],
  ['night', 2000, 1280, '&paint=red&fov=44&cz=450'],
  ['night', 1300, 1250, '&paint=red&fov=40&cx=40&cz=420', 'night_sq'],
];
const only = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const meta = fs.existsSync('out/meta.json') ? JSON.parse(fs.readFileSync('out/meta.json')) : {};
  for (const [s, w, h, extra, name] of jobs) {
    const n = name || s;
    if (only && only !== n) continue;
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('console', m => console.log(n, m.text()));
    p.on('pageerror', e => console.log(n, 'ERR', e.message));
    await p.goto(`http://localhost:8765/scene.html?scene=${s}&w=${w}&h=${h}${extra}`);
    await p.waitForFunction('window.__done === true', null, { timeout: 180000 });
    meta[n] = await p.evaluate('window.__meta');
    await p.locator('canvas').screenshot({ path: `out/${n}.png`, omitBackground: true });
    await p.close();
    console.log('done', n);
  }
  fs.writeFileSync('out/meta.json', JSON.stringify(meta, null, 1));
  await b.close();
})();
