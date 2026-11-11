// Minimaler EXIF-Leser für JPEG: Aufnahmedatum, Kamera und GPS-Position.

export async function readExif(file) {
  try {
    const head = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (head.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 < head.byteLength) {
      const marker = head.getUint16(off);
      const len = head.getUint16(off + 2);
      if (marker === 0xffe1 && head.getUint32(off + 4) === 0x45786966) return parseTiff(head, off + 10);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      off += 2 + len;
    }
  } catch { /* defekte Datei – ohne EXIF weitermachen */ }
  return {};
}

function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, le);
  const u32 = (o) => v.getUint32(start + o, le);
  const out = {};

  const readIfd = (ifdOff) => {
    const tags = {};
    if (ifdOff <= 0 || start + ifdOff + 2 > v.byteLength) return tags;
    const n = u16(ifdOff);
    for (let i = 0; i < n; i++) {
      const e = ifdOff + 2 + i * 12;
      if (start + e + 12 > v.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
      const size = (sizes[type] || 1) * count;
      const valOff = size > 4 ? u32(e + 8) : e + 8;
      if (start + valOff + size > v.byteLength) continue;
      if (type === 2) {
        let s = '';
        for (let k = 0; k < count - 1; k++) s += String.fromCharCode(v.getUint8(start + valOff + k));
        tags[tag] = s.trim();
      } else if (type === 3) tags[tag] = u16(valOff);
      else if (type === 4) tags[tag] = u32(valOff);
      else if (type === 5) {
        const arr = [];
        for (let k = 0; k < count; k++) arr.push(u32(valOff + k * 8) / (u32(valOff + k * 8 + 4) || 1));
        tags[tag] = arr;
      }
    }
    return tags;
  };

  const ifd0 = readIfd(u32(4));
  if (ifd0[0x010f]) out.make = ifd0[0x010f];
  if (ifd0[0x0110]) out.model = ifd0[0x0110];
  let dateStr = ifd0[0x0132];
  if (ifd0[0x8769]) {
    const exif = readIfd(ifd0[0x8769]);
    dateStr = exif[0x9003] || exif[0x9004] || dateStr;
  }
  if (dateStr) {
    const m = dateStr.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m && m[1] !== '0000') {
      const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      if (!isNaN(d)) out.date = d.getTime();
    }
  }
  if (ifd0[0x8825]) {
    const g = readIfd(ifd0[0x8825]);
    const dms = (a) => (Array.isArray(a) ? a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600 : NaN);
    let lat = dms(g[2]), lon = dms(g[4]);
    if (g[1] === 'S') lat = -lat;
    if (g[3] === 'W') lon = -lon;
    if (isFinite(lat) && isFinite(lon) && (lat || lon)) out.gps = [lat, lon];
  }
  return out;
}
