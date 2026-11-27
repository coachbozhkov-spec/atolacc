// ATOL Accounting: малък сървър без рамки.
// Сервира сайта от ./public и приема заявки от формите за контакт и среща.
// Стартиране: npm install && npm start  (по подразбиране http://localhost:3000)
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const SLOTS = ['09:30', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];
const SERVICES = ['Дигитално счетоводство', 'Дигитално счетоводство +', 'Административни услуги', 'Консултантски услуги',
  'Допълнителни услуги', 'Работни заплати и хонорари', 'Електронно трудово досие', 'Дигитализация на счетоводни отдели',
  'Главен счетоводител', 'Счетоводство за Contractors', 'Декларации чл. 50 ЗДДФЛ', 'Друго'];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };

/* ---------- Хранилище: JSON файлове, запис през временен файл ---------- */
fs.mkdirSync(DATA, { recursive: true });
let queue = Promise.resolve();
const locked = fn => (queue = queue.then(fn, fn)); // записите минават един по един
async function readList(name) {
  try { return JSON.parse(await fsp.readFile(path.join(DATA, name), 'utf8')); } catch { return []; }
}
async function writeList(name, list) {
  const file = path.join(DATA, name), tmp = file + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2));
  await fsp.rename(tmp, file);
}

/* ---------- Известие по имейл (по желание, през SMTP на Microsoft 365) ---------- */
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  try {
    mailer = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } catch { console.warn('nodemailer липсва: известията по имейл са изключени.'); }
}
async function notify(subject, lines) {
  const text = lines.filter(Boolean).join('\n');
  if (!mailer) return console.log(`[известие] ${subject}\n${text}\n`);
  try {
    await mailer.sendMail({ from: process.env.SMTP_USER, to: process.env.NOTIFY_TO || process.env.SMTP_USER, subject, text });
  } catch (e) { console.error('Имейлът не беше изпратен:', e.message); }
}

/* ---------- Ограничение на заявките: 5 на 10 минути от един IP ---------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > 5;
}

/* ---------- Валидация ---------- */
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const phoneRe = /^[+\d][\d\s()-]{6,20}$/;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function todayISO() { const d = new Date(); return d.toISOString().slice(0, 10); }
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'Невалидна дата.';
  const d = new Date(s + 'T12:00:00Z');
  if (isNaN(d)) return 'Невалидна дата.';
  if (s <= todayISO()) return 'Изберете дата от утре нататък.';
  const max = new Date(); max.setUTCDate(max.getUTCDate() + 61);
  if (d > max) return 'Можете да запазите час до 60 дни напред.';
  if ([0, 6].includes(d.getUTCDay())) return 'Изберете работен ден.';
  return null;
}
function checkContact(b) {
  const v = { name: str(b.name, 100), email: str(b.email, 160), phone: str(b.phone, 30), message: str(b.message, 2000) }, e = {};
  if (v.name.length < 2) e.name = 'Попълнете името си.';
  if (!emailRe.test(v.email)) e.email = 'Проверете имейл адреса.';
  if (v.phone && !phoneRe.test(v.phone)) e.phone = 'Проверете телефонния номер.';
  if (v.message.length < 5) e.message = 'Напишете кратко съобщение.';
  if (b.consent !== true) e.consent = 'Нужно е съгласие.';
  return { v, e };
}
const YN = ['Да', 'Не'];
const OFFER_YN = ['vat', 'cashOps', 'intraEu', 'virtualPos', 'physicalPos', 'integration', 'fixedAssets', 'warehouse', 'gfo', 'loans', 'taxPlanning'];
const OFFER_NUM = ['employees', 'invoicesIn', 'invoicesOut', 'bankStatements', 'bankAccounts', 'transfers', 'cashRegisters', 'sites', 'skuCount'];
const CURRENCIES = ['EUR', 'BGN', 'USD', 'GBP', 'Друга'];
function checkOffer(b) {
  const v = { name: str(b.name, 100), company: str(b.company, 120), email: str(b.email, 160), phone: str(b.phone, 30),
    sector: str(b.sector, 1000), erp: str(b.erp, 200), reporting: str(b.reporting, 1000), currentSoftware: str(b.currentSoftware, 200) }, e = {};
  if (v.name.length < 2) e.name = 'Попълнете името си.';
  if (v.company.length < 2) e.company = 'Попълнете името на фирмата.';
  if (!emailRe.test(v.email)) e.email = 'Проверете имейл адреса.';
  if (!phoneRe.test(v.phone)) e.phone = 'Проверете телефонния номер.';
  if (v.sector.length < 2) e.sector = 'Опишете дейността си.';
  for (const k of OFFER_YN) { const x = str(b[k], 5); v[k] = YN.includes(x) ? x : ''; }
  { const x = str(b.docs, 12); v.docs = ['Дигитално', 'Хартиено'].includes(x) ? x : ''; }
  for (const k of OFFER_NUM) {
    const raw = str(String(b[k] ?? ''), 12);
    if (!raw) { v[k] = ''; continue; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 10000000) e[k] = 'Въведете цяло положително число.'; else v[k] = n;
  }
  v.currencies = Array.isArray(b.currencies) ? [...new Set(b.currencies.filter(c => CURRENCIES.includes(c)))] : [];
  if (b.consent !== true) e.consent = 'Нужно е съгласие.';
  return { v, e };
}
const OFFER_LABELS = [
  ['1. Обща информация', [['company', 'Фирма'], ['sector', 'Сектор на дейност'], ['vat', 'Регистрация по ДДС'], ['employees', 'Служители на трудов договор']]],
  ['2. Оперативен обем (средномесечно)', [['invoicesIn', 'Фактури за покупки'], ['invoicesOut', 'Фактури за продажби'], ['bankStatements', 'Банкови извлечения'], ['cashOps', 'Касови операции'], ['intraEu', 'ВОП/ВОД или внос/износ извън ЕС']]],
  ['3. Финанси и разплащания', [['bankAccounts', 'Банкови сметки'], ['currencies', 'Валути'], ['transfers', 'Преводи на месец'], ['cashRegisters', 'Касови апарати'], ['sites', 'Обекти с каса'], ['virtualPos', 'Виртуален ПОС'], ['physicalPos', 'Физически ПОС'], ['integration', 'Интеграция софтуер/каса/счетоводство']]],
  ['4. Специфики на дейността', [['fixedAssets', 'ДМА за амортизация'], ['erp', 'Софтуер за фактуриране/ERP'], ['reporting', 'Специфични нужди от отчетност'], ['warehouse', 'Складово стопанство'], ['skuCount', 'Брой артикули']]],
  ['5. Допълнителни услуги и организация', [['gfo', 'Изготвяне на ГФО'], ['loans', 'Съдействие за кредити/лизинг'], ['taxPlanning', 'Данъчно планиране'], ['docs', 'Предаване на документи'], ['currentSoftware', 'Настоящ счетоводен софтуер']]],
];
function offerText(v) {
  const out = [`Име: ${v.name}`, `Имейл: ${v.email}`, `Телефон: ${v.phone}`, ''];
  for (const [title, rows] of OFFER_LABELS) {
    out.push(title);
    for (const [k, label] of rows) { const x = Array.isArray(v[k]) ? v[k].join(', ') : v[k]; out.push(`  ${label}: ${x === '' || x == null ? '-' : x}`); }
    out.push('');
  }
  return out;
}

