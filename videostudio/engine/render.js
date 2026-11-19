#!/usr/bin/env node
// Rendert ein Video-Projekt zu MP4 (1080x1920) plus Cover-Bild.
// Aufruf: node render.js <projektordner> [--fps 30] [--nur-cover]
const { chromium } = require("playwright");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const ordner = path.resolve(args[0]);
const fps = +(args[args.indexOf("--fps") + 1] || 30) || 30;
const nurCover = args.includes("--nur-cover");

const projekt = JSON.parse(fs.readFileSync(path.join(ordner, "projekt.json"), "utf8"));
const timing = JSON.parse(fs.readFileSync(path.join(ordner, "timing.json"), "utf8"));
const name = projekt.datei || "video";

function sfxSpur(datei) {
  // Kurzer "Wusch" bei jedem Szenenwechsel, leise unter die Stimme gemischt
  const starts = timing.szenen.slice(1).map(s => s.start);
  if (!starts.length) return null;
  const inputs = [], filter = [];
  starts.forEach((s, i) => {
    inputs.push("-f", "lavfi", "-t", "0.45", "-i", "anoisesrc=color=pink:amplitude=0.6:seed=" + (i + 3));
    const ms = Math.max(0, Math.round((s - 0.12) * 1000));
    filter.push(`[${i}]highpass=f=500,lowpass=f=5000,afade=t=in:d=0.18,afade=t=out:st=0.18:d=0.27,volume=0.22,adelay=${ms}|${ms}[w${i}]`);
  });
  filter.push(starts.map((_, i) => `[w${i}]`).join("") + `amix=inputs=${starts.length}:normalize=0,apad=whole_dur=${timing.gesamt}[out]`);
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter.join(";"), "-map", "[out]", "-ac", "2", "-ar", "44100", datei]);
  return datei;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "player.html"));
  await page.evaluate(([p, t]) => { window.PROJEKT = p; window.TIMING = t; }, [projekt, timing]);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.aufbauen());
  await page.evaluate(() => document.fonts.ready);

  // Cover
  await page.evaluate((c) => {
    const i = c.szene ?? 0;
    window.zeige(window.TIMING.szenen[i].start + window.TIMING.szenen[i].dauer - 0.05);
    document.getElementById("untertitel").innerHTML = "";
    document.getElementById("balken").style.display = "none";
    document.getElementById("blitz").style.opacity = 0;
    const el = document.querySelectorAll(".szene")[i];
    el.style.transform = "none"; el.style.opacity = 1;
    let k = el.querySelector(".kopf");
    if (!k) { k = document.createElement("div"); k.className = "kopf"; el.prepend(k); }
    k.innerHTML = c.titel; k.style.transform = "none"; k.style.opacity = 1;
    k.style.top = "1440px"; k.style.fontSize = "150px";
    el.querySelector(".bild").style.top = "330px";
  }, projekt.cover || { titel: projekt.titel });
  await page.screenshot({ path: path.join(ordner, name + "_cover.jpg"), type: "jpeg", quality: 92 });
  if (!nurCover) await page.reload();
  if (nurCover) { await browser.close(); return; }


  await page.evaluate(([p, t]) => { window.PROJEKT = p; window.TIMING = t; }, [projekt, timing]);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.aufbauen());

  const stumm = path.join(ordner, "_bild.mp4");
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", stumm], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.ceil(timing.gesamt * fps);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.zeige(t), f / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (f % (fps * 5) === 0) process.stdout.write(`\rBild ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  await browser.close();
  console.log(`\rBilder fertig: ${frames} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // Ton: Stimme + Übergangsgeräusche (+ optionale Musik im Projektordner: musik.mp3)
  const sprache = path.join(ordner, "audio", "gesamt.wav");
  const sfx = sfxSpur(path.join(ordner, "audio", "sfx.wav"));
  const musik = path.join(ordner, "musik.mp3");
  const ins = ["-i", stumm, "-i", sprache];
  let mix = "[1]volume=1.0[s]", spuren = "[s]", n = 1;
  if (sfx) { ins.push("-i", sfx); n++; mix += `;[${n}]anull[x]`; spuren += "[x]"; }
  if (fs.existsSync(musik)) { ins.push("-stream_loop", "-1", "-i", musik); n++; mix += `;[${n}]volume=0.10,atrim=0:${timing.gesamt}[m]`; spuren += "[m]"; }
  mix += `;${spuren}amix=inputs=${spuren.split("][").length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
  const ziel = path.join(ordner, name + ".mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...ins, "-filter_complex", mix, "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest", ziel]);
  fs.unlinkSync(stumm);
  console.log("Fertig:", ziel);
})();
