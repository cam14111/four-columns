// Generates the PWA icons (real PNGs) with no external dependencies.
//
// Draws a small hand of Skyjo cards on the game's blue background. Run with:
//   node scripts/generate-icons.mjs
// The produced PNGs are committed, so the build itself never needs this script.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
mkdirSync(publicDir, { recursive: true });

const hex = (h) => {
  h = h.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const BG = hex("#4A90E2");
const WHITE = hex("#FFFFFF");
const PALETTE = ["#7FC241", "#F5C623", "#E24A4A", "#82B1E5", "#2F6FB3"].map(hex);
const LAYOUT = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 4];

const insideRR = (px, py, x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  const ix = Math.max(x + r, Math.min(px, x + w - r));
  const iy = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - ix;
  const dy = py - iy;
  return dx * dx + dy * dy <= r * r;
};

const renderIcon = (size, maskable) => {
  const ss = 4; // supersampling for smooth rounded corners
  const R = size * ss;
  const buf = new Uint8Array(R * R * 4);

  // Opaque blue background
  for (let i = 0; i < R * R; i++) {
    buf[i * 4] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 255;
  }

  const cols = 3;
  const rows = 4;
  const fracH = maskable ? 0.66 : 0.84; // keep content inside the safe zone
  const gridH = R * fracH;
  const gap = gridH * 0.04;
  const cellH = (gridH - gap * (rows + 1)) / rows;
  const cellW = cellH * 0.78; // Skyjo card aspect ratio
  const gridW = cellW * cols + gap * (cols + 1);
  const gx = (R - gridW) / 2;
  const gy = (R - gridH) / 2;
  const rad = cellW * 0.18;

  const fillRR = (x, y, w, h, r, color) => {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(R, Math.ceil(x + w));
    const y1 = Math.min(R, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (insideRR(px + 0.5, py + 0.5, x, y, w, h, r)) {
          const idx = (py * R + px) * 4;
          buf[idx] = color[0];
          buf[idx + 1] = color[1];
          buf[idx + 2] = color[2];
          buf[idx + 3] = 255;
        }
      }
    }
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gx + gap + (cellW + gap) * c;
      const y = gy + gap + (cellH + gap) * r;
      const color = PALETTE[LAYOUT[r * cols + c]];
      fillRR(x, y, cellW, cellH, rad, WHITE); // white card frame
      const b = cellW * 0.1;
      fillRR(x + b, y + b, cellW - 2 * b, cellH - 2 * b, rad * 0.7, color);
    }
  }

  // Box downsample to the target size
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const idx = ((y * ss + dy) * R + (x * ss + dx)) * 4;
          sr += buf[idx];
          sg += buf[idx + 1];
          sb += buf[idx + 2];
          sa += buf[idx + 3];
        }
      }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      out[o] = Math.round(sr / n);
      out[o + 1] = Math.round(sg / n);
      out[o + 2] = Math.round(sb / n);
      out[o + 3] = Math.round(sa / n);
    }
  }
  return out;
};

// --- PNG encoding ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
};

const encodePNG = (rgba, w, h) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // no filter
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const targets = [
  { file: "pwa-192x192.png", size: 192, maskable: false },
  { file: "pwa-512x512.png", size: 512, maskable: false },
  { file: "maskable-512x512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
  { file: "favicon-32x32.png", size: 32, maskable: false },
];

for (const t of targets) {
  const png = encodePNG(renderIcon(t.size, t.maskable), t.size, t.size);
  writeFileSync(resolve(publicDir, t.file), png);
  console.log(`wrote public/${t.file} (${png.length} bytes)`);
}
