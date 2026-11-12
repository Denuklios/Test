// Bild-Prozessor auf der Grafikkarte (WebGL): Live-Effekte, Live-Retusche, Profi-Regler,
// Ausschnitt/Zoom (für "Punkt fixieren") und Hilfsanzeigen (Fokus-Peaking, Zebra).

export const EFFECTS = [
  { id: 0, name: 'Normal' },
  { id: 1, name: 'Schwarzweiß', p: ['Kontrast', 'Körnung'], d: [0.4, 0.2] },
  { id: 2, name: 'Sepia', p: ['Stärke', 'Wärme'], d: [0.9, 0.5] },
  { id: 3, name: 'Vintage', p: ['Stärke', 'Verblassen'], d: [0.8, 0.5] },
  { id: 4, name: 'Kino', p: ['Stärke', 'Kontrast'], d: [0.8, 0.5] },
  { id: 5, name: 'Comic', p: ['Linien', 'Farbstufen'], d: [0.6, 0.4] },
  { id: 6, name: 'Neon', p: ['Leuchten', 'Farbe'], d: [0.7, 0.5] },
  { id: 7, name: 'Bleistift', p: ['Stärke', 'Papier'], d: [0.7, 0.3] },
  { id: 8, name: 'Pixel', p: ['Größe'], d: [0.5] },
  { id: 9, name: 'Glitch', p: ['Stärke', 'Tempo'], d: [0.5, 0.5] },
  { id: 10, name: 'RGB-Versatz', p: ['Abstand', 'Winkel'], d: [0.4, 0] },
  { id: 11, name: 'Spiegel', p: ['Achse', 'Position'], d: [0, 0.5] },
  { id: 12, name: 'Kaleidoskop', p: ['Segmente', 'Drehung'], d: [0.3, 0] },
  { id: 13, name: 'Fischauge', p: ['Stärke', 'Größe'], d: [0.5, 0.7] },
  { id: 14, name: 'Strudel', p: ['Stärke', 'Größe'], d: [0.5, 0.6] },
  { id: 15, name: 'Wärmebild', p: ['Stärke'], d: [1] },
  { id: 16, name: 'Nachtsicht', p: ['Helligkeit', 'Rauschen'], d: [0.6, 0.4] },
  { id: 17, name: 'Negativ', p: ['Stärke'], d: [1] },
  { id: 18, name: 'Color-Key', p: ['Farbe', 'Toleranz'], d: [0, 0.4] },
  { id: 19, name: 'Miniatur', p: ['Position', 'Breite'], d: [0.5, 0.4] },
  { id: 20, name: 'Pop-Art', p: ['Farbstufen', '4 Kacheln'], d: [0.4, 1] },
  { id: 21, name: 'Raster', p: ['Größe', 'Winkel'], d: [0.4, 0.25] },
  { id: 22, name: 'Ölbild', p: ['Pinsel'], d: [0.5] },
  { id: 23, name: 'Traum', p: ['Leuchten', 'Weichheit'], d: [0.6, 0.5] },
  { id: 24, name: 'Fokus-Kreis', p: ['Größe', 'Unschärfe'], d: [0.4, 0.7] },
  { id: 25, name: 'Regenbogen', p: ['Stärke', 'Tempo'], d: [0.5, 0.3] },
];

const VS = `
attribute vec2 aPos;
varying vec2 vUV;
void main(){ vUV = vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position = vec4(aPos,0.,1.); }`;

const FS = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uSize;      // Quelle in Pixeln
uniform vec2 uOut;       // Ausgabe in Pixeln
uniform vec2 uCenter;    // Ausschnitt-Mitte (Quelle, 0..1)
uniform vec2 uSpan;      // Ausschnitt-Größe (Quelle, 0..1; negativ = gespiegelt)
uniform float uScale;    // Pixel-Maßstab (Quelle / 1080)
uniform float uTime;
uniform int uEffect;
uniform float uP1, uP2;
uniform float uExposure, uContrast, uSaturation, uTemp, uTint, uShadows, uHighlights, uSharpen, uVignette, uClarity;
uniform vec3 uGain;      // Auto-Weißabgleich
uniform vec2 uLevels;    // Auto-Tonwert (schwarz, weiß)
uniform float uSmooth, uSkinLight, uEyes;
uniform float uPeaking, uZebra;
uniform float uRot;      // Vierteldrehungen (Querformat)

