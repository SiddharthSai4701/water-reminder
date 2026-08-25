import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Signed distance to a droplet: a circle below, tapering to a point above. */
/**
 * @param fill  How much of the canvas the droplet spans. App icons want
 *              margin (macOS and Windows add their own framing); a menu-bar
 *              glyph wants to fill its box or it reads small and timid next
 *              to the system icons.
 */
function dropletAlpha(x, y, size, fill = 1) {
  const nx = ((x + 0.5) / size - 0.5) / fill;
  const ny = ((y + 0.5) / size - 0.5) / fill;

  const R = 0.28; // circle radius
  const cy = 0.06; // circle centre y
  const topY = -0.36; // apex y, above the circle

  const circle = Math.hypot(nx, ny - cy) - R;

  // Cone: bounded taper from the apex point down to the circle's width,
  // so the two pieces meet flush instead of the cone running unbounded.
  let cone;
  if (ny <= topY) {
    cone = Math.hypot(nx, topY - ny);
  } else if (ny >= cy) {
    cone = 1; // below the taper zone; the circle alone decides here
  } else {
    const t = (ny - topY) / (cy - topY); // 0 at apex .. 1 at the circle centre
    cone = Math.abs(nx) - R * t;
  }

  const d = Math.min(circle, cone);
  // Anti-alias band scaled to the pixel grid. A fixed band in normalized
  // units is under a pixel at 16px and about 40px at 1024px, which reads as
  // a glow rather than a clean edge. Divided by fill so the band stays one
  // pixel wide after the coordinate scaling above.
  const aa = 1.2 / size / fill;
  if (d <= -aa) return 255;
  if (d >= aa) return 0;
  return Math.round(255 * (1 - (d + aa) / (2 * aa)));
}

function makePng(size, fill = 1) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const a = dropletAlpha(x, y, size, fill);
      raw[p++] = 0x4f;
      raw[p++] = 0xc3;
      raw[p++] = 0xf7;
      raw[p++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });

// Menu-bar and tray glyphs. The @2x/@3x siblings are what Electron picks up
// automatically from the base path; without them a Retina menu bar upscales
// the 16px bitmap and renders it blurry. TRAY_FILL spans more of the canvas
// so the droplet carries the same visual weight as the system icons beside
// it — at fill 1 it reads small and timid in a menu bar.
const TRAY_FILL = 1.32;
const TRAY = [
  ['icon-16.png', 16],
  ['icon-16@2x.png', 32],
  ['icon-16@3x.png', 48],
  ['icon-32.png', 32],
  ['icon-32@2x.png', 64],
];
for (const [name, size] of TRAY) {
  const file = join(OUT_DIR, name);
  writeFileSync(file, makePng(size, TRAY_FILL));
  console.log(`wrote ${file}`);
}

// App icons keep their margin — macOS and Windows frame these themselves.
for (const size of [256, 512, 1024]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, makePng(size));
  console.log(`wrote ${file}`);
}
