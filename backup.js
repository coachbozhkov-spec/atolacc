// Резервни копия на DATA_DIR:
//  - zipData(): целият DATA_DIR (без папка backups) като zip файл за изтегляне от админ панела;
//  - startDaily(): всеки ден копира JSON файловете в DATA_DIR/backups/ГГГГ-ММ-ДД и пази последните 30 дни.
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(base, full).split(path.sep).join('/');
    if (e.isDirectory()) { if (rel !== 'backups') out.push(...await walk(full, base)); }
    else if (e.isFile() && !e.name.endsWith('.tmp')) out.push([rel, full]);
  }
  return out;
}

// Прост zip без компресия (снимките и без това са компресирани)
async function zipData(DATA) {
  const files = await walk(DATA), parts = [], central = [];
  const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const [name, full] of files) {
    const data = await fsp.readFile(full), nm = Buffer.from(name, 'utf8'), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nm, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

function startDaily(DATA, keep = 30) {
  const dir = path.join(DATA, 'backups');
  async function run() {
    try {
      const day = new Date().toISOString().slice(0, 10), target = path.join(dir, day);
      if (fs.existsSync(target)) return;
      const json = (await fsp.readdir(DATA)).filter(f => f.endsWith('.json'));
      if (!json.length) return;
      await fsp.mkdir(target, { recursive: true });
      for (const f of json) await fsp.copyFile(path.join(DATA, f), path.join(target, f));
      const days = (await fsp.readdir(dir)).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
      for (const old of days.slice(0, Math.max(0, days.length - keep))) await fsp.rm(path.join(dir, old), { recursive: true, force: true });
    } catch (e) { console.error('Резервното копие не беше направено:', e.message); }
  }
  setTimeout(run, 60 * 1000);
  setInterval(run, 3 * 60 * 60 * 1000).unref();
}

module.exports = { zipData, startDaily };
