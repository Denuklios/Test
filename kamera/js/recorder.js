// Video-Aufnahme.
// 1) LiveRecorder: normales Video mit Ton (MediaRecorder, nimmt das bearbeitete Bild auf)
// 2) FrameEncoder: Bild für Bild mit frei gewählten Zeitstempeln → echte Zeitlupe / Zeitraffer als MP4
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';

export function pickMime() {
  const list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

export class LiveRecorder {
  constructor(canvas, fps, audioStream) {
    const vs = canvas.captureStream(fps);
    const tracks = [...vs.getVideoTracks()];
    if (audioStream) tracks.push(...audioStream.getAudioTracks());
    this.stream = new MediaStream(tracks);
    this.mime = pickMime();
    const bps = canvas.width * canvas.height > 2.5e6 ? 24e6 : 12e6;
    this.rec = new MediaRecorder(this.stream, { mimeType: this.mime || undefined, videoBitsPerSecond: bps, audioBitsPerSecond: 160000 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
  }
  start() { this.rec.start(1000); this.t0 = performance.now(); }
  pause() { if (this.rec.state === 'recording') this.rec.pause(); }
  resume() { if (this.rec.state === 'paused') this.rec.resume(); }
  stop() {
    return new Promise((res) => {
      this.rec.onstop = () => {
        this.stream.getVideoTracks().forEach((t) => t.stop());
        const type = (this.mime || 'video/webm').split(';')[0];
        res(new Blob(this.chunks, { type }));
      };
      this.rec.stop();
    });
  }
}

export const canEncodeFrames = () => typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';

export class FrameEncoder {
  /** width/height gerade Zahlen; fps = Abspiel-Bildrate der Datei */
  static async create(width, height, fps = 30) {
    width = Math.round(width / 2) * 2; height = Math.round(height / 2) * 2;
    const codecs = ['avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42E01F'];
    let config = null;
    for (const codec of codecs) {
      const c = { codec, width, height, bitrate: width * height > 2.5e6 ? 30e6 : 14e6, framerate: fps, avc: { format: 'avc' } };
      try {
        const r = await VideoEncoder.isConfigSupported(c);
        if (r.supported) { config = c; break; }
      } catch { /* weiter */ }
    }
    if (!config) throw new Error('Video-Kodierung wird nicht unterstützt');
    return new FrameEncoder(config, fps);
  }
  constructor(config, fps) {
    this.fps = fps;
    this.w = config.width; this.h = config.height;
    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: this.w, height: this.h, frameRate: fps },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    this.error = null;
    this.enc = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => { this.error = e; },
    });
    this.enc.configure(config);
    this.count = 0;
    // Zwischenbild in Zielgröße (falls Quelle andere Größe hat)
    this.c = document.createElement('canvas');
    this.c.width = this.w; this.c.height = this.h;
    this.ctx = this.c.getContext('2d');
  }
  get busy() { return this.enc.encodeQueueSize > 6; }
  /** Bild hinzufügen; timeUs = Zeitpunkt in der fertigen Datei (Mikrosekunden) */
  add(source, timeUs, alpha = 1) {
    if (this.error) throw this.error;
    if (alpha < 1) {
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(source, 0, 0, this.w, this.h);
      this.ctx.globalAlpha = 1;
    } else {
      this.ctx.drawImage(source, 0, 0, this.w, this.h);
    }
    const frame = new VideoFrame(this.c, { timestamp: Math.round(timeUs), duration: Math.round(1e6 / this.fps) });
    this.enc.encode(frame, { keyFrame: this.count % (this.fps * 2) === 0 });
    frame.close();
    this.count++;
  }
  /** Ohne Neuzeichnen: aktuelles Zwischenbild noch einmal (für Überblendungen) */
  get canvas() { return this.c; }
  async finish() {
    await this.enc.flush();
    this.enc.close();
    this.muxer.finalize();
    return new Blob([this.muxer.target.buffer], { type: 'video/mp4' });
  }
  close() { try { this.enc.close(); } catch { /* egal */ } }
}

/** Ersatz ohne WebCodecs: gesammelte Bilder in Echtzeit abspielen und aufnehmen */
export async function encodeFallback(frames, w, h, fps, onProgress) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 12e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  for (let i = 0; i < frames.length; i++) {
    const bmp = await createImageBitmap(frames[i]);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    track.requestFrame?.();
    onProgress?.(i / frames.length);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  return new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
}
