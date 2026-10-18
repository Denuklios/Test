/* 3D-Vorschau (WebGL2): Werkstück aus der Simulation, Fräsbahnen, Werkzeug, Maschinentisch. */
(function (g) {
  const FS = (g.FS = g.FS || {});

  // ---------- Matrizen (spaltenweise, wie WebGL) ----------
  const m4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f);
      return o;
    },
    look(e, c, u) {
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const z = nrm(sub(e, c)), x = nrm(cross(u, z)), y = cross(z, x);
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
    },
  };

  const VS_SURF = `#version 300 es
  precision highp float;
  in vec2 aUV;
  uniform sampler2D uH; uniform vec2 uSize; uniform mat4 uMVP;
  out vec2 vUV; out float vH;
  void main() {
    ivec2 ts = textureSize(uH, 0);
    ivec2 t = ivec2(aUV * vec2(ts - 1) + 0.5);
    float h = texelFetch(uH, t, 0).r;
    vUV = aUV; vH = h;
    gl_Position = uMVP * vec4(aUV * uSize, h, 1.0);
  }`;
  const FS_SURF = `#version 300 es
  precision highp float;
  in vec2 vUV; in float vH;
  uniform sampler2D uH; uniform vec2 uSize; uniform float uT; uniform vec3 uCol; uniform vec3 uLight;
  out vec4 o;
  float H(ivec2 p) { ivec2 ts = textureSize(uH, 0); return texelFetch(uH, clamp(p, ivec2(0), ts - 1), 0).r; }
  void main() {
    ivec2 ts = textureSize(uH, 0);
    vec2 cell = uSize / vec2(ts - 1);
    ivec2 p = ivec2(vUV * vec2(ts - 1) + 0.5);
    float h = H(p);
    if (h <= -uT + 0.01) discard;
    float dx = (H(p + ivec2(1, 0)) - H(p - ivec2(1, 0))) / (2.0 * cell.x);
    float dy = (H(p + ivec2(0, 1)) - H(p - ivec2(0, 1))) / (2.0 * cell.y);
    vec3 n = normalize(vec3(-dx, -dy, 1.0));
    float dif = max(dot(n, normalize(uLight)), 0.0);
    float cutF = smoothstep(-0.02, -0.4, h);
    vec3 base = mix(uCol, uCol * 0.78, cutF);
    vec3 c = base * (0.38 + 0.72 * dif);
    o = vec4(c, 1.0);
  }`;
  const VS_WALL = `#version 300 es
  precision highp float;
  in vec3 aP; // x,y in mm, z: 1 = oben (Höhe aus Textur), 0 = unten
  in vec3 aN;
  uniform sampler2D uH; uniform vec2 uSize; uniform mat4 uMVP; uniform float uT;
  out vec3 vN;
  void main() {
    ivec2 ts = textureSize(uH, 0);
    ivec2 t = ivec2(clamp(aP.xy / uSize, 0.0, 1.0) * vec2(ts - 1) + 0.5);
    float h = aP.z > 0.5 ? texelFetch(uH, t, 0).r : -uT;
    vN = aN;
    gl_Position = uMVP * vec4(aP.xy, h, 1.0);
  }`;
  const FS_FLAT = `#version 300 es
  precision highp float;
  in vec3 vN; uniform vec3 uCol; uniform vec3 uLight; out vec4 o;
  void main() { float d = max(dot(normalize(vN), normalize(uLight)), 0.0); o = vec4(uCol * (0.45 + 0.6 * d), 1.0); }`;
  const VS_LINE = `#version 300 es
  precision highp float;
  in vec3 aP; in vec3 aC; in float aI;
  uniform mat4 uMVP; uniform float uProg; uniform float uLift;
  out vec4 vC;
  void main() {
    vC = vec4(aC, aI <= uProg ? 1.0 : 0.28);
    gl_Position = uMVP * vec4(aP.xy, aP.z + uLift, 1.0);
  }`;
  const FS_LINE = `#version 300 es
  precision highp float; in vec4 vC; out vec4 o; void main() { o = vC; }`;
  const VS_MESH = `#version 300 es
  precision highp float;
  in vec3 aP; in vec3 aN; uniform mat4 uMVP; uniform vec3 uOff; out vec3 vN;
  void main() { vN = aN; gl_Position = uMVP * vec4(aP + uOff, 1.0); }`;

  function prog(gl, vs, fs) {
    const mk = (t, s) => {
      const sh = gl.createShader(t);
      gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u, a: (name) => gl.getAttribLocation(p, name) };
  }

  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  class View3D {
    constructor(canvas) {
      this.cv = canvas;
      const gl = canvas.getContext('webgl2', { antialias: true });
      if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt');
      this.gl = gl;
      this.pS = prog(gl, VS_SURF, FS_SURF);
      this.pW = prog(gl, VS_WALL, FS_FLAT);
      this.pL = prog(gl, VS_LINE, FS_LINE);
      this.pM = prog(gl, VS_MESH, FS_FLAT);
      this.cam = { yaw: -0.6, pitch: 0.9, dist: 400, tx: 0, ty: 0, tz: 0 };
      this.stock = { w: 100, h: 100, t: 10 };
      this.color = hex('#e8c99a');
      this.progress = Infinity;
      this.toolPos = null;
      this.tool = null;
      this.showPaths = true;
      this.lineCount = 0;
      this.dirty = true;
      this.bind();
      const loop = () => { if (this.dirty) { this.dirty = false; this.draw(); } this.raf = requestAnimationFrame(loop); };
      loop();
      new ResizeObserver(() => { this.dirty = true; }).observe(canvas);
    }

    bind() {
      let drag = null, space = false, over = false, last = null;
      this.wheelZoom = false;
      const cv = this.cv;
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('pointerenter', () => { over = true; });
      cv.addEventListener('pointerleave', () => { over = false; last = null; });
      // Leertaste halten: verschieben (Maus bewegen oder ziehen) – wie in der 2D-Ansicht
      window.addEventListener('keydown', (e) => {
        if (e.key !== ' ' || !over || cv.classList.contains('hidden')) return;
        const tag = e.target.tagName;
        if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type === 'text')) return;
        e.preventDefault();
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        space = true;
        cv.style.cursor = 'grab';
      });
      window.addEventListener('keyup', (e) => { if (e.key === ' ' && space) { e.preventDefault(); space = false; cv.style.cursor = ''; } });
      window.addEventListener('blur', () => { space = false; cv.style.cursor = ''; });
      cv.addEventListener('pointerdown', (e) => {
        // Links ziehen = drehen; Umschalt, Leertaste, rechte oder mittlere Taste = verschieben
        drag = { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey || space };
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointerup', () => { drag = null; });
      cv.addEventListener('pointermove', (e) => {
        const lm = last;
        last = { x: e.clientX, y: e.clientY };
        if (!drag) {
          if (space && lm) this.pan(e.clientX - lm.x, e.clientY - lm.y);
          return;
        }
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan || space) this.pan(dx, dy);
        else this.orbit(dx, dy);
      });
      // Zwei Finger = verschieben, Spreizen / Strg + Rad = zoomen (Mausrad = Zoom, wenn so eingestellt)
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const dx = e.deltaX * unit, dy = e.deltaY * unit;
        if (e.ctrlKey || e.metaKey || (this.wheelZoom && !e.shiftKey)) this.zoom(Math.exp(dy * (e.ctrlKey && !this.wheelZoom && Math.abs(dy) < 50 ? 0.006 : 0.0012)));
        else if (e.shiftKey && !dx) this.pan(-dy, 0);
        else this.pan(-dx, -dy);
      }, { passive: false });
    }

    // Ansicht um Bildschirm-Pixel verschieben: der Inhalt folgt der Maus
    pan(dx, dy) {
      const c = this.cam;
      const H = Math.max(1, this.cv.clientHeight);
      const s = (2 * c.dist * Math.tan(0.35)) / H; // mm je Pixel in Zielentfernung (Blickwinkel 0,7 rad)
      // Verschieben in der Bildebene: rechts = (-sin y, cos y, 0), oben = (-cos y·sin p, -sin y·sin p, cos p)
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
      c.tx += (sy * dx - cy * sp * dy) * s;
      c.ty += (-cy * dx - sy * sp * dy) * s;
      c.tz += cp * dy * s;
      this.dirty = true;
    }
    // Bildschirmposition (CSS-Pixel) eines Punktes in mm – für Tests und Hilfen
    project(x, y, z) {
      const c = this.cam, W = this.cv.clientWidth, H = this.cv.clientHeight;
      const eye = [c.tx + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw), c.ty + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.tz + c.dist * Math.sin(c.pitch)];
      const m = m4.mul(m4.persp(0.7, W / H, 1, 10000), m4.look(eye, [c.tx, c.ty, c.tz], [0, 0, 1]));
      const v = [x, y, z, 1], o = [0, 0, 0, 0];
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[r] += m[k * 4 + r] * v[k];
      return { x: ((o[0] / o[3] + 1) / 2) * W, y: ((1 - o[1] / o[3]) / 2) * H };
    }
    orbit(dx, dy) {
      const c = this.cam;
      c.yaw -= dx * 0.008;
      c.pitch = Math.max(0.05, Math.min(1.55, c.pitch + dy * 0.008));
      this.dirty = true;
    }
    zoom(f) {
      this.cam.dist = Math.max(20, Math.min(3000, this.cam.dist * f));
      this.dirty = true;
    }

    preset(name) {
      const c = this.cam, s = this.stock;
      c.tx = s.w / 2; c.ty = s.h / 2; c.tz = -s.t / 2;
      c.dist = Math.max(s.w, s.h) * 1.6 + 40;
      if (name === 'top') { c.yaw = -Math.PI / 2; c.pitch = 1.55; }
      else if (name === 'front') { c.yaw = -Math.PI / 2; c.pitch = 0.25; }
      else { c.yaw = -Math.PI / 2 - 0.6; c.pitch = 0.75; }
      this.dirty = true;
    }

    setStock(stock, color) {
      this.stock = { w: stock.w, h: stock.h, t: stock.t };
      this.color = hex(color || '#e8c99a');
      this.buildWalls();
      this.buildBed();
      this.dirty = true;
    }

    setHeights(sim) {
      const gl = this.gl;
      if (!this.tex || this.texW !== sim.nx || this.texH !== sim.ny) {
        if (this.tex) gl.deleteTexture(this.tex);
        this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, sim.nx, sim.ny, 0, gl.RED, gl.FLOAT, sim.h);
        this.texW = sim.nx; this.texH = sim.ny;
        this.buildGrid(Math.min(sim.nx, 900), Math.min(sim.ny, 900));
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sim.nx, sim.ny, gl.RED, gl.FLOAT, sim.h);
      }
      this.simSize = [(sim.nx - 1) * sim.cell, (sim.ny - 1) * sim.cell];
      this.dirty = true;
    }

    buildGrid(nx, ny) {
      const gl = this.gl;
      const uv = new Float32Array(nx * ny * 2);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { uv[(j * nx + i) * 2] = i / (nx - 1); uv[(j * nx + i) * 2 + 1] = j / (ny - 1); }
      const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
      let k = 0;
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = c;
      }
      if (this.vaoS) gl.deleteVertexArray(this.vaoS);
      this.vaoS = gl.createVertexArray();
      gl.bindVertexArray(this.vaoS);
      const b1 = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      const loc = this.pS.a('aUV');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const b2 = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b2); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      this.nIdx = idx.length;
      gl.bindVertexArray(null);
    }

    meshVAO(prg, data, stride = 6) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const lp = prg.a('aP'), ln = prg.a('aN');
      gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, stride * 4, 0);
      if (ln >= 0) { gl.enableVertexAttribArray(ln); gl.vertexAttribPointer(ln, 3, gl.FLOAT, false, stride * 4, 12); }
      gl.bindVertexArray(null);
      return { vao, n: data.length / stride };
    }

    buildWalls() {
      const { w, h } = this.stock, d = [];
      const seg = 200;
      const side = (x0, y0, x1, y1, nx, ny) => {
        for (let i = 0; i < seg; i++) {
          const a = i / seg, b = (i + 1) / seg;
          const ax = x0 + (x1 - x0) * a, ay = y0 + (y1 - y0) * a, bx = x0 + (x1 - x0) * b, by = y0 + (y1 - y0) * b;
          d.push(ax, ay, 0, nx, ny, 0, bx, by, 0, nx, ny, 0, bx, by, 1, nx, ny, 0, ax, ay, 0, nx, ny, 0, bx, by, 1, nx, ny, 0, ax, ay, 1, nx, ny, 0);
        }
      };
      side(0, 0, w, 0, 0, -1, 0); side(w, 0, w, h, 1, 0); side(w, h, 0, h, 0, 1); side(0, h, 0, 0, -1, 0);
      this.walls = this.meshVAO(this.pW, new Float32Array(d));
    }

    buildBed() {
      const { w, h, t } = this.stock, d = [], m = 30;
      const z = -t - 0.05;
      for (let x = -m; x <= w + m + 0.01; x += 10) d.push(x, -m, z, 0, 0, 1, x, h + m, z, 0, 0, 1);
      for (let y = -m; y <= h + m + 0.01; y += 10) d.push(-m, y, z, 0, 0, 1, w + m, y, z, 0, 0, 1);
      // Achsen am Nullpunkt
      this.bed = this.meshVAO(this.pM, new Float32Array(d));
    }

    setPaths(moves) {
      const gl = this.gl, d = [];
      let p = null;
      moves.forEach((m, i) => {
        if (p) {
          const col = m.rapid ? [0.95, 0.3, 0.25] : m.z < p.z - 1e-6 && Math.hypot(m.x - p.x, m.y - p.y) < 1e-6 ? [0.95, 0.75, 0.15] : [0.15, 0.55, 0.95];
          d.push(p.x, p.y, p.z, ...col, i, m.x, m.y, m.z, ...col, i);
        }
        p = m;
      });
      if (this.vaoL) gl.deleteVertexArray(this.vaoL);
      this.vaoL = gl.createVertexArray();
      gl.bindVertexArray(this.vaoL);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW);
      const P = this.pL;
      gl.enableVertexAttribArray(P.a('aP')); gl.vertexAttribPointer(P.a('aP'), 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(P.a('aC')); gl.vertexAttribPointer(P.a('aC'), 3, gl.FLOAT, false, 28, 12);
      gl.enableVertexAttribArray(P.a('aI')); gl.vertexAttribPointer(P.a('aI'), 1, gl.FLOAT, false, 28, 24);
      gl.bindVertexArray(null);
      this.lineCount = d.length / 7;
      this.dirty = true;
    }

    setTool(tool) {
      if (!tool) { this.toolMesh = null; return; }
      const R = tool.d / 2, d = [], n = 24;
      const prof = FS.tools.profile(tool);
      // Schneide (Profil) bis Höhe 'cut', dann Schaft
      const rings = [];
      const cutH = Math.min(tool.len || 10, 20);
      const steps = 8;
      for (let s = 0; s <= steps; s++) { const r = (R * s) / steps; rings.push([r, Math.min(prof(r), cutH)]); }
      rings.push([R, cutH], [R, cutH + 25]);
      for (let k = 0; k < rings.length - 1; k++) {
        const [r0, z0] = rings[k], [r1, z1] = rings[k + 1];
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          const P = (r, z, a) => [r * Math.cos(a), r * Math.sin(a), z];
          const N = (a) => [Math.cos(a), Math.sin(a), 0.3];
          const q = [P(r0, z0, a0), P(r1, z1, a0), P(r1, z1, a1), P(r0, z0, a0), P(r1, z1, a1), P(r0, z0, a1)];
          const nn = [N(a0), N(a0), N(a1), N(a0), N(a1), N(a1)];
          q.forEach((v, j) => d.push(...v, ...nn[j]));
        }
      }
      this.toolMesh = this.meshVAO(this.pM, new Float32Array(d));
      this.dirty = true;
    }

    draw() {
      const gl = this.gl, cv = this.cv;
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(cv.clientWidth * dpr)), H = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      gl.viewport(0, 0, W, H);
      const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) gl.clearColor(0.11, 0.12, 0.14, 1); else gl.clearColor(0.93, 0.94, 0.96, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const c = this.cam;
      const eye = [c.tx + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw), c.ty + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.tz + c.dist * Math.sin(c.pitch)];
      const mvp = m4.mul(m4.persp(0.7, W / H, 1, 10000), m4.look(eye, [c.tx, c.ty, c.tz], [0, 0, 1]));
      const light = [0.4, -0.6, 1.0];
      if (this.bed) {
        gl.useProgram(this.pM.p);
        gl.uniformMatrix4fv(this.pM.u.uMVP, false, mvp);
        gl.uniform3f(this.pM.u.uOff, 0, 0, 0);
        gl.uniform3fv(this.pM.u.uCol, dark ? [0.3, 0.32, 0.36] : [0.7, 0.72, 0.76]);
        gl.uniform3fv(this.pM.u.uLight, [0, 0, 1]);
        gl.bindVertexArray(this.bed.vao);
        gl.drawArrays(gl.LINES, 0, this.bed.n);
      }
      if (this.tex && this.vaoS) {
        gl.useProgram(this.pS.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.uniform1i(this.pS.u.uH, 0);
        gl.uniform2fv(this.pS.u.uSize, this.simSize);
        gl.uniformMatrix4fv(this.pS.u.uMVP, false, mvp);
        gl.uniform1f(this.pS.u.uT, this.stock.t);
        gl.uniform3fv(this.pS.u.uCol, this.color);
        gl.uniform3fv(this.pS.u.uLight, light);
        gl.bindVertexArray(this.vaoS);
        gl.drawElements(gl.TRIANGLES, this.nIdx, gl.UNSIGNED_INT, 0);
        if (this.walls) {
          gl.useProgram(this.pW.p);
          gl.uniform1i(this.pW.u.uH, 0);
          gl.uniform2fv(this.pW.u.uSize, this.simSize);
          gl.uniformMatrix4fv(this.pW.u.uMVP, false, mvp);
          gl.uniform1f(this.pW.u.uT, this.stock.t);
          gl.uniform3fv(this.pW.u.uCol, this.color.map((v) => v * 0.85));
          gl.uniform3fv(this.pW.u.uLight, light);
          gl.bindVertexArray(this.walls.vao);
          gl.drawArrays(gl.TRIANGLES, 0, this.walls.n);
        }
      }
      if (this.showPaths && this.vaoL && this.lineCount) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.pL.p);
        gl.uniformMatrix4fv(this.pL.u.uMVP, false, mvp);
        gl.uniform1f(this.pL.u.uProg, this.progress);
        gl.uniform1f(this.pL.u.uLift, 0.02);
        gl.bindVertexArray(this.vaoL);
        gl.drawArrays(gl.LINES, 0, this.lineCount);
        gl.disable(gl.BLEND);
      }
      if (this.toolMesh && this.toolPos) {
        gl.useProgram(this.pM.p);
        gl.uniformMatrix4fv(this.pM.u.uMVP, false, mvp);
        gl.uniform3f(this.pM.u.uOff, this.toolPos.x, this.toolPos.y, this.toolPos.z);
        gl.uniform3fv(this.pM.u.uCol, [0.78, 0.8, 0.85]);
        gl.uniform3fv(this.pM.u.uLight, light);
        gl.bindVertexArray(this.toolMesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.toolMesh.n);
      }
      gl.bindVertexArray(null);
    }
  }

  FS.View3D = View3D;
})(typeof window !== 'undefined' ? window : globalThis);
