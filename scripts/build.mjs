// SPDX-License-Identifier: GPL-3.0-or-later
// Builds dist/<name>-vX.Y.Z.zip containing only the extension's runtime files
// (manifest.json, scripts, popup, icons) — no README/docs/CI/PLAN.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;

const FILES = [
  'manifest.json',
  'inject.js',
  'content.js',
  'popup.html',
  'popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

const distDir = path.join(root, 'dist');
mkdirSync(distDir, { recursive: true });

const outFile = path.join(distDir, `youtube-original-audio-v${version}.zip`);

// Minimal zip writer — keeps this script dependency-free.
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, date: dosDate };
}

const now = new Date();
const { time, date } = dosDateTime(now);

const localParts = [];
const centralParts = [];
let offset = 0;

for (const rel of FILES) {
  const data = readFileSync(path.join(root, rel));
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = compressed.length < data.length;
  const stored = useDeflate ? compressed : data;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(data);
  const nameBuf = Buffer.from(rel.replace(/\\/g, '/'), 'utf8');

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);   // version needed
  localHeader.writeUInt16LE(0, 6);    // flags
  localHeader.writeUInt16LE(method, 8);
  localHeader.writeUInt16LE(time, 10);
  localHeader.writeUInt16LE(date, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(stored.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);

  localParts.push(localHeader, nameBuf, stored);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);  // version made by
  centralHeader.writeUInt16LE(20, 6);  // version needed
  centralHeader.writeUInt16LE(0, 8);   // flags
  centralHeader.writeUInt16LE(method, 10);
  centralHeader.writeUInt16LE(time, 12);
  centralHeader.writeUInt16LE(date, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(stored.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra len
  centralHeader.writeUInt16LE(0, 32); // comment len
  centralHeader.writeUInt16LE(0, 34); // disk number
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  centralHeader.writeUInt32LE(0, 38); // external attrs
  centralHeader.writeUInt32LE(offset, 42);

  centralParts.push(centralHeader, nameBuf);

  offset += localHeader.length + nameBuf.length + stored.length;
}

const centralStart = offset;
const centralSize = centralParts.reduce((n, b) => n + b.length, 0);

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(FILES.length, 8);
eocd.writeUInt16LE(FILES.length, 10);
eocd.writeUInt32LE(centralSize, 12);
eocd.writeUInt32LE(centralStart, 16);
eocd.writeUInt16LE(0, 20);

writeFileSync(outFile, Buffer.concat([...localParts, ...centralParts, eocd]));
console.log('wrote', outFile);
