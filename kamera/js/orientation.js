// Lage des Handys (Gyroskop/Beschleunigung) als Drehmatrix: Gerät → Erde (x Osten, y Norden, z oben)
const D2R = Math.PI / 180;

export function rotMatrix(alpha, beta, gamma) {
  const a = (alpha || 0) * D2R, b = (beta || 0) * D2R, g = (gamma || 0) * D2R;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  return [
    cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG,
    cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB,
    -cB * sG, sB, cB * cG,
  ];
}

/** R · v */
export const mul = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
/** Rᵀ · v (Erde → Gerät) */
export const mulT = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];

export const dirFromYawPitch = (yaw, pitch) => [Math.cos(pitch * D2R) * Math.sin(yaw * D2R), Math.cos(pitch * D2R) * Math.cos(yaw * D2R), Math.sin(pitch * D2R)];

class Orientation {
  constructor() {
    this.R = null;
    this.listeners = 0;
    this.speed = 0; // Grad pro Sekunde
    this.onEvent = (e) => {
      if (e.alpha == null && e.beta == null) return;
      const R = rotMatrix(e.alpha, e.beta, e.gamma);
      const now = performance.now();
      if (this.R && this.t) {
        const f0 = this.forwardOf(this.R), f1 = this.forwardOf(R);
        const ang = Math.acos(Math.min(1, f0[0] * f1[0] + f0[1] * f1[1] + f0[2] * f1[2])) / D2R;
        const dt = Math.max(1, now - this.t) / 1000;
        this.speed = this.speed * 0.7 + (ang / dt) * 0.3;
      }
      this.R = R; this.t = now;
    };
  }
  start() {
    if (this.listeners++ === 0) {
      window.addEventListener('deviceorientation', this.onEvent);
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        DeviceOrientationEvent.requestPermission().catch(() => {});
      }
    }
  }
  stop() {
    if (--this.listeners <= 0) { this.listeners = 0; window.removeEventListener('deviceorientation', this.onEvent); }
  }
  get available() { return !!this.R; }
  forwardOf(R) { return [-R[2], -R[5], -R[8]]; }
  /** Blickrichtung der Rückkamera */
  get forward() { return this.R ? this.forwardOf(this.R) : [0, 1, 0]; }
  get yaw() { const f = this.forward; return Math.atan2(f[0], f[1]) / D2R; }
  get pitch() { const f = this.forward; return Math.asin(Math.max(-1, Math.min(1, f[2]))) / D2R; }
  /** Drehung um die Blickachse (0 = Hochformat gerade, ±90 = Querformat) */
  get roll() { return this.R ? Math.atan2(this.R[6], this.R[7]) / D2R : 0; }
}

export const orientation = new Orientation();
