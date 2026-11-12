// 360°-Betrachter: equirektanguläre Bilder (Kugel) oder Rundum-Panoramen (Zylinder-Band)
import { orientation } from './orientation.js';

const VS = `attribute vec2 aPos; varying vec2 vP; void main(){ vP=aPos; gl_Position=vec4(aPos,0.,1.); }`;
const FS = `precision highp float;
varying vec2 vP;
uniform sampler2D uTex; uniform float uYaw, uPitch, uFov, uAspect; uniform vec2 uLat; // Breiten-Bereich des Bildes (Bogenmaß)
uniform mat3 uRot; uniform float uUseRot;
void main(){
  float t = tan(uFov*0.5);
  vec3 r = normalize(vec3(vP.x*t*uAspect, vP.y*t, 1.));
  vec3 d;
  if(uUseRot>0.5){
    // Gerät → Erde (Kamera blickt in -z des Geräts)
    d = uRot*vec3(r.x, r.y, -r.z);
  } else {
    float cp=cos(uPitch), sp=sin(uPitch);
    vec3 q = vec3(r.x, r.y*cp + r.z*sp, -r.y*sp + r.z*cp);
    float cy=cos(uYaw), sy=sin(uYaw);
    d = vec3(q.x*cy + q.z*sy, -q.x*sy + q.z*cy, q.y);
  }
  float lon = atan(d.x, d.y);
  float lat = asin(clamp(d.z,-1.,1.));
  float u = lon/6.2831853 + 0.5;
  float v = (uLat.y - lat)/(uLat.y - uLat.x);
  if(v<0.||v>1.) { gl_FragColor = vec4(0.05,0.05,0.06,1.); return; }
  gl_FragColor = texture2D(uTex, vec2(u, v));
}`;

export class Viewer360 {
  constructor(canvas) {
    this.c = canvas;
    const gl = canvas.getContext('webgl', { antialias: true });
    this.gl = gl;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p); gl.useProgram(p);
    this.p = p;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const l = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    this.yaw = 0; this.pitch = 0; this.fov = 75;
    this.useGyro = false;
    this.lat = [-Math.PI / 2, Math.PI / 2];
    this.bind();
  }

  async load(blob, { vfov = 180 } = {}) {
    const bmp = await createImageBitmap(blob);
    const gl = this.gl;
    let src = bmp;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    // WebGL1: Wiederholung nur mit 2er-Potenzen → Bild auf passende Größe bringen
    const pot = (n) => 2 ** Math.round(Math.log2(n));
    const w = Math.min(max, pot(bmp.width)), h = Math.min(max, pot(bmp.height));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    src = c;
    bmp.close();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const half = Math.min(180, vfov) / 2 * Math.PI / 180;
    this.lat = [-half, half];
    this.yaw = 0; this.pitch = 0;
    this.start();
  }

  bind() {
    const pts = new Map();
    let pinch0 = 0, fov0 = 75;
    this.c.addEventListener('pointerdown', (e) => { this.c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.spin = 0; });
    this.c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!pinch0) { pinch0 = d; fov0 = this.fov; }
        this.fov = Math.max(30, Math.min(110, fov0 * pinch0 / d));
        return;
      }
      const k = this.fov / this.c.clientHeight;
      this.yaw -= (e.clientX - p.x) * k;
      this.pitch = Math.max(-89, Math.min(89, this.pitch + (e.clientY - p.y) * k));
      this.spin = -(e.clientX - p.x) * k;
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    this.c.addEventListener('pointerup', up);
    this.c.addEventListener('pointercancel', up);
    this.c.addEventListener('wheel', (e) => { this.fov = Math.max(30, Math.min(110, this.fov + e.deltaY * 0.05)); e.preventDefault(); }, { passive: false });
  }

  setGyro(on) {
    if (on === this.useGyro) return;
    this.useGyro = on;
    if (on) orientation.start(); else orientation.stop();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  draw() {
    const gl = this.gl, c = this.c;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    if (this.spin) { this.yaw += this.spin; this.spin *= 0.92; if (Math.abs(this.spin) < 0.01) this.spin = 0; }
    gl.viewport(0, 0, w, h);
    const u = (n) => gl.getUniformLocation(this.p, n);
    gl.uniform1f(u('uYaw'), this.yaw * Math.PI / 180);
    gl.uniform1f(u('uPitch'), this.pitch * Math.PI / 180);
    gl.uniform1f(u('uFov'), this.fov * Math.PI / 180);
    gl.uniform1f(u('uAspect'), w / h);
    gl.uniform2f(u('uLat'), this.lat[0], this.lat[1]);
    const gyro = this.useGyro && orientation.R;
    gl.uniform1f(u('uUseRot'), gyro ? 1 : 0);
    if (gyro) {
      // zusätzlich die Wisch-Drehung um die Hochachse
      const a = this.yaw * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const R = orientation.R;
      // Rz(-yaw) · R (zeilenweise) → spaltenweise für WebGL
      const M = [
        ca * R[0] + sa * R[3], ca * R[1] + sa * R[4], ca * R[2] + sa * R[5],
        -sa * R[0] + ca * R[3], -sa * R[1] + ca * R[4], -sa * R[2] + ca * R[5],
        R[6], R[7], R[8],
      ];
      gl.uniformMatrix3fv(u('uRot'), false, new Float32Array([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]));
    }
    gl.uniform1i(u('uTex'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  stop() { this.running = false; this.setGyro(false); }
}
