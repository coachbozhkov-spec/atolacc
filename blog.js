// Блог: статиите се пазят в DATA_DIR/posts.json, страниците се сглобяват на сървъра (добре за Google).
// Админ панел на /admin, парола от променливата ADMIN_PASSWORD.
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

module.exports = function blog({ DATA, PUBLIC, readList, writeList, locked, json, SECURITY }) {
  const UPLOADS = path.join(DATA, 'uploads');
  fs.mkdirSync(UPLOADS, { recursive: true });

  /* ---------- Помощници ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya' };
  const slugify = t => String(t).toLowerCase().split('').map(c => TR[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'statia';
  const words = t => (String(t).match(/\S+/g) || []).length;
  const readMin = p => Math.max(1, Math.round(words(p.body) / 200));
  const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
  const bgDate = iso => { const d = new Date(iso + 'T12:00:00Z'); return isNaN(d) ? '' : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Прост текстов формат: ## заглавие, ### подзаглавие, - списък, 1. номериран списък, **удебелен**, *курсив*, [текст](адрес)
  function inline(t) {
    let s = esc(t);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:|tel:)[^)\s]+)\)/g, (m, txt, href) => {
      const ext = /^https?:/.test(href.replace(/&amp;/g, '&'));
      return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`;
    });
    return s;
  }
  function render(body) {
    const out = [];
    for (const block of String(body).replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      if (lines.length === 1 && /^###\s/.test(lines[0])) { out.push(`<h3>${inline(lines[0].slice(4))}</h3>`); continue; }
      if (lines.length === 1 && /^##\s/.test(lines[0])) { out.push(`<h2>${inline(lines[0].slice(3))}</h2>`); continue; }
      const img = lines.length === 1 && lines[0].match(/^!\[([^\]]*)\]\((\/uploads\/[a-z0-9]+\.(?:jpg|png|webp))\)$/);
      if (img) { out.push(`<figure><img src="${img[2]}" alt="${esc(img[1])}" loading="lazy">${img[1] ? `<figcaption>${esc(img[1])}</figcaption>` : ''}</figure>`); continue; }
      if (lines.length === 1 && /^>\s/.test(lines[0])) { out.push(`<blockquote>${inline(lines[0].slice(2))}</blockquote>`); continue; }
      if (lines.every(l => /^[-•]\s/.test(l))) { out.push('<ul>' + lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>'); continue; }
      if (lines.every(l => /^\d+[.)]\s/.test(l))) { out.push('<ol>' + lines.map(l => `<li>${inline(l.replace(/^\d+[.)]\s/, ''))}</li>`).join('') + '</ol>'); continue; }
      out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  /* ---------- Данни ---------- */
  let cache = null;
  async function posts() {
    if (!cache) {
      if (!fs.existsSync(path.join(DATA, 'posts.json'))) {
        const seed = require('./seed-posts.json');
        await locked(() => writeList('posts.json', seed));
      }
      cache = await readList('posts.json');
    }
    return cache;
  }
  async function save(fn) {
    return locked(async () => { const l = await readList('posts.json'); const r = fn(l); await writeList('posts.json', l); cache = null; homeCache = null; return r; });
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const published = list => list.filter(p => p.status === 'published' && p.date <= today()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  /* ---------- Части от началната страница ---------- */
  let shell = null;
  function parts() {
    if (shell) return shell;
    const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); return html.slice(i, j + b.length); };
    const fix = s => s.replace(/(<a\b[^>]*\shref=")#/g, '$1/#').replace(/(src|srcset)="assets\//g, '$1="/assets/');
    const sprite = html.slice(html.indexOf('<svg width="0"'), html.indexOf('</svg>', html.indexOf('</defs>')) + 6);
    shell = {
      head: html.slice(html.indexOf('<!--HEAD-->') + 11, html.indexOf('<!--/HEAD-->')),
      script: (html.match(/<script src="\/app\.js[^"]*"><\/script>/) || ['<script src="/app.js"></script>'])[0],
      sprite,
      header: fix(cut('<header class="site-header"', '</header>')),
      tail: fix(html.slice(html.indexOf('<footer class="foot">'), html.indexOf('<!--/BODY-->'))),
    };
    return shell;
  }
  function page({ title, desc, canonical, body, extraHead = '', og = {} }) {
    const s = parts();
    const metas = [
      `<meta property="og:title" content="${esc(og.title || title)}">`, `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:type" content="${og.type || 'website'}">`, `<meta property="og:url" content="${esc(canonical)}">`,
      og.image ? `<meta property="og:image" content="${esc(og.image)}">` : '', '<meta property="og:locale" content="bg_BG">',
    ].filter(Boolean).join('\n');
    return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${metas}
<meta name="theme-color" content="#FBF8F3">
<meta name="color-scheme" content="light">
<link rel="icon" href="/assets/mark-light.svg" type="image/svg+xml">
${s.head}
${extraHead}
</head>
<body class="sub-page">
${s.sprite}
${s.header.replace('<a href="/blog">Блог</a>', '<a href="/blog" class="active" aria-current="page">Блог</a>')}
<main>
${body}
</main>
${s.tail}
${s.script}
</body>
</html>`;
  }
  const origin = req => `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;

  function card(p, i, h = 'h3') {
    const cover = p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy" decoding="async">` : '<i></i>';
    return `   <a class="post rv" style="--i:${i % 3}" href="/blog/${esc(p.slug)}"><div class="cover${p.cover ? ' has-img' : ''}">${cover}<span>${esc(p.category || 'Блог')}</span></div>`
      + `<div class="body"><${h}>${esc(p.title)}</${h}><p>${esc(p.excerpt)}</p><div class="meta"><span>${bgDate(p.date)} · ${readMin(p)} мин.</span><svg width="18" height="18"><use href="#i-arrow"/></svg></div></div></a>`;
  }

  /* ---------- Начална страница с последните статии ---------- */
  let homeCache = null;
  async function home() {
    if (homeCache && homeCache.day === today()) return homeCache.html;
    const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    const list = published(await posts()).slice(0, 3);
    const out = list.length ? html.replace(/<!--POSTS-->[\s\S]*?<!--\/POSTS-->/, '\n' + list.map((p, i) => card(p, i)).join('\n') + '\n')
      : html.replace(/<!-- BLOG -->[\s\S]*?<!-- CONTACTS -->/, '<!-- CONTACTS -->');
    homeCache = { day: today(), html: out };
    return out;
  }

  /* ---------- Списък и статия ---------- */
  async function listPage(req, url) {
    const all = published(await posts());
    const cats = [...new Set(all.map(p => p.category).filter(Boolean))];
    const cat = url.searchParams.get('cat') || '';
    const list = cat ? all.filter(p => p.category === cat) : all;
    const chips = cats.length > 1 ? `<nav class="blog-cats" aria-label="Категории"><a href="/blog"${!cat ? ' class="on" aria-current="page"' : ''}>Всички</a>${cats.map(c => `<a href="/blog?cat=${encodeURIComponent(c)}"${c === cat ? ' class="on" aria-current="page"' : ''}>${esc(c)}</a>`).join('')}</nav>` : '';
    const body = `<section class="blog-hero">
 <div class="wrap">
  <nav class="crumbs" aria-label="Път"><a href="/">Начало</a><span>/</span><span>Блог</span></nav>
  <span class="eyebrow">Блог</span>
  <h1>Полезно за вашия бизнес</h1>
  <p>Кратки статии за данъци, срокове, заплати и дигитални инструменти. Пишем ясно и по същество.</p>
  ${chips}
 </div>
</section>
<section class="sec blog-list">
 <div class="wrap">
  ${list.length ? `<div class="posts">\n${list.map((p, i) => card(p, i, 'h2')).join('\n')}\n  </div>` : '<p class="blog-empty">Скоро тук ще има статии.</p>'}
 </div>
</section>`;
    const o = origin(req);
    return page({ title: (cat ? cat + ' | ' : '') + 'Блог | ATOL Accounting', desc: 'Статии за счетоводство, данъци, ТРЗ и дигитализация от ATOL Accounting, Пловдив.',
      canonical: o + '/blog' + (cat ? '?cat=' + encodeURIComponent(cat) : ''), body });
  }

  async function postPage(req, slug, isAdmin) {
    const all = await posts();
    const p = all.find(x => x.slug === slug);
    if (!p || (!isAdmin && (p.status !== 'published' || p.date > today()))) return null;
    const pub = published(all);
    const more = pub.filter(x => x.slug !== p.slug).sort((a, b) => (b.category === p.category) - (a.category === p.category)).slice(0, 3);
    const o = origin(req), url = o + '/blog/' + p.slug;
    const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.excerpt, datePublished: p.date,
      dateModified: (p.updatedAt || p.date).slice(0, 10), author: { '@type': 'Person', name: p.author || 'Десислава Топалова' },
      publisher: { '@type': 'Organization', name: 'АТОЛ АКАУНТИНГ ЕООД', logo: { '@type': 'ImageObject', url: o + '/assets/logo-light.svg' } },
      mainEntityOfPage: url, ...(p.cover ? { image: o + p.cover } : {}) };
    const draft = p.status !== 'published' || p.date > today();
    const body = `<article class="article">
 <header class="article-head">
  <div class="wrap narrow">
   ${draft ? '<p class="draft-note">Чернова: тази статия не е публикувана и се вижда само от вас.</p>' : ''}
   <nav class="crumbs" aria-label="Път"><a href="/">Начало</a><span>/</span><a href="/blog">Блог</a>${p.category ? `<span>/</span><a href="/blog?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a>` : ''}</nav>
   <h1>${esc(p.title)}</h1>
   <p class="lede">${esc(p.excerpt)}</p>
   <div class="byline"><img src="/assets/desislava.jpg" alt="" width="44" height="44"><div><b>${esc(p.author || 'Десислава Топалова')}</b><span><time datetime="${esc(p.date)}">${bgDate(p.date)}</time> · ${readMin(p)} мин. четене</span></div></div>
  </div>
 </header>
 ${p.cover ? `<figure class="article-cover wrap"><img src="${esc(p.cover)}" alt="${esc(p.coverAlt || p.title)}"></figure>` : '<div class="article-band wrap" aria-hidden="true"><i></i></div>'}
 <div class="wrap narrow prose">
${render(p.body)}
 </div>
 <aside class="wrap narrow article-cta">
  <div><span class="eyebrow">Имате въпрос?</span><h2>Да го решим заедно</h2><p>Попълнете кратката анкета и ще получите индивидуална оферта, или запазете онлайн среща.</p></div>
  <div class="cta-btns"><button class="btn btn-primary" type="button" data-offer>Заяви оферта <svg class="arr" width="16" height="16"><use href="#i-arrow"/></svg></button><a class="btn btn-ghost" href="/#booking">Запази среща</a></div>
 </aside>
</article>
${more.length ? `<section class="sec alt">
 <div class="wrap">
  <div class="sec-head"><div><span class="eyebrow">Още от блога</span><h2>Прочетете също</h2></div><a class="btn btn-ghost" href="/blog">Всички статии <svg class="arr" width="16" height="16"><use href="#i-arrow"/></svg></a></div>
  <div class="posts">
${more.map((x, i) => card(x, i)).join('\n')}
  </div>
 </div>
</section>` : ''}`;
    return page({ title: p.title + ' | ATOL Accounting', desc: p.excerpt, canonical: url, body,
      og: { type: 'article', title: p.title, image: p.cover ? o + p.cover : '' },
      extraHead: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` + (draft ? '\n<meta name="robots" content="noindex">' : '') });
  }

  /* ---------- Вход в админ панела ---------- */
  const PASS = process.env.ADMIN_PASSWORD || '';
  const key = () => crypto.createHash('sha256').update('atol-admin:' + PASS).digest();
  const sign = exp => crypto.createHmac('sha256', key()).update(String(exp)).digest('base64url');
  function isAdmin(req) {
    if (!PASS) return false;
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)atol_adm=(\d+)\.([\w-]+)/);
    if (!m || Number(m[1]) < Date.now()) return false;
    const a = Buffer.from(m[2]), b = Buffer.from(sign(m[1]));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const fails = new Map();
  function tooMany(ip) {
    const now = Date.now(), l = (fails.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
    fails.set(ip, l); return l.length >= 8;
  }
  function cookie(req, val, age) {
    const secure = (req.headers['x-forwarded-proto'] || '').startsWith('https') ? '; Secure' : '';
    return `atol_adm=${val}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
  }
  function readRaw(req, max) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > max) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  const readJSON = async (req, max) => { try { return JSON.parse((await readRaw(req, max)).toString('utf8') || '{}'); } catch (e) { throw e.message === 'too big' ? e : new Error('bad json'); } };

  function checkPost(b, list, id) {
    const v = { title: str(b.title, 160), category: str(b.category, 40), excerpt: str(b.excerpt, 300), body: str(b.body, 60000),
      cover: str(b.cover, 200), coverAlt: str(b.coverAlt, 160), author: str(b.author, 80), status: b.status === 'published' ? 'published' : 'draft',
      date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today() }, e = {};
    if (v.title.length < 3) e.title = 'Напишете заглавие.';
    if (!v.excerpt) {
      const plain = v.body.split(/\n\s*\n/).map(b => b.trim()).find(b => b && !/^(#|!\[|[-•>]\s|\d+[.)]\s)/.test(b)) || '';
      const t = plain.replace(/\*\*|\*|\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ');
      v.excerpt = t.length > 180 ? t.slice(0, 180).replace(/\s\S*$/, '') + '…' : t;
    }
    if (v.body.length < 20) e.body = 'Статията е твърде кратка.';
    if (v.cover && !/^\/uploads\/[a-z0-9]+\.(jpg|png|webp)$/.test(v.cover)) v.cover = '';
    let slug = slugify(str(b.slug, 80) || v.title), base = slug, n = 2;
    while (list.some(p => p.slug === slug && p.id !== id)) slug = `${base}-${n++}`;
    v.slug = slug;
    return { v, e };
  }
  const IMG = [[[0xFF, 0xD8, 0xFF], 'jpg'], [[0x89, 0x50, 0x4E, 0x47], 'png'], [[0x52, 0x49, 0x46, 0x46], 'webp']];

  async function admin(req, res, url, ip) {
    const p = url.pathname;
    if (!PASS) return json(res, 503, { error: 'no-password' });
    if (p === '/api/admin/login' && req.method === 'POST') {
      if (tooMany(ip)) return json(res, 429, { error: 'Too many attempts' });
      const b = await readJSON(req, 2000);
      const a = crypto.createHash('sha256').update(String(b.password || '')).digest(), c = crypto.createHash('sha256').update(PASS).digest();
      if (!crypto.timingSafeEqual(a, c)) { fails.get(ip).push(Date.now()); return json(res, 401, { error: 'Грешна парола.' }); }
      const exp = Date.now() + 7 * 864e5;
      res.setHeader('Set-Cookie', cookie(req, `${exp}.${sign(exp)}`, 7 * 86400));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/admin/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', cookie(req, '', 0)); return json(res, 200, { ok: true }); }
    if (!isAdmin(req)) return json(res, 401, { error: 'login' });
    if (req.method !== 'GET' && req.headers['x-admin'] !== '1') return json(res, 403, { error: 'Forbidden' });

    if (p === '/api/admin/posts' && req.method === 'GET') {
      const l = [...await posts()].sort((a, b) => b.date.localeCompare(a.date));
      return json(res, 200, { posts: l, today: today() });
    }
    if (p === '/api/admin/posts' && req.method === 'POST') {
      const b = await readJSON(req, 200000);
      const r = await save(l => {
        const id = typeof b.id === 'string' ? b.id : '';
        const { v, e } = checkPost(b, l, id);
        if (Object.keys(e).length) return { errors: e };
        const now = new Date().toISOString();
        const i = l.findIndex(x => x.id === id);
        if (i >= 0) { l[i] = { ...l[i], ...v, updatedAt: now }; return { post: l[i] }; }
        const post = { id: crypto.randomBytes(6).toString('hex'), createdAt: now, updatedAt: now, ...v };
        l.push(post); return { post };
      });
      return json(res, r.errors ? 400 : 200, r);
    }
    const m = p.match(/^\/api\/admin\/posts\/([a-z0-9]+)$/);
    if (m && req.method === 'DELETE') {
      const ok = await save(l => { const i = l.findIndex(x => x.id === m[1]); if (i < 0) return false; l.splice(i, 1); return true; });
      return json(res, ok ? 200 : 404, { ok });
    }
    if (p === '/api/admin/upload' && req.method === 'POST') {
      const buf = await readRaw(req, 5 * 1024 * 1024);
      const t = IMG.find(([sig]) => sig.every((x, i) => buf[i] === x));
      if (!t || (t[1] === 'webp' && buf.slice(8, 12).toString() !== 'WEBP')) return json(res, 400, { error: 'Само JPG, PNG или WebP до 5 MB.' });
      const name = crypto.randomBytes(8).toString('hex') + '.' + t[1];
      await fsp.writeFile(path.join(UPLOADS, name), buf);
      return json(res, 200, { url: '/uploads/' + name });
    }
    return json(res, 404, { error: 'Not found' });
  }

  /* ---------- Маршрутизатор: връща true, ако е обработил заявката ---------- */
  const send = (res, status, html, extra = {}) => { res.writeHead(status, { ...SECURITY, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...extra }); res.end(html); };
  return async function route(req, res, url, ip) {
    const p = url.pathname;
    if (p.startsWith('/api/admin/')) { await admin(req, res, url, ip); return true; }
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    if (p === '/' || p === '/index.html') { send(res, 200, await home()); return true; }
    if (p === '/blog' || p === '/blog/') { send(res, 200, await listPage(req, url)); return true; }
    const m = p.match(/^\/blog\/([a-z0-9-]{1,90})\/?$/);
    if (m) {
      const adm = isAdmin(req);
      const html = await postPage(req, m[1], adm);
      if (html) send(res, 200, html, adm ? { 'Cache-Control': 'no-store' } : {});
      else send(res, 404, page({ title: 'Статията не е намерена | ATOL Accounting', desc: '', canonical: origin(req) + '/blog',
        body: '<section class="blog-hero"><div class="wrap"><span class="eyebrow">404</span><h1>Статията не е намерена</h1><p>Възможно е да е преместена или премахната.</p><p><a class="btn btn-primary" href="/blog">Към блога</a></p></div></section>' }));
      return true;
    }
    if (p === '/admin' || p === '/admin/') {
      const html = await fsp.readFile(path.join(PUBLIC, 'admin.html'));
      send(res, 200, html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }); return true;
    }
    const u = p.match(/^\/uploads\/([a-z0-9]+\.(jpg|png|webp))$/);
    if (u) {
      try {
        const buf = await fsp.readFile(path.join(UPLOADS, u[1]));
        res.writeHead(200, { ...SECURITY, 'Content-Type': { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[u[2]], 'Cache-Control': 'public, max-age=31536000, immutable' });
        res.end(buf);
      } catch { res.writeHead(404); res.end(); }
      return true;
    }
    if (p === '/sitemap.xml') {
      const o = origin(req), list = published(await posts());
      const urls = [[o + '/', today()], [o + '/blog', list[0]?.date || today()], ...list.map(x => [o + '/blog/' + x.slug, (x.updatedAt || x.date).slice(0, 10)])];
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls.map(([l, d]) => `<url><loc>${esc(l)}</loc><lastmod>${d}</lastmod></url>`).join('\n') + '\n</urlset>\n');
      return true;
    }
    if (p === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin(req)}/sitemap.xml\n`);
      return true;
    }
    return false;
  };
};