float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
vec3 T(vec2 s){ return texture2D(uTex, clamp(s, vec2(0.0005), vec2(0.9995))).rgb; }
vec2 rotp(vec2 p){
  if(uRot>0.5 && uRot<1.5) return vec2(1.-p.y, p.x);
  if(uRot>1.5 && uRot<2.5) return 1.-p;
  if(uRot>2.5) return vec2(p.y, 1.-p.x);
  return p;
}
vec2 toSrc(vec2 p){ return uCenter + (rotp(p)-0.5)*uSpan; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }

vec3 hue2rgb(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0., -1./3., 2./3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 blur(vec2 s, float r){
  vec2 px = 1./uSize;
  vec3 sum = T(s); float n = 1.;
  for(int i=0;i<16;i++){
    float fi = float(i);
    float a = fi*2.39996;
    float rr = r*sqrt((fi+0.5)/16.);
    sum += T(s + vec2(cos(a),sin(a))*rr*px); n += 1.;
  }
  return sum/n;
}

float edge(vec2 s, float st){
  vec2 px = st/uSize;
  float tl=lum(T(s+vec2(-px.x,-px.y))), t=lum(T(s+vec2(0.,-px.y))), tr=lum(T(s+vec2(px.x,-px.y)));
  float l=lum(T(s+vec2(-px.x,0.))), r=lum(T(s+vec2(px.x,0.)));
  float bl=lum(T(s+vec2(-px.x,px.y))), b=lum(T(s+vec2(0.,px.y))), br=lum(T(s+vec2(px.x,px.y)));
  float gx = -tl-2.*l-bl+tr+2.*r+br;
  float gy = -tl-2.*t-tr+bl+2.*b+br;
  return length(vec2(gx,gy));
}

float skin(vec3 c){
  float y = lum(c);
  float cb = 0.5 - 0.168736*c.r - 0.331264*c.g + 0.5*c.b;
  float cr = 0.5 + 0.5*c.r - 0.418688*c.g - 0.081312*c.b;
  float m = smoothstep(0.28,0.33,cb)*(1.-smoothstep(0.49,0.53,cb))*smoothstep(0.51,0.54,cr)*(1.-smoothstep(0.66,0.70,cr));
  return m*smoothstep(0.12,0.25,y);
}

vec2 geo(vec2 p){
  float a = uOut.x/uOut.y;
  if(uEffect==8){
    float n = mix(180., 14., uP1);
    vec2 cells = vec2(n, n/a);
    p = (floor(p*cells)+0.5)/cells;
  } else if(uEffect==11){
    float m = mix(0.2,0.8,uP2);
    if(uP1<0.5){ if(p.x>m) p.x = 2.*m-p.x; } else { if(p.y>m) p.y = 2.*m-p.y; }
  } else if(uEffect==12){
    vec2 q = (p-0.5)*vec2(a,1.);
    float r = length(q); float ang = atan(q.y,q.x) + uP2*6.2832 + uTime*0.1;
    float seg = 6.2832/floor(mix(3.,16.,uP1));
    ang = mod(ang, seg); ang = abs(ang - seg*0.5);
    q = r*vec2(cos(ang),sin(ang));
    p = q/vec2(a,1.)+0.5;
  } else if(uEffect==13){
    vec2 q=(p-0.5)*vec2(a,1.); float r=length(q); float R=mix(0.25,0.9,uP2);
    if(r<R && r>0.0001){ float k=mix(0.2,1.6,uP1); q = q/r*pow(r/R,1.+k)*R; }
    p=q/vec2(a,1.)+0.5;
  } else if(uEffect==14){
    vec2 q=(p-0.5)*vec2(a,1.); float r=length(q); float R=mix(0.15,0.8,uP2);
    if(r<R){ float t=(R-r)/R; float ang=t*t*mix(1.,12.,uP1); float sn=sin(ang), cs=cos(ang); q=vec2(cs*q.x-sn*q.y, sn*q.x+cs*q.y); }
    p=q/vec2(a,1.)+0.5;
  } else if(uEffect==9){
    float tm = floor(uTime*mix(2.,24.,uP2));
    float band = floor(p.y*mix(8.,50.,hash(vec2(tm,1.))));
    float rnd = hash(vec2(band, tm));
    if(rnd > 1.-uP1*0.45) p.x += (hash(vec2(band, tm+3.))-0.5)*0.25*uP1;
  } else if(uEffect==20 && uP2>0.5){
    p = fract(p*2.);
  }
  return p;
}

void main(){
  vec2 p = geo(vUV);
  vec2 s = toSrc(p);
  vec2 px = 1./uSize;
  vec3 c = T(s);

  if(uEffect==10){ float an=uP2*6.2832; vec2 o=vec2(cos(an),sin(an))*uP1*24.*uScale*px; c.r=T(s+o).r; c.b=T(s-o).b; }
  if(uEffect==9 && uP1>0.){ vec2 o=vec2(10.*uP1*uScale*px.x*(0.5+hash(vec2(floor(uTime*10.),2.))),0.); c.r=T(s+o).r; c.b=T(s-o).b; }

  // Live-Retusche: Haut glätten (kantenerhaltend) und aufhellen, Augen/Details schärfen
  float sk = 0.;
  if(uSmooth>0. || uSkinLight>0. || uEyes>0.){
    sk = skin(c);
    if(uSmooth>0. && sk>0.01){
      vec3 sum = c; float wsum = 1.;
      for(int i=0;i<16;i++){
        float fi=float(i); float a=fi*2.39996; float rr=(2.+10.*sqrt((fi+0.5)/16.))*uScale;
        vec3 q = T(s+vec2(cos(a),sin(a))*rr*px);
        float w = exp(-dot(q-c,q-c)*120.);
        sum += q*w; wsum += w;
      }
      c = mix(c, sum/wsum, clamp(uSmooth*sk*1.15,0.,1.));
    }
    if(uSkinLight>0.) c = mix(c, c + (1.-c)*0.25, uSkinLight*sk);
    if(uEyes>0.){
      vec3 b = (T(s+vec2(px.x,0.)*1.5*uScale)+T(s-vec2(px.x,0.)*1.5*uScale)+T(s+vec2(0.,px.y)*1.5*uScale)+T(s-vec2(0.,px.y)*1.5*uScale))*0.25;
      c += (c-b)*uEyes*1.6*(1.-sk);
    }
  }
  if(uSharpen>0.){
    vec3 b = (T(s+vec2(px.x,0.)*uScale)+T(s-vec2(px.x,0.)*uScale)+T(s+vec2(0.,px.y)*uScale)+T(s-vec2(0.,px.y)*uScale))*0.25;
    c += (c-b)*uSharpen*2.;
  }
  if(uClarity!=0.){
    vec3 b = blur(s, 14.*uScale);
    float d = lum(c)-lum(b);
    c += d*uClarity*1.2;
  }

  // Effekte, die Unschärfe brauchen
  if(uEffect==19){
    float d = abs(vUV.y-uP1); float w = mix(0.05,0.3,uP2);
    float amt = smoothstep(w, w+0.25, d);
    if(amt>0.) c = mix(c, blur(s, 18.*uScale*amt), amt);
  } else if(uEffect==24){
    vec2 q=(vUV-0.5)*vec2(uOut.x/uOut.y,1.); float R=mix(0.1,0.5,uP1);
    float amt = smoothstep(R, R+0.15, length(q));
    if(amt>0.) c = mix(c, blur(s, 26.*uScale*uP2*amt+1.), amt);
  } else if(uEffect==23){
    vec3 b = blur(s, mix(8.,30.,uP2)*uScale);
    c = 1.-(1.-c)*(1.-b*uP1*0.8);
  } else if(uEffect==22){
    // Kuwahara (Ölbild)
    float r = floor(mix(2.,5.,uP1));
    vec3 m0=vec3(0.),m1=vec3(0.),m2=vec3(0.),m3=vec3(0.),s0=vec3(0.),s1=vec3(0.),s2=vec3(0.),s3=vec3(0.);
    for(int j=0;j<=5;j++){ for(int i=0;i<=5;i++){
      if(float(i)>r || float(j)>r) continue;
      vec2 o = vec2(float(i),float(j))*px*uScale;
      vec3 a=T(s+vec2(-o.x,-o.y)); m0+=a; s0+=a*a;
      a=T(s+vec2(o.x,-o.y)); m1+=a; s1+=a*a;
      a=T(s+vec2(o.x,o.y)); m2+=a; s2+=a*a;
      a=T(s+vec2(-o.x,o.y)); m3+=a; s3+=a*a;
    }}
    float n=(r+1.)*(r+1.);
    m0/=n; m1/=n; m2/=n; m3/=n;
    float v0=dot(abs(s0/n-m0*m0),vec3(1.)), v1=dot(abs(s1/n-m1*m1),vec3(1.)), v2=dot(abs(s2/n-m2*m2),vec3(1.)), v3=dot(abs(s3/n-m3*m3),vec3(1.));
    float mn=v0; c=m0;
    if(v1<mn){mn=v1;c=m1;} if(v2<mn){mn=v2;c=m2;} if(v3<mn){mn=v3;c=m3;}
  }

  // Grundregler
  c *= uGain;
  c = (c - uLevels.x)/max(uLevels.y-uLevels.x, 0.05);
  c *= exp2(uExposure);
  c += vec3(uTemp*0.08, uTint*0.06, -uTemp*0.08) * (0.5+0.5*c);
  float L = lum(c);
  c += uShadows*0.35*(1.-smoothstep(0.,0.5,L))*(0.6-L*0.5);
  c -= uHighlights*0.35*smoothstep(0.5,1.,L)*(L-0.3);
  c = (c-0.5)*(1.+uContrast)+0.5;
  L = lum(c);
  c = mix(vec3(L), c, 1.+uSaturation);

  // Farb-Effekte
  if(uEffect==1){
    float l = lum(c); l = (l-0.5)*(1.+uP1*1.5)+0.5;
    l += (hash(vUV*uOut+uTime)-0.5)*uP2*0.25;
    c = vec3(l);
  } else if(uEffect==2){
    float l = lum(c);
    vec3 sep = vec3(l*1.07+0.05*uP2, l*0.88, l*0.66-0.04*uP2);
    c = mix(c, sep, uP1);
  } else if(uEffect==3){
    vec3 v = c; v = mix(vec3(lum(v)), v, 0.65);
    v = v*vec3(1.08,1.0,0.86) + vec3(0.04,0.02,0.0);
    v = mix(v, vec3(0.12,0.1,0.14)+v*0.85, uP2*0.8);
    c = mix(c, v, uP1);
  } else if(uEffect==4){
    float l = lum(c);
    vec3 v = mix(vec3(0.0,0.32,0.38), vec3(1.0,0.62,0.32), smoothstep(0.05,0.95,l));
    v = mix(c, v*l*1.6, 0.45);
    v = (v-0.5)*(1.+uP2*0.6)+0.5;
    c = mix(c, v, uP1);
  } else if(uEffect==5){
    float lv = floor(mix(3.,10.,uP2));
    vec3 q = floor(c*lv+0.5)/lv;
    float e = edge(s, 1.5*uScale);
    c = q*(1.-smoothstep(0.25,0.6,e*uP1*2.));
  } else if(uEffect==6){
    float e = edge(s, 1.2*uScale);
    vec3 col = hue2rgb(fract(uP2 + lum(c)*0.3 + uTime*0.03));
    c = c*0.08 + col*smoothstep(0.08,0.5,e)*(0.6+uP1*1.4);
  } else if(uEffect==7){
    float e = edge(s, 1.3*uScale);
    float l = 1.-smoothstep(0.05,0.6,e*(0.5+uP1*1.5));
    float paper = 0.92 + (hash(floor(vUV*uOut/2.))-0.5)*0.08*uP2;
    c = vec3(l*paper) * mix(vec3(1.), vec3(1.,0.97,0.9), uP2);
  } else if(uEffect==15){
    float l = lum(c);
    vec3 th = l<0.25 ? mix(vec3(0.,0.,0.3), vec3(0.4,0.,0.7), l/0.25)
            : l<0.5 ? mix(vec3(0.4,0.,0.7), vec3(1.,0.1,0.1), (l-0.25)/0.25)
            : l<0.75 ? mix(vec3(1.,0.1,0.1), vec3(1.,0.85,0.), (l-0.5)/0.25)
            : mix(vec3(1.,0.85,0.), vec3(1.), (l-0.75)/0.25);
    c = mix(c, th, uP1);
  } else if(uEffect==16){
    float l = lum(c)*(1.+uP1*2.5);
    l += (hash(vUV*uOut+fract(uTime*7.))-0.5)*uP2*0.5;
    l *= 0.85+0.15*sin(vUV.y*uOut.y*1.5);
    vec2 q=(vUV-0.5)*vec2(uOut.x/uOut.y,1.);
    c = vec3(0.1,1.,0.2)*l*(1.-smoothstep(0.35,0.7,length(q)));
  } else if(uEffect==17){
    c = mix(c, 1.-c, uP1);
  } else if(uEffect==18){
    vec3 h = rgb2hsv(c);
    float d = abs(h.x-uP1); d = min(d, 1.-d);
    float keep = (1.-smoothstep(uP2*0.15, uP2*0.15+0.05, d))*smoothstep(0.12,0.25,h.y);
    c = mix(vec3(lum(c)), c, keep);
  } else if(uEffect==19){
    c = mix(vec3(lum(c)), c, 1.35); c = (c-0.5)*1.1+0.5;
  } else if(uEffect==20){
    float lv = floor(mix(2.,6.,uP1));
    float l = floor(lum(c)*lv+0.5)/lv;
    vec2 tile = uP2>0.5 ? floor(vUV*2.) : vec2(0.);
    float k = tile.x + tile.y*2.;
    vec3 a = hue2rgb(fract(0.9 + k*0.27)), b = hue2rgb(fract(0.45 + k*0.31));
    c = mix(a*0.25, b, l);
  } else if(uEffect==21){
    float g = mix(5.,22.,uP1)*uScale;
    float an = uP2*3.1416;
    vec2 q = vUV*uOut; q = vec2(cos(an)*q.x-sin(an)*q.y, sin(an)*q.x+cos(an)*q.y);
    vec2 cell = fract(q/g)-0.5;
    float l = lum(c);
    float r = sqrt(1.-l)*0.7;
    float dot1 = 1.-smoothstep(r-0.06, r+0.06, length(cell));
    c = mix(vec3(0.98,0.96,0.9), mix(vec3(0.1), c*0.6, 0.5), dot1);
  } else if(uEffect==25){
    vec3 rb = hue2rgb(fract(vUV.x*0.6+vUV.y*0.4+uTime*uP2*0.5));
    c = mix(c, c*0.5+rb*lum(c)*1.2, uP1);
  }

  if(uVignette!=0.){
    vec2 q=(vUV-0.5)*vec2(uOut.x/uOut.y,1.)*1.4;
    c *= 1.-uVignette*smoothstep(0.3,1.1,length(q));
  }
  c = clamp(c,0.,1.);

  // Hilfsanzeigen (nur Vorschau)
  if(uPeaking>0.){
    float e = edge(s, 1.*uScale);
    if(e>0.35) c = mix(c, vec3(1.,0.15,0.15), 0.85);
  }
  if(uZebra>0.){
    if(lum(c)>0.96 && mod(floor((gl_FragCoord.x+gl_FragCoord.y)/6.),2.)<1.) c = vec3(0.);
  }
  gl_FragColor = vec4(c,1.);
}`;

export const DEFAULT_ADJUST = {
  exposure: 0, contrast: 0, saturation: 0, temp: 0, tint: 0, shadows: 0, highlights: 0,
  sharpen: 0, vignette: 0, clarity: 0, smooth: 0, skinLight: 0, eyes: 0,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL nicht verfügbar');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.u[info.name] = gl.getUniformLocation(prog, info.name);
    }
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.t0 = performance.now();
  }

  /**
   * Zeichnet eine Quelle (Video, Bild, Canvas) mit allen Einstellungen.
   * st: { adjust, effect, p1, p2, auto:{gain,levels}, view:{cx,cy,zoom}, mirror, peaking, zebra }
   */
  render(src, srcW, srcH, st, outW = srcW, outH = srcH) {
    const gl = this.gl;
    if (!srcW || !srcH) return;
    outW = Math.max(2, Math.round(outW / 2) * 2);
    outH = Math.max(2, Math.round(outH / 2) * 2);
    if (this.canvas.width !== outW || this.canvas.height !== outH) {
      this.canvas.width = outW;
      this.canvas.height = outH;
    }
    gl.viewport(0, 0, outW, outH);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) {
      return;
    }
    const u = this.u;
    const a = { ...DEFAULT_ADJUST, ...(st.adjust || {}) };
    const view = st.view || { cx: 0.5, cy: 0.5, zoom: 1 };
    // Ausgabe-Seitenverhältnis kann vom Quellbild abweichen (z. B. 1:1) → Ausschnitt anpassen
    const rot = st.rot || 0;
    const srcAR = srcW / srcH, outAR = rot % 2 ? outH / outW : outW / outH;
    let spanX = 1, spanY = 1;
    if (outAR > srcAR) spanY = srcAR / outAR; else spanX = outAR / srcAR;
    spanX /= view.zoom; spanY /= view.zoom;
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uSize, srcW, srcH);
    gl.uniform2f(u.uOut, outW, outH);
    gl.uniform2f(u.uCenter, view.cx, view.cy);
    gl.uniform2f(u.uSpan, st.mirror ? -spanX : spanX, spanY);
    gl.uniform1f(u.uRot, rot);
    this.last = { cx: view.cx, cy: view.cy, sx: st.mirror ? -spanX : spanX, sy: spanY, rot, outW, outH, srcW, srcH };
    gl.uniform1f(u.uScale, Math.min(srcW, srcH) / 1080);
    gl.uniform1f(u.uTime, (performance.now() - this.t0) / 1000);
    gl.uniform1i(u.uEffect, st.effect || 0);
    gl.uniform1f(u.uP1, st.p1 ?? 0.5);
    gl.uniform1f(u.uP2, st.p2 ?? 0.5);
    gl.uniform1f(u.uExposure, a.exposure);
    gl.uniform1f(u.uContrast, a.contrast);
    gl.uniform1f(u.uSaturation, a.saturation);
    gl.uniform1f(u.uTemp, a.temp);
    gl.uniform1f(u.uTint, a.tint);
    gl.uniform1f(u.uShadows, a.shadows);
    gl.uniform1f(u.uHighlights, a.highlights);
    gl.uniform1f(u.uSharpen, a.sharpen);
    gl.uniform1f(u.uVignette, a.vignette);
    gl.uniform1f(u.uClarity, a.clarity);
    gl.uniform1f(u.uSmooth, a.smooth);
    gl.uniform1f(u.uSkinLight, a.skinLight);
    gl.uniform1f(u.uEyes, a.eyes);
    const g = st.auto?.gain || [1, 1, 1];
    const lv = st.auto?.levels || [0, 1];
    gl.uniform3f(u.uGain, g[0], g[1], g[2]);
    gl.uniform2f(u.uLevels, lv[0], lv[1]);
    gl.uniform1f(u.uPeaking, st.peaking ? 1 : 0);
    gl.uniform1f(u.uZebra, st.zebra ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** Ein Bild (Bitmap/Canvas) einmalig mit Einstellungen in ein neues Canvas rendern */
let offRenderer = null;
export function renderToCanvas(src, w, h, st, outW = w, outH = h) {
  if (!offRenderer) offRenderer = new Renderer(document.createElement('canvas'));
  const max = offRenderer.maxTex || 4096;
  if (Math.max(w, h) > max) {
    // Zu groß für die Grafikkarte: verkleinern
    const k = max / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    src = c; w = c.width; h = c.height; outW = Math.round(outW * k); outH = Math.round(outH * k);
  }
  offRenderer.render(src, w, h, st, outW, outH);
  const out = document.createElement('canvas');
  out.width = offRenderer.canvas.width;
  out.height = offRenderer.canvas.height;
  out.getContext('2d').drawImage(offRenderer.canvas, 0, 0);
  return out;
}
