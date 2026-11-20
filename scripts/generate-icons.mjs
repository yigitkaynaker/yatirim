// PWA ikonlarını bağımlılık olmadan üretir (yalnızca node:zlib).
// Kullanım: npm run icons
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BG_TOP = [0x13, 0x1d, 0x35];
const BG_BOTTOM = [0x0b, 0x11, 0x20];
const ACCENT = [0x34, 0xd3, 0x99];
const ACCENT_DIM = [0x1f, 0x7a, 0x5c];

function crc32(buf) {
  let c;
  const table = (crc32.t ??= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const SS = 4; // süper örnekleme (kenar yumuşatma)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function insideRoundRect(u, v, r) {
  const cx = Math.min(Math.max(u, r), 1 - r);
  const cy = Math.min(Math.max(v, r), 1 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Yükselen üç sütun + yukarı trend çizgisi. scale: güvenli alan için içerik ölçeği. */
function design(rounded, scale) {
  const bars = [
    { x: 0.2, w: 0.14, h: 0.28 },
    { x: 0.43, w: 0.14, h: 0.45 },
    { x: 0.66, w: 0.14, h: 0.62 },
  ];
  const base = 0.8;
  const line = [[0.2, 0.52], [0.45, 0.4], [0.58, 0.46], [0.82, 0.2]];
  return (u0, v0) => {
    if (rounded && !insideRoundRect(u0, v0, 0.22)) return [0, 0, 0, 0];
    const bg = mix(BG_TOP, BG_BOTTOM, v0);
    // içerik koordinatları (merkezden ölçekli)
    const u = (u0 - 0.5) / scale + 0.5;
    const v = (v0 - 0.5) / scale + 0.5;
    for (let i = 0; i < line.length - 1; i++) {
      if (distToSegment(u, v, ...line[i], ...line[i + 1]) < 0.035) return [...ACCENT, 1];
    }
    const tip = line[line.length - 1];
    if (Math.hypot(u - tip[0], v - tip[1]) < 0.055) return [...ACCENT, 1];
    for (const b of bars) {
      if (u >= b.x && u <= b.x + b.w && v <= base && v >= base - b.h) return [...mix(ACCENT_DIM, BG_TOP, 0.15), 1];
    }
    return [...bg, 1];
  };
}

const out = (p, buf) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  console.log("yazıldı:", path.relative(ROOT, p));
};

out(path.join(ROOT, "public/icons/icon-192.png"), png(192, design(true, 1)));
out(path.join(ROOT, "public/icons/icon-512.png"), png(512, design(true, 1)));
// maskable: kare, içerik %80 güvenli alanda
out(path.join(ROOT, "public/icons/maskable-512.png"), png(512, design(false, 0.72)));
// Next dosya kuralları: favicon ve Apple dokunma ikonu
out(path.join(ROOT, "src/app/icon.png"), png(64, design(true, 1)));
out(path.join(ROOT, "src/app/apple-icon.png"), png(180, design(false, 0.85)));
