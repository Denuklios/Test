// Komplette 360°-Kugel: geführte Aufnahme Reihe für Reihe von oben nach unten,
// dann Zusammensetzen zu einem 360°-Foto (equirektangulär, mit Panorama-Kennung für Google Fotos & Co.).
import { mulT, dirFromYawPitch } from './orientation.js';

const D2R = Math.PI / 180;

export function vfovFrom(hfov, w, h) {
  return 2 * Math.atan(Math.tan(hfov * D2R / 2) * h / w) / D2R;
}

/** Zielpunkte planen. quality: 'schnell' | 'normal' | 'fein' */
export function planTargets(hfov, vfov, yaw0, quality = 'normal') {
  const step = { schnell: 0.85, normal: 0.7, fein: 0.55 }[quality] || 0.7;
  const vStep = Math.min(vfov * step, 45);
  const rows = [];
  // Reihen von oben (Zenit) nach unten (Nadir)
  const nUp = Math.ceil((90 - vfov / 2) / vStep);
  const pitches = [];
  for (let p = 90; p > -90.01; p -= 90 / Math.max(1, nUp)) pitches.push(Math.round(p * 10) / 10);
  if (pitches[pitches.length - 1] > -89) pitches.push(-90);
  const targets = [];
  pitches.forEach((pitch, ri) => {
    const n = Math.abs(pitch) > 89 ? 1 : Math.max(3, Math.ceil(360 * Math.cos(pitch * D2R) / (hfov * step)));
    const row = { pitch, n, index: ri };
    rows.push(row);
    for (let i = 0; i < n; i++) {
      const yaw = yaw0 + i * 360 / n;
      targets.push({ row: ri, i, yaw, pitch, dir: dirFromYawPitch(yaw, pitch), done: false });
    }
  });
  return { rows, targets };
}

export const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R;

/** Punkt in Erd-Richtung → Bildschirm (Vorschau-Rechteck), oder null wenn hinter der Kamera */
export function project(R, dir, rect, hfov, vfov) {
  const c = mulT(R, dir);
  if (c[2] > -0.05) return null;
  const x = c[0] / -c[2], y = c[1] / -c[2];
  return {
    x: rect.x + rect.w / 2 + x / Math.tan(hfov * D2R / 2) * rect.w / 2,
    y: rect.y + rect.h / 2 - y / Math.tan(vfov * D2R / 2) * rect.h / 2,
  };
}

const VS = `#version 300 es
in vec2 aPos; out vec2 vUV;
void main(){ vUV = vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position = vec4(aPos,0.,1.); }`;

const FS_ACC = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uImg; uniform mat3 uRT; uniform vec2 uTan; uniform float uSharp; uniform float uDepthMode;
void main(){
  float lon = (vUV.x-0.5)*6.2831853; float lat = (0.5-vUV.y)*3.1415927;
  vec3 d = vec3(cos(lat)*sin(lon), cos(lat)*cos(lon), sin(lat));
  vec3 c = uRT*d;
  if(c.z > -0.02) discard;
  float x = c.x/(-c.z), y = c.y/(-c.z);
  float iu = 0.5 + x/(2.*uTan.x), iv = 0.5 - y/(2.*uTan.y);
  if(iu<0.||iu>1.||iv<0.||iv>1.) discard;
  float w = (1.-abs(2.*iu-1.))*(1.-abs(2.*iv-1.));
  w = pow(w, uSharp) + 1e-5;
  vec3 col = texture(uImg, vec2(iu,iv)).rgb;
  if(uDepthMode>0.5){ gl_FragDepth = 1.-w; o = vec4(col,1.); }
  else o = vec4(col*w, w);
}`;

const FS_NORM = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uAcc;
void main(){
  vec4 a = texture(uAcc, vec2(vUV.x, 1.-vUV.y));
  o = a.a > 1e-6 ? vec4(a.rgb/a.a, 1.) : vec4(0.04,0.04,0.05,1.);
}`;

