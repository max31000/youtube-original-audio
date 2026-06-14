// SPDX-License-Identifier: GPL-3.0-or-later
// One-off generator for placeholder toolbar icons (icons/icon{16,48,128}.png).
// Draws a simple blue square with a white 3-bar "equalizer" glyph. Replace
// the generated PNGs with real artwork whenever it's ready — this script is
// not part of the build and isn't required afterwards.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [0x3e, 0xa6, 0xff, 0xff]; // brand blue, matches in-player button
const FG = [0xff, 0xff, 0xff, 0xff]; // white bars

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set(BG, i * 4);

  // Three vertical bars, evenly spaced, varying heights — generic "audio" glyph.
  const heights = [0.45, 0.8, 0.6];
  const barW = Math.max(1, Math.round(size * 0.16));
  const gap = Math.max(1, Math.round(size * 0.10));
  const totalW = barW * 3 + gap * 2;
  const startX = Math.round((size - totalW) / 2);
  const bottom = Math.round(size * 0.82);

  heights.forEach((h, i) => {
    const barH = Math.round(size * 0.7 * h);
    const x0 = startX + i * (barW + gap);
    const y0 = bottom - barH;
    for (let y = y0; y < bottom; y++) {
      for (let x = x0; x < x0 + barW; x++) {
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        pixels.set(FG, (y * size + x) * 4);
      }
    }
  });

  // Raw scanlines, each prefixed with filter byte 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    raw.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const size of [16, 48, 128]) {
  const file = path.join(outDir, `icon${size}.png`);
  writeFileSync(file, drawIcon(size));
  console.log('wrote', file);
}
