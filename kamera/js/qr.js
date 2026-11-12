// QR-Codes und Barcodes lesen (eingebauter Detektor, sonst jsQR – beides ohne Internet)
import { openUrl, share } from './store.js';
import { icon } from './icons.js';

export class QrScanner {
  constructor() {
    this.c = document.createElement('canvas');
    this.ctx = this.c.getContext('2d', { willReadFrequently: true });
    this.busy = false;
    this.detector = null;
    if ('BarcodeDetector' in window) {
      BarcodeDetector.getSupportedFormats?.().then((f) => { if (f?.length) this.detector = new BarcodeDetector({ formats: f }); }).catch(() => {});
    }
  }
  /** → {text, format, points:[{x,y} 0..1]} oder null */
  async scan(video) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw) return null;
      if (this.detector) {
        try {
          const r = await this.detector.detect(video);
          if (r?.length) {
            const b = r[0];
            return { text: b.rawValue, format: b.format, points: (b.cornerPoints || []).map((p) => ({ x: p.x / vw, y: p.y / vh })) };
          }
        } catch { /* jsQR versuchen */ }
      }
      if (typeof jsQR !== 'function') return null;
      const k = Math.min(1, 720 / Math.max(vw, vh));
      const w = Math.round(vw * k), h = Math.round(vh * k);
      if (this.c.width !== w) { this.c.width = w; this.c.height = h; }
      this.ctx.drawImage(video, 0, 0, w, h);
      const img = this.ctx.getImageData(0, 0, w, h);
      const r = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (!r || !r.data) return null;
      const L = r.location;
      return { text: r.data, format: 'qr_code', points: [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => ({ x: p.x / w, y: p.y / h })) };
    } finally { this.busy = false; }
  }
}

function parse(text) {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) return { kind: 'Link', url: t };
  if (/^www\./i.test(t)) return { kind: 'Link', url: 'https://' + t };
  if (/^WIFI:/i.test(t)) {
    const get = (k) => (t.match(new RegExp(`[;:]${k}:((?:\\\\.|[^;])*)`, 'i')) || [])[1]?.replace(/\\(.)/g, '$1') || '';
    return { kind: 'WLAN', info: `Netz: ${get('S')}\nPasswort: ${get('P') || '(keins)'}\nVerschlüsselung: ${get('T') || '–'}`, copy: get('P') };
  }
  if (/^BEGIN:VCARD/i.test(t)) return { kind: 'Kontakt', info: t.replace(/\r/g, '') };
  if (/^mailto:/i.test(t)) return { kind: 'E-Mail', url: t };
  if (/^tel:/i.test(t)) return { kind: 'Telefon', url: t };
  if (/^(sms|smsto):/i.test(t)) return { kind: 'SMS', url: t.replace(/^smsto:/i, 'sms:') };
  if (/^geo:/i.test(t)) return { kind: 'Ort', url: t };
  if (/^BCD\n/.test(t)) return { kind: 'Überweisung (GiroCode)', info: t.split('\n').filter(Boolean).slice(4, 9).join('\n') };
  return { kind: 'Text' };
}

export function showQrResult(text, format) {
  const sh = document.querySelector('#sheet');
  const p = parse(text);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  sh.innerHTML = `<h3>${format && format !== 'qr_code' ? 'Barcode' : 'QR-Code'} · ${p.kind}</h3>
    <div class="txt">${esc(p.info || text)}</div>
    <div class="btnrow">
      ${p.url ? `<button class="btn primary" data-a="open">${icon('link', 20)}Öffnen</button>` : ''}
      <button class="btn" data-a="copy">${icon('copy', 20)}${p.kind === 'WLAN' ? 'Passwort kopieren' : 'Kopieren'}</button>
      <button class="btn" data-a="share">${icon('share', 20)}Teilen</button>
      <button class="btn" data-a="close">${icon('close', 20)}Weiter</button>
    </div>`;
  sh.hidden = false;
  sh.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'open') openUrl(p.url);
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(p.copy || text); b.textContent = 'Kopiert ✓'; } catch { b.textContent = 'Nicht möglich'; }
      return;
    }
    if (a === 'share') share(new Blob([text], { type: 'text/plain' }), 'qr-code.txt');
    sh.hidden = true;
  });
}