/**
 * Fotos zu einer 360°-Kugel zusammensetzen.
 * shots: [{img (Canvas/Bitmap), R (Drehmatrix Gerät→Erde, zeilenweise)}]
 */
export async function stitchSphere(shots, hfov, vfov, W = 4096, onProgress) {
  const H = W / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const gl = c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('WebGL2 fehlt');
  const prog = (fs) => {
    const p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    return p;
  };
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const pAcc = prog(FS_ACC), pNorm = prog(FS_NORM);
  const floatOK = !!gl.getExtension('EXT_color_buffer_float');
  const acc = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, acc);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  let fbo = null;
  if (floatOK) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.HALF_FLOAT, null);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, acc, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { fbo = null; gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
  }
  gl.viewport(0, 0, W, H);
  gl.useProgram(pAcc);
  const tanH = Math.tan(hfov * D2R / 2), tanV = Math.tan(vfov * D2R / 2);
  gl.uniform2f(gl.getUniformLocation(pAcc, 'uTan'), tanH, tanV);
  gl.uniform1i(gl.getUniformLocation(pAcc, 'uImg'), 0);
  gl.uniform1f(gl.getUniformLocation(pAcc, 'uSharp'), 3.0);
  gl.uniform1f(gl.getUniformLocation(pAcc, 'uDepthMode'), fbo ? 0 : 1);
  const uRT = gl.getUniformLocation(pAcc, 'uRT');
  gl.clearColor(0, 0, 0, 0);
  if (fbo) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  } else {
    // ohne Fließkomma-Puffer: je Bildpunkt gewinnt das Foto, dessen Mitte am nächsten ist
    gl.clearColor(0.04, 0.04, 0.05, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
  }
  const img = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  for (let i = 0; i < shots.length; i++) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shots[i].img);
    // zeilenweise R ohne Transponieren übergeben = Rᵀ (Erde → Gerät)
    gl.uniformMatrix3fv(uRT, false, new Float32Array(shots[i].R));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    onProgress?.((i + 1) / shots.length);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  if (fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(pNorm);
    gl.bindTexture(gl.TEXTURE_2D, acc);
    gl.uniform1i(gl.getUniformLocation(pNorm, 'uAcc'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d').drawImage(c, 0, 0);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
}

/** Panorama-Kennung (GPano-XMP) in ein JPEG schreiben → Galerie-Apps zeigen es als 360°-Foto */
export async function addPanoXmp(blob, { fullW, fullH, cropW, cropH, cropL = 0, cropT = 0 }) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const xmp = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" '
    + 'GPano:ProjectionType="equirectangular" GPano:UsePanoramaViewer="True" GPano:CaptureSoftware="Kamera Pro" '
    + `GPano:CroppedAreaImageWidthPixels="${cropW}" GPano:CroppedAreaImageHeightPixels="${cropH}" `
    + `GPano:FullPanoWidthPixels="${fullW}" GPano:FullPanoHeightPixels="${fullH}" `
    + `GPano:CroppedAreaLeftPixels="${cropL}" GPano:CroppedAreaTopPixels="${cropT}"/>`
    + '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const enc = new TextEncoder();
  const head = enc.encode('http://ns.adobe.com/xap/1.0/\0');
  const body = enc.encode(xmp);
  const len = 2 + head.length + body.length;
  const seg = new Uint8Array(4 + head.length + body.length);
  seg.set([0xFF, 0xE1, len >> 8, len & 255]);
  seg.set(head, 4); seg.set(body, 4 + head.length);
  let pos = 2;
  if (bytes[2] === 0xFF && bytes[3] === 0xE0) pos = 4 + ((bytes[4] << 8) | bytes[5]);
  return new Blob([bytes.slice(0, pos), seg, bytes.slice(pos)], { type: 'image/jpeg' });
}