function checkBooking(b) {
  const v = { name: str(b.name, 100), company: str(b.company, 120), email: str(b.email, 160), phone: str(b.phone, 30),
    service: str(b.service, 80), date: str(b.date, 10), time: str(b.time, 5), message: str(b.message, 2000) }, e = {};
  if (v.name.length < 2) e.name = 'Попълнете името си.';
  if (!emailRe.test(v.email)) e.email = 'Проверете имейл адреса.';
  if (!phoneRe.test(v.phone)) e.phone = 'Проверете телефонния номер.';
  if (!SERVICES.includes(v.service)) e.service = 'Изберете тема.';
  const de = validDate(v.date); if (de) e.date = de;
  if (!SLOTS.includes(v.time)) e.time = 'Изберете час.';
  if (b.consent !== true) e.consent = 'Нужно е съгласие.';
  return { v, e };
}

/* ---------- HTTP помощници ---------- */
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 20_000) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'",
};
async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  try {
    const data = await fsp.readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, { ...SECURITY, 'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800' });
    res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Страницата не е намерена.'); }
}

/* ---------- Маршрути ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (url.pathname === '/healthz') return json(res, 200, { ok: true });
    if (url.pathname === '/api/slots' && req.method === 'GET') {
      const date = url.searchParams.get('date') || '';
      if (validDate(date)) return json(res, 200, { taken: SLOTS });
      const list = await readList('bookings.json');
      return json(res, 200, { taken: list.filter(b => b.date === date && b.status !== 'cancelled').map(b => b.time) });
    }
    if (['/api/contact', '/api/booking', '/api/offer'].includes(url.pathname) && req.method === 'POST') {
      if (!(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'JSON only' });
      const body = await readBody(req);
      if (body.website) return json(res, 200, { ok: true }); // капан за ботове
      if (limited(ip)) return json(res, 429, { error: 'Too many requests' });

      if (url.pathname === '/api/offer') {
        const { v, e } = checkOffer(body);
        if (Object.keys(e).length) return json(res, 400, { errors: e });
        const item = { id: Date.now().toString(36), createdAt: new Date().toISOString(), status: 'new', ...v };
        await locked(async () => { const l = await readList('offers.json'); l.push(item); await writeList('offers.json', l); });
        notify(`Заявка за оферта: ${v.company} (${v.name})`, offerText(v));
        return json(res, 200, { ok: true });
      }

      if (url.pathname === '/api/contact') {
        const { v, e } = checkContact(body);
        if (Object.keys(e).length) return json(res, 400, { errors: e });
        const item = { id: Date.now().toString(36), createdAt: new Date().toISOString(), ...v };
        await locked(async () => { const l = await readList('messages.json'); l.push(item); await writeList('messages.json', l); });
        notify(`Ново запитване от ${v.name}`, [`Име: ${v.name}`, `Имейл: ${v.email}`, v.phone && `Телефон: ${v.phone}`, '', v.message]);
        return json(res, 200, { ok: true });
      }

      const { v, e } = checkBooking(body);
      if (Object.keys(e).length) return json(res, 400, { errors: e });
      const item = { id: Date.now().toString(36), createdAt: new Date().toISOString(), status: 'new', ...v };
      const clash = await locked(async () => {
        const l = await readList('bookings.json');
        if (l.some(b => b.date === v.date && b.time === v.time && b.status !== 'cancelled')) return true;
        l.push(item); await writeList('bookings.json', l); return false;
      });
      if (clash) return json(res, 409, { error: 'Slot taken' });
      notify(`Нова среща: ${v.date} ${v.time}, ${v.name}`, [`Тема: ${v.service}`, `Име: ${v.name}`, v.company && `Фирма: ${v.company}`,
        `Имейл: ${v.email}`, `Телефон: ${v.phone}`, v.message && `\n${v.message}`]);
      return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res);
  } catch (err) {
    if (err.message === 'bad json' || err.message === 'too big') return json(res, 400, { error: 'Bad request' });
    console.error(err);
    return json(res, 500, { error: 'Server error' });
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`ATOL Accounting: http://localhost:${PORT}`));
module.exports = server;
