// Zugriff auf die Kamera-Hardware: Objektiv, Auflösung, Bildrate, Zoom, Fokus, Belichtung, Weißabgleich, Licht
export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'environment';
    this.deviceId = null;
  }

  async listCameras() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'videoinput');
    } catch { return []; }
  }

  /** opts: {w, h, fps, facing, deviceId, maxFps} */
  async open(opts = {}) {
    this.stop();
    const facing = opts.facing || this.facing;
    const video = {
      width: { ideal: opts.w || 1920 },
      height: { ideal: opts.h || 1080 },
      frameRate: { ideal: opts.fps || 30 },
      resizeMode: 'none',
    };
    if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
    else video.facingMode = { ideal: facing };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      if (e.name === 'OverconstrainedError' || e.name === 'NotReadableError') {
        stream = await navigator.mediaDevices.getUserMedia({ video: opts.deviceId ? { deviceId: opts.deviceId } : { facingMode: facing }, audio: false });
      } else throw e;
    }
    this.stream = stream;
    this.track = stream.getVideoTracks()[0];
    this.caps = this.track.getCapabilities ? this.track.getCapabilities() : {};
    this.facing = (this.track.getSettings().facingMode) || facing;
    this.deviceId = this.track.getSettings().deviceId;
    if (opts.maxFps && this.caps.frameRate?.max > 31) {
      const fps = Math.min(opts.maxFps, this.caps.frameRate.max);
      try { await this.track.applyConstraints({ frameRate: { ideal: fps, min: Math.min(fps, 50) } }); } catch {
        try { await this.track.applyConstraints({ frameRate: fps }); } catch { /* bleibt bei 30 */ }
      }
    }
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play().catch(() => {});
    await new Promise((r) => {
      if (this.video.videoWidth) return r();
      this.video.onloadedmetadata = () => r();
      setTimeout(r, 2500);
    });
    this.imageCapture = typeof ImageCapture === 'function' ? new ImageCapture(this.track) : null;
    return this.settings;
  }

  get settings() { return this.track?.getSettings ? this.track.getSettings() : {}; }
  get fps() { return this.settings.frameRate || 30; }
  get isFront() { return this.facing === 'user'; }

  has(name) { return this.caps && name in this.caps; }

  async set(constraints) {
    if (!this.track) return false;
    try {
      await this.track.applyConstraints({ advanced: [constraints] });
      return true;
    } catch { return false; }
  }

  async zoom(z) {
    if (!this.has('zoom')) return false;
    const c = this.caps.zoom;
    return this.set({ zoom: Math.max(c.min, Math.min(c.max, z)) });
  }

  async torch(on) { return this.has('torch') ? this.set({ torch: !!on }) : false; }

  /** Fokus/Belichtung auf Punkt (0..1) */
  async focusAt(x, y, lock = false) {
    const c = { pointsOfInterest: [{ x, y }] };
    if (this.caps.focusMode?.includes('single-shot')) c.focusMode = lock ? 'manual' : 'single-shot';
    if (this.caps.exposureMode?.includes('continuous') && !lock) c.exposureMode = 'continuous';
    const ok = await this.set(c);
    if (!lock && this.caps.focusMode?.includes('continuous')) {
      setTimeout(() => this.set({ focusMode: 'continuous' }), 2500);
    }
    return ok;
  }

  async allAuto() {
    const c = {};
    if (this.caps.focusMode?.includes('continuous')) c.focusMode = 'continuous';
    if (this.caps.exposureMode?.includes('continuous')) c.exposureMode = 'continuous';
    if (this.caps.whiteBalanceMode?.includes('continuous')) c.whiteBalanceMode = 'continuous';
    if (this.has('exposureCompensation')) c.exposureCompensation = 0;
    return this.set(c);
  }

  /** Foto in voller Sensor-Auflösung (falls möglich) */
  async takePhoto(flash) {
    if (!this.imageCapture) return null;
    try {
      const opts = {};
      try {
        const pc = await this.imageCapture.getPhotoCapabilities();
        if (pc.imageWidth?.max) { opts.imageWidth = pc.imageWidth.max; opts.imageHeight = pc.imageHeight.max; }
        if (pc.fillLightMode?.length) opts.fillLightMode = flash === 'on' && pc.fillLightMode.includes('flash') ? 'flash' : flash === 'auto' && pc.fillLightMode.includes('auto') ? 'auto' : 'off';
      } catch { /* ohne Optionen */ }
      const blob = await this.imageCapture.takePhoto(opts);
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch { return null; }
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null; this.track = null;
  }
}
