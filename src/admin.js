(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const views = ['vLogin', 'vOff', 'vList', 'vEdit'];
  const show = v => { views.forEach(id => { $('#' + id).hidden = id !== v; }); $('#logout').hidden = !(v === 'vList' || v === 'vEdit'); window.scrollTo(0, 0); };
  const MONTHS = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
  const fmt = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[m - 1]} ${y}`; };

  async function api(path, opts = {}) {
    const headers = { 'X-Admin': '1', ...(opts.headers || {}) };
    if (opts.json) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    const res = await fetch(path, { ...opts, headers, credentials: 'same-origin' });
    let data = {}; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }

  let posts = [], today = '', editing = null, dirty = false;

  async function load() {
    const r = await api('/api/admin/posts');
    if (r.status === 503) return show('vOff');
    if (r.status === 401) { show('vLogin'); return $('#pw').focus(); }
    posts = r.data.posts || []; today = r.data.today;
    renderList(); show('vList');
  }

  /* ---------- Вход / изход ---------- */
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#loginMsg'); msg.textContent = '';
    const r = await api('/api/admin/login', { method: 'POST', json: { password: $('#pw').value } });
    if (r.status === 200) { $('#pw').value = ''; return load(); }
    msg.textContent = r.status === 429 ? 'Твърде много опити. Опитайте след 15 минути.' : 'Грешна парола.';
  });
  $('#logout').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); show('vLogin'); });

  /* ---------- Списък ---------- */
  const state = p => p.status !== 'published' ? ['draft', 'Чернова'] : p.date > today ? ['soon', 'Насрочена'] : ['live', 'Публикувана'];
  function renderList() {
    const box = $('#list'); box.innerHTML = '';
    if (!posts.length) { box.innerHTML = '<div class="adm-empty">Още няма статии. Натиснете „Нова статия“.</div>'; return; }
    posts.forEach(p => {
      const [cls, label] = state(p);
      const row = document.createElement('article'); row.className = 'adm-row';
      const th = document.createElement('div'); th.className = 'adm-thumb';
      if (p.cover) { const im = document.createElement('img'); im.src = p.cover; im.alt = ''; th.appendChild(im); }
      const info = document.createElement('div'); info.className = 'adm-info';
      const h = document.createElement('h3'); h.textContent = p.title;
      const meta = document.createElement('p');
      const pill = document.createElement('span'); pill.className = 'adm-pill ' + cls; pill.textContent = label;
      meta.append(pill, document.createTextNode(` ${fmt(p.date)}${p.category ? ' · ' + p.category : ''}`));
      info.append(h, meta);
      const act = document.createElement('div'); act.className = 'adm-row-act';
      const view = document.createElement('a'); view.href = '/blog/' + p.slug; view.target = '_blank'; view.rel = 'noopener'; view.textContent = 'Виж'; view.className = 'btn btn-ghost adm-sm';
      const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'btn btn-primary adm-sm'; ed.textContent = 'Редактирай';
      ed.addEventListener('click', () => openEditor(p));
      act.append(view, ed);
      row.append(th, info, act);
      row.addEventListener('dblclick', () => openEditor(p));
      box.appendChild(row);
    });
  }
  $('#newPost').addEventListener('click', () => openEditor(null));

  /* ---------- Редактор ---------- */
  const form = $('#editForm');
  function setCover(url) {
    $('#f-cover').value = url || '';
    const box = $('#coverBox'); box.innerHTML = '';
    if (url) { const im = document.createElement('img'); im.src = url; im.alt = ''; box.appendChild(im); }
    else box.innerHTML = '<span>Без снимка, ще се покаже графика в стила на сайта.</span>';
    $('#coverDel').hidden = !url;
  }
  function openEditor(p) {
    editing = p; dirty = false;
    form.reset(); clearErrors(); $('#editMsg').textContent = ''; $('#editMsg').className = 'adm-msg';
    $('#editTitle').textContent = p ? 'Редактиране' : 'Нова статия';
    const v = p || { status: 'draft', date: today, author: 'Десислава Топалова' };
    ['title', 'excerpt', 'body', 'category', 'slug', 'author', 'coverAlt', 'date'].forEach(k => { if (form.elements[k]) form.elements[k].value = v[k] || ''; });
    form.elements.status.value = v.status;
    setCover(v.cover);
    $('#viewLink').hidden = !p; if (p) $('#viewLink').href = '/blog/' + p.slug;
    $('#delBtn').hidden = !p; $('#delBtn').textContent = 'Изтрий статията'; $('#delBtn').dataset.sure = '';
    $('#cats').innerHTML = '';
    [...new Set(posts.map(x => x.category).filter(Boolean))].forEach(c => { const o = document.createElement('option'); o.value = c; $('#cats').appendChild(o); });
    show('vEdit'); $('#f-title').focus();
  }
  form.addEventListener('input', () => { dirty = true; });
  $('#back').addEventListener('click', () => {
    if (dirty && !$('#back').dataset.sure) { $('#back').dataset.sure = '1'; $('#back').textContent = '← Има незапазени промени. Натиснете пак, за да излезете.'; return; }
    $('#back').dataset.sure = ''; $('#back').textContent = '← Всички статии'; load();
  });
  window.addEventListener('beforeunload', e => { if (dirty && !$('#vEdit').hidden) { e.preventDefault(); e.returnValue = ''; } });

  function clearErrors() { $$('.field', form).forEach(f => { f.classList.remove('err'); const m = $('.msg', f); if (m) m.textContent = ''; }); }
  form.addEventListener('submit', async e => {
    e.preventDefault(); clearErrors();
    const data = Object.fromEntries(new FormData(form));
    if (editing) data.id = editing.id;
    const btn = $('#saveBtn'); btn.disabled = true; btn.textContent = 'Запазване...';
    const r = await api('/api/admin/posts', { method: 'POST', json: data });
    btn.disabled = false; btn.textContent = 'Запази';
    const msg = $('#editMsg');
    if (r.status === 401) { show('vLogin'); return; }
    if (r.status === 400 && r.data.errors) {
      Object.entries(r.data.errors).forEach(([k, t]) => { const f = form.elements[k]?.closest('.field'); if (f) { f.classList.add('err'); $('.msg', f).textContent = t; } });
      msg.className = 'adm-msg bad'; msg.textContent = 'Проверете отбелязаните полета.'; return;
    }
    if (r.status !== 200) { msg.className = 'adm-msg bad'; msg.textContent = 'Не успяхме да запазим. Опитайте отново.'; return; }
    const p = r.data.post; editing = p; dirty = false;
    const i = posts.findIndex(x => x.id === p.id); if (i >= 0) posts[i] = p; else posts.unshift(p);
    form.elements.slug.value = p.slug;
    $('#viewLink').hidden = false; $('#viewLink').href = '/blog/' + p.slug; $('#delBtn').hidden = false; $('#editTitle').textContent = 'Редактиране';
    msg.className = 'adm-msg ok';
    msg.textContent = p.status === 'published' ? (p.date > today ? 'Запазено. Статията ще се появи на ' + fmt(p.date) + '.' : 'Запазено и публикувано.') : 'Запазено като чернова. Не се вижда от посетителите.';
  });

  $('#delBtn').addEventListener('click', async () => {
    const b = $('#delBtn');
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Натиснете пак, за да изтриете завинаги'; return; }
    const r = await api('/api/admin/posts/' + editing.id, { method: 'DELETE' });
    if (r.status === 200) { dirty = false; load(); }
  });

  /* ---------- Снимки ---------- */
  async function upload(file) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) { alertMsg('Снимката е над 5 MB. Намалете я и опитайте пак.'); return null; }
    const r = await api('/api/admin/upload', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
    if (r.status !== 200) { alertMsg(r.data.error || 'Снимката не беше качена.'); return null; }
    return r.data.url;
  }
  const alertMsg = t => { const m = $('#editMsg'); m.className = 'adm-msg bad'; m.textContent = t; };
  $('#coverFile').addEventListener('change', async e => { const u = await upload(e.target.files[0]); e.target.value = ''; if (u) { setCover(u); dirty = true; } });
  $('#coverDel').addEventListener('click', () => { setCover(''); dirty = true; });
  $('#bodyImg').addEventListener('change', async e => {
    const u = await upload(e.target.files[0]); e.target.value = '';
    if (u) insert('\n\n![Описание на снимката](' + u + ')\n\n', '');
  });

  /* ---------- Лента за форматиране ---------- */
  const ta = $('#f-body');
  function insert(before, after, placeholder = '') {
    const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || placeholder;
    ta.setRangeText(before + sel + after, s, e, 'end');
    ta.focus(); ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + sel.length;
    dirty = true;
  }
  function linePrefix(prefix, numbered) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const start = ta.value.lastIndexOf('\n', s - 1) + 1;
    const block = ta.value.slice(start, e) || 'текст';
    const out = block.split('\n').map((l, i) => (numbered ? (i + 1) + '. ' : prefix) + l.replace(/^(#{2,3}\s|[-•]\s|\d+[.)]\s|>\s)/, '')).join('\n');
    ta.setRangeText(out, start, e, 'select'); ta.focus(); dirty = true;
  }
  $$('[data-md]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.md;
    if (t === 'b') insert('**', '**', 'удебелен текст');
    else if (t === 'i') insert('*', '*', 'курсив');
    else if (t === 'a') insert('[', '](https://)', 'текст на връзката');
    else if (t === 'h2') linePrefix('## ');
    else if (t === 'h3') linePrefix('### ');
    else if (t === 'ul') linePrefix('- ');
    else if (t === 'ol') linePrefix('', true);
    else if (t === 'q') linePrefix('> ');
  }));

  load();
})();
