/* Strichcode-Scanner für Kasse und Admin.
   1) Kamera (Tablet/Handy): JKScan.camera(code => …)
   2) Hand-Scanner per USB/Bluetooth: tippen wie eine Tastatur sehr schnell und schicken Enter.
      JKScan.listen(code => …) erkennt das, auch wenn kein Eingabefeld ausgewählt ist.
   3) Eingabefelder mit data-scan bekommen automatisch einen Kamera-Knopf. */
(function () {
  "use strict";
  const LIB = (document.currentScript && document.currentScript.src.replace(/scanner\.js.*$/, "")) || "";
  let libPromise = null;
  function loadLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (!libPromise) libPromise = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = LIB + "html5-qrcode.min.js";
      s.onload = ok; s.onerror = () => fail(new Error("Scanner konnte nicht geladen werden."));
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function beep() {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 1760; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.08);
    } catch (e) {}
    if (navigator.vibrate) navigator.vibrate(40);
  }

  /* Kamera öffnen. continuous = true lässt sie für mehrere Artikel offen. */
  async function camera(onCode, opts = {}) {
    const ov = document.createElement("div");
    ov.className = "scan-overlay";
    ov.innerHTML = `<div class="scan-box" role="dialog" aria-label="Strichcode scannen">
      <div id="scan-region"></div>
      <div class="scan-bar"><p class="scan-msg">Strichcode in den Rahmen halten …</p>
      <button type="button" class="btn small scan-close">Fertig</button></div></div>`;
    document.body.appendChild(ov);
    const msg = ov.querySelector(".scan-msg");
    let scanner = null, last = "", lastAt = 0, closed = false;
    const close = async () => {
      if (closed) return; closed = true;
      try { if (scanner && scanner.isScanning) await scanner.stop(); } catch (e) {}
      ov.remove();
      if (opts.onClose) opts.onClose();
    };
    ov.querySelector(".scan-close").addEventListener("click", close);
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    try {
      await loadLib();
      const F = Html5QrcodeSupportedFormats;
      scanner = new Html5Qrcode("scan-region", {
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false,
      });
      await scanner.start({ facingMode: "environment" },
        { fps: 12, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 420), height: Math.min(h * 0.5, 200) }), aspectRatio: 1.6 },
        code => {
          const now = Date.now();
          if (code === last && now - lastAt < 1800) return;   // denselben Code nicht doppelt
          last = code; lastAt = now;
          beep();
          if (opts.continuous) { msg.textContent = "Erkannt: " + code; onCode(code); }
          else { close().then(() => onCode(code)); }
        }, () => {});
    } catch (e) {
      const t = String(e && (e.message || e));
      msg.textContent = /NotAllowed|Permission/i.test(t) ? "Kamera-Zugriff wurde abgelehnt. Bitte in den Browser-Einstellungen erlauben."
        : /secure|https/i.test(t) ? "Die Kamera geht nur über https://."
        : "Kamera nicht verfügbar: " + t;
    }
    return close;
  }

  /* Hand-Scanner erkennen: viele Zeichen in kurzer Folge, dann Enter. */
  function listen(onCode, opts = {}) {
    let buf = "", fastCount = 0, lastT = 0;
    document.addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = performance.now();
      const fast = t - lastT < (opts.gap || 50);
      lastT = t;
      if (e.key === "Enter") {
        const code = buf, wasScan = code.length >= 4 && fastCount >= code.length - 1 && fast;
        buf = ""; fastCount = 0;
        if (!wasScan) return;
        const target = e.target;
        const typingField = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.hasAttribute("data-scan-global");
        if (typingField && !opts.always) return;          // in Eingabefeldern übernimmt das Feld selbst
        e.preventDefault();
        if (typingField && target.value.endsWith(code)) target.value = target.value.slice(0, -code.length);
        beep(); onCode(code);
        return;
      }
      if (e.key.length !== 1) return;
      if (fast && buf) fastCount++; else { buf = ""; fastCount = 0; }
      buf += e.key;
    }, true);
  }

  /* Felder mit data-scan bekommen einen Kamera-Knopf daneben */
  function decorate(root = document) {
    root.querySelectorAll("input[data-scan]:not([data-scan-done])").forEach(inp => {
      inp.setAttribute("data-scan-done", "");
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn ghost scan-btn"; b.textContent = "📷 Scannen";
      b.addEventListener("click", () => camera(code => {
        inp.value = code;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        if (inp.hasAttribute("data-scan-submit") && inp.form) inp.form.requestSubmit ? inp.form.requestSubmit() : inp.form.submit();
      }));
      const wrap = document.createElement("div");
      wrap.className = "bar-input";
      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(inp); wrap.appendChild(b);
    });
  }

  window.JKScan = { camera, listen, decorate, beep };
  if (document.readyState !== "loading") decorate(); else document.addEventListener("DOMContentLoaded", () => decorate());
})();
