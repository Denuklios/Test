// Rendert das App-Symbol (app-icon.svg) als PNG für ältere Android-Versionen und den Store (512 px).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'app-icon.svg'), 'utf8');
  const b = await chromium.launch(); const p = await b.newPage();
  const res = path.join(__dirname, '..', 'app', 'src', 'main', 'res');
  const shot = async (size, round, out) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;overflow:hidden;border-radius:${round ? '50%' : '22%'}">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body></html>`);
    await p.screenshot({ path: out, omitBackground: true });
  };
  for (const [d, n] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) await shot(n, false, path.join(res, `mipmap-${d}`, 'ic_launcher.png'));
  await shot(512, false, path.join(__dirname, 'app-icon-512.png'));
  await b.close(); console.log('ok');
})();
