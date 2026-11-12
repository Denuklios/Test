// Panorama (Schwenk) und 360°-Rundum-Panorama: Streifen aus der Bildmitte werden
// anhand der gemessenen Bildverschiebung aneinandergesetzt.
import { estimateShift } from './motion.js';

export class PanoCapture {
  constructor({ full360 = false, maxWidth = 14000 } = {}) {
    this.full360 = full360;
    this.maxW = maxWidth;
  }

  start(srcW, srcH) {
    const k = Math.min(1, 1600 / srcH);
    this.k = k;
    this.W = Math.round(srcW * k); this.H = Math.round(srcH * k);
    this.margin = Math.round(this.H * 0.25);
    this.c = document.createElement('canvas');
    this.c.width = this.maxW; this.c.height = this.H + this.margin * 2;
    this.ctx = this.c.getContext('2d');
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.c.width, this.c.height);
    this.strip = document.createElement('canvas');
    this.sctx = this.strip.getContext('2d');
    this.prev = null;
    this.Fx = 0; this.Fy = 0; this.lastFx = 0;
    this.minFy = 0; this.maxFy = 0;
    this.dir = 0;
    this.originY = this.margin;
    this.yawStart = null; this.yawTotal = 0; this.lastYaw = null;
    this.done = false;
    this.started = false;
    this.lostCount = 0;
  }

  get progress() {
    if (this.full360) return Math.min(1, Math.abs(this.yawTotal) / 360);
    return Math.min(1, Math.abs(this.Fx) / (this.maxW - this.W * 1.2));
  }

  /** Neues Kamerabild verarbeiten. src = (bearbeitetes) Vorschaubild, probe = kleines Graubild */
  feed(src, probe, yaw) {
    if (this.done) return;
    if (yaw != null) {
      if (this.lastYaw != null) {
        let d = yaw - this.lastYaw;
        if (d > 180) d -= 360; if (d < -180) d += 360;
        this.yawTotal += d;
      }
      this.lastYaw = yaw;
    }
    if (!this.prev) { this.prev = probe; this.firstFrame = this.snapshot(src); return; }
    const s = estimateShift(this.prev.gray, probe.gray, probe.w, probe.h, 26, 10);
    this.prev = probe;
    const scale = this.W / probe.w;
    // Kamera bewegt sich entgegen dem Bildinhalt
    this.Fx -= s.dx * scale;
    this.Fy -= s.dy * scale;
    this.lastShake = Math.abs(s.dy * scale);
    if (!this.dir) {
      if (Math.abs(this.Fx) > this.W * 0.03) {
        this.dir = Math.sign(this.Fx);
        this.originX = this.dir > 0 ? 0 : this.maxW - this.W;
        if (!this.full360) this.pasteHalf(this.firstFrame, true, 0, 0);
        this.lastFx = 0;
        this.started = true;
      } else return;
    }
    // Rückwärts-Schwenk ignorieren
    const adv = (this.Fx - this.lastFx) * this.dir;
    if (adv < 4) return;
    this.minFy = Math.min(this.minFy, this.Fy); this.maxFy = Math.max(this.maxFy, this.Fy);
    this.paste(src, adv);
    this.lastFx = this.Fx;
    const usedW = Math.abs(this.Fx) + this.W;
    if (usedW > this.maxW - 8) this.done = true;
    if (this.full360 && Math.abs(this.yawTotal) >= 362) this.done = true;
  }

  snapshot(src) {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    c.getContext('2d').drawImage(src, 0, 0, this.W, this.H);
    return c;
  }

  pasteHalf(frame, first, fx = this.Fx, fy = this.Fy) {
    const cx = this.W / 2;
    const y = this.originY + fy;
    // erster Rand: die Hälfte "hinter" der Schwenkrichtung; letzter: die Hälfte davor
    const leftHalf = (this.dir > 0) === first;
    const sx = leftHalf ? 0 : cx;
    this.ctx.drawImage(frame, sx, 0, cx, this.H, this.originX + fx + sx, y, cx, this.H);
  }

  paste(src, adv) {
    const cx = Math.round(this.W / 2);
    const ov = 12; // Überblendung
    const w = Math.ceil(adv) + ov;
    if (this.strip.width !== w || this.strip.height !== this.H) { this.strip.width = w; this.strip.height = this.H; }
    const sctx = this.sctx;
    sctx.globalCompositeOperation = 'source-over';
    const srcK = (src.width || src.videoWidth) / this.W;
    // Spalten im aktuellen Bild, die neu sind
    const sx = this.dir > 0 ? cx - Math.ceil(adv) - ov : cx;
    sctx.clearRect(0, 0, w, this.H);
    sctx.drawImage(src, sx * srcK, 0, w * srcK, this.H * srcK, 0, 0, w, this.H);
    // weiche Kante zum bereits vorhandenen Teil
    sctx.globalCompositeOperation = 'destination-in';
    const g = sctx.createLinearGradient(0, 0, w, 0);
    if (this.dir > 0) { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(ov / w, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
    else { g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1 - ov / w, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, w, this.H);
    this.ctx.drawImage(this.strip, Math.round(this.originX + this.Fx + sx), Math.round(this.originY + this.Fy));
  }

  /** Fertigstellen → {canvas, meta} */
  finish(lastSrc) {
    if (!this.started) return null;
    if (!this.full360 && lastSrc) this.pasteHalf(this.snapshot(lastSrc), false);
    const top = Math.ceil(this.originY + this.maxFy);
    const bottom = Math.floor(this.originY + this.minFy + this.H);
    let x0, x1;
    const meta = {};
    if (this.full360) {
      const cx = this.W / 2;
      const ppd = Math.abs(this.Fx) / Math.max(1, Math.abs(this.yawTotal));
      const len = Math.round(360 * ppd);
      if (this.dir > 0) { x0 = this.originX + cx; x1 = x0 + len; }
      else { x1 = this.originX + cx; x0 = x1 - len; }
      x0 = Math.max(0, x0); x1 = Math.min(this.maxW, x1);
      meta.ppd = ppd;
      meta.vfov = (bottom - top) / ppd;
      meta.hfovEstimate = this.W / ppd;
    } else {
      if (this.dir > 0) { x0 = this.originX; x1 = this.originX + this.Fx + this.W; }
      else { x0 = this.originX + this.Fx; x1 = this.originX + this.W; }
      x0 = Math.max(0, Math.round(x0)); x1 = Math.min(this.maxW, Math.round(x1));
    }
    const out = document.createElement('canvas');
    out.width = Math.max(2, Math.round(x1 - x0)); out.height = Math.max(2, bottom - top);
    out.getContext('2d').drawImage(this.c, x0, top, out.width, out.height, 0, 0, out.width, out.height);
    this.c.width = 1; // Speicher freigeben
    return { canvas: out, meta };
  }

  /** kleine Vorschau des bisherigen Panoramas */
  preview(target) {
    if (!this.started) return;
    const ctx = target.getContext('2d');
    const x0 = this.dir > 0 ? this.originX : this.originX + this.Fx;
    const w = Math.abs(this.Fx) + this.W;
    ctx.clearRect(0, 0, target.width, target.height);
    const k = target.height / this.c.height;
    const tw = Math.min(target.width, w * k);
    const drawW = tw / k;
    const sx = this.dir > 0 ? x0 + w - drawW : x0;
    ctx.drawImage(this.c, sx, 0, drawW, this.c.height, this.dir > 0 ? target.width - tw : 0, 0, tw, target.height);
  }
}
