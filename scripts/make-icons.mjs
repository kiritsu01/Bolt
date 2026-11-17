// Genera le icone PNG della PWA da codice (nessuna dipendenza: solo node:zlib).
// Disegna lo stesso simbolo di public/favicon.svg: freccia chiara e tratto arancio su fondo scuro.
// Uso: npm run icons  ->  public/icons/*.png
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");

const BG = [0x12, 0x0f, 0x2e];
const FG = [0xff, 0xf6, 0xe8];
const ACCENT = [0xff, 0x5a, 0x1f];

// Forme nello spazio 32x32 del favicon.
const ARROW = [
  [4, 13.25],
  [16.1, 13.25],
  [16.1, 8.1],
  [28, 16],
  [16.1, 23.9],
  [16.1, 18.75],
  [4, 18.75],
];
const SLASH = [
  [9.1, 6.6],
  [13.6, 5.2],
  [22.7, 25.6],
  [18.2, 27],
];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * @param {number} px lato in pixel
 * @param {{ maskable?: boolean, rounded?: boolean }} opt
 *   maskable: fondo pieno e simbolo ridotto nella zona sicura (80% centrale);
 *   rounded: angoli trasparenti come il favicon.
 */
function render(px, opt = {}) {
  const SS = 4; // sotto-campioni per lato (antialiasing)
  const scale = opt.maskable ? 0.72 : 1;
  const off = (32 - 32 * scale) / 2;
  const rgba = Buffer.alloc(px * px * 4);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / px) * 32;
          const v = ((y + (sy + 0.5) / SS) / px) * 32;
          if (opt.rounded && !inRoundRect(u, v, 32, 7)) continue;
          const lu = (u - off) / scale;
          const lv = (v - off) / scale;
          let c = BG;
          if (inPoly(lu, lv, SLASH)) c = ACCENT;
          else if (inPoly(lu, lv, ARROW)) c = FG;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * px + x) * 4;
      const cover = a / 255;
      rgba[i] = cover ? Math.round(r / cover) : 0;
      rgba[i + 1] = cover ? Math.round(g / cover) : 0;
      rgba[i + 2] = cover ? Math.round(b / cover) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return png(px, px, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const files = {
  "icon-192.png": render(192, { rounded: true }),
  "icon-512.png": render(512, { rounded: true }),
  "maskable-512.png": render(512, { maskable: true }),
  "apple-touch-icon.png": render(180, {}),
};
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(resolve(OUT, name), buf);
  console.log(`public/icons/${name}  ${buf.length} byte`);
}
