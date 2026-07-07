// Generates the PWA icons and the social (OG) image as real PNGs, with no
// external dependencies. Draws an original 4x3 hand of colourful cards on the
// app's blue background — no third-party artwork. Run with:
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
const PALETTE = ["#22C55E", "#F4C025", "#EF4444", "#0EA5E9", "#1E3A8A"].map(hex);
// 3 rows x 4 cols
const LAYOUT = [0, 1, 2, 3, 1, 0, 3, 2, 4, 2, 1, 0];

const insideRR = (px, py, x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  const ix = Math.max(x + r, Math.min(px, x + w - r));
  const iy = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - ix;
  const dy = py - iy;
  return dx * dx + dy * dy <= r * r;
};

// Renders an original 4x3 card motif centred on a (possibly rectangular) canvas.
const render = (W0, H0, frac) => {
  const ss = 4; // supersampling for smooth rounded corners
  const W = W0 * ss;
  const H = H0 * ss;
  const buf = new Uint8Array(W * H * 4);

  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 255;
  }

  const cols = 4;
  const rows = 3;
  const aspect = 0.72; // card width / height
  const gapRatio = 0.14;
  const box = Math.min(W, H) * frac;
  const wUnits = cols + (cols + 1) * gapRatio;
  const hUnits = rows / aspect + (rows + 1) * gapRatio;
  const cellW = Math.min(box / wUnits, box / hUnits);
  const gap = cellW * gapRatio;
  const cellH = cellW / aspect;
  const gridW = cols * cellW + (cols + 1) * gap;
  const gridH = rows * cellH + (rows + 1) * gap;
  const gx = (W - gridW) / 2;
  const gy = (H - gridH) / 2;
  const rad = cellW * 0.16;

  const fillRR = (x, y, w, h, r, color) => {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (insideRR(px + 0.5, py + 0.5, x, y, w, h, r)) {
          const idx = (py * W + px) * 4;
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
  const out = new Uint8Array(W0 * H0 * 4);
  for (let y = 0; y < H0; y++) {
    for (let x = 0; x < W0; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const idx = ((y * ss + dy) * W + (x * ss + dx)) * 4;
          sr += buf[idx];
          sg += buf[idx + 1];
          sb += buf[idx + 2];
          sa += buf[idx + 3];
        }
      }
      const n = ss * ss;
      const o = (y * W0 + x) * 4;
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
  { file: "pwa-192x192.png", w: 192, h: 192, frac: 0.9 },
  { file: "pwa-512x512.png", w: 512, h: 512, frac: 0.9 },
  { file: "maskable-512x512.png", w: 512, h: 512, frac: 0.66 },
  { file: "apple-touch-icon.png", w: 180, h: 180, frac: 0.9 },
  { file: "favicon-32x32.png", w: 32, h: 32, frac: 0.94 },
  { file: "og-image.png", w: 1200, h: 630, frac: 0.78 },
];

for (const t of targets) {
  const png = encodePNG(render(t.w, t.h, t.frac), t.w, t.h);
  writeFileSync(resolve(publicDir, t.file), png);
  console.log(`wrote public/${t.file} (${png.length} bytes)`);
}
