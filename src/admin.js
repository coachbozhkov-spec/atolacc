(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const views = ['vLogin', 'vOff', 'vList', 'vEdit'];
  const show = v => { views.forEach(id => { $('#' + id).hidden = id !== v; }); $('#logout').hidden = !(v === 'vList' || v === 'vEdit'); window.scrollTo(0, 0); };
  const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
  const fmt = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[m - 1]} ${y}`; };
  const hhmm = () => new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Съобщения ---------- */
  let toastT;
  function toast(text, kind = 'ok') {
    const t = $('#toast'); t.textContent = text; t.className = 'adm-toast show ' + kind;
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'adm-toast ' + kind; }, 3800);
  }

  async function api(path, opts = {}) {
    const headers = { 'X-Admin': '1', ...(opts.headers || {}) };
    if (opts.json) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    try {
      const res = await fetch(path, { ...opts, headers, credentials: 'same-origin' });
      let data = {}; try { data = await res.json(); } catch {}
      return { status: res.status, data };
    } catch { return { status: 0, data: {} }; }
  }

  let posts = [], today = '', editing = null, dirty = false, filter = 'all';

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
    msg.textContent = r.status === 429 ? 'Твърде много опити. Опитайте отново след 15 минути.' : 'Паролата не е вярна. Опитайте пак.';
  });
  $('#logout').addEventListener('click', async () => { await flush(); await api('/api/admin/logout', { method: 'POST' }); show('vLogin'); });

  /* ---------- Потвърждение ---------- */
  function confirmBox(title, text, yes) {
    const d = $('#confirm'); $('#cTitle').textContent = title; $('#cText').textContent = text; $('#cYes').textContent = yes;
    d.showModal();
    return new Promise(res => {
      const done = v => { d.close(); $('#cYes').onclick = $('#cNo').onclick = null; res(v); };
      $('#cYes').onclick = () => done(true); $('#cNo').onclick = () => done(false);
      d.onclose = () => res(false);
    });
  }
  async function removePost(p) {
    const ok = await confirmBox('Да изтрием ли статията?', `„${p.title}“ ще бъде изтрита завинаги и няма да се вижда в сайта.`, 'Да, изтрий');
    if (!ok) return false;
    const r = await api('/api/admin/posts/' + p.id, { method: 'DELETE' });
    if (r.status !== 200) { toast('Статията не беше изтрита. Опитайте пак.', 'bad'); return false; }
    try { localStorage.removeItem('atol-backup-' + p.id); } catch {}
    toast('Статията е изтрита.');
    return true;
  }

  /* ---------- Списък ---------- */
  const state = p => p.status !== 'published' ? ['draft', 'Чернова'] : p.date > today ? ['soon', 'Насрочена'] : ['live', 'Публикувана'];
  function renderList() {
    const live = posts.filter(p => state(p)[0] !== 'draft').length;
    $('#stats').textContent = posts.length ? `${live} публикувани · ${posts.length - live} чернови` : '';
    const list = posts.filter(p => filter === 'all' || (filter === 'live' ? state(p)[0] !== 'draft' : state(p)[0] === 'draft'));
    const box = $('#list'); box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = filter === 'all'
        ? '<div class="adm-empty"><b>Още няма статии</b><span>Натиснете „Напиши нова статия“, за да започнете.</span></div>'
        : '<div class="adm-empty"><span>Няма статии в този раздел.</span></div>';
      return;
    }
    list.forEach(p => {
      const [cls, label] = state(p);
      const row = document.createElement('article'); row.className = 'adm-row';
      row.innerHTML = `<button class="adm-thumb" type="button" aria-label="Редактирай">${p.cover ? `<img src="${esc(p.cover)}" alt="">` : ''}</button>
        <div class="adm-info"><span class="adm-pill ${cls}">${label}</span><h3></h3><p>${fmt(p.date)}${p.category ? ' · ' + esc(p.category) : ''}</p></div>
        <div class="adm-row-act">
          <button class="btn btn-primary adm-sm" type="button" data-a="edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>Редактирай</button>
          ${cls !== 'draft' ? '<a class="btn btn-ghost adm-sm" target="_blank" rel="noopener" data-a="view"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>Виж</a>' : ''}
          <button class="adm-icon danger" type="button" data-a="del" title="Изтрий" aria-label="Изтрий"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
        </div>`;
      $('h3', row).textContent = p.title;
      const v = $('[data-a=view]', row); if (v) v.href = '/blog/' + p.slug;
      $('[data-a=edit]', row).addEventListener('click', () => openEditor(p));
      $('.adm-thumb', row).addEventListener('click', () => openEditor(p));
      $('[data-a=del]', row).addEventListener('click', async () => { if (await removePost(p)) { posts = posts.filter(x => x.id !== p.id); renderList(); } });
      box.appendChild(row);
    });
  }
  $$('#tabs button').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.f; $$('#tabs button').forEach(x => x.classList.toggle('on', x === b)); renderList();
  }));
  $('#newPost').addEventListener('click', () => openEditor(null));

  /* ---------- Редактор ---------- */
  const form = $('#editForm'), ta = $('#f-body');
  const FIELDS = ['title', 'excerpt', 'body', 'category', 'slug', 'author', 'coverAlt', 'date', 'cover'];
  const values = () => { const v = {}; FIELDS.forEach(k => { v[k] = form.elements[k].value; }); return v; };

  function setCover(url) {
    $('#f-cover').value = url || '';
    const box = $('#coverBox'); $('img', box)?.remove();
    if (url) { const im = document.createElement('img'); im.src = url; im.alt = ''; box.appendChild(im); }
    box.classList.toggle('has', !!url);
    $('#coverDel').hidden = !url;
  }
  function paintStatus() {
    const p = editing, pub = p && p.status === 'published';
    const line = $('#statusLine');
    if (!p) line.innerHTML = '<span class="dot draft"></span>Нова статия, още не е запазена';
    else if (!pub) line.innerHTML = '<span class="dot draft"></span>Чернова. Не се вижда от посетителите.';
    else if (p.date > today) line.innerHTML = `<span class="dot soon"></span>Насрочена за ${fmt(p.date)}`;
    else line.innerHTML = `<span class="dot live"></span>Публикувана на ${fmt(p.date)}`;
    $('#publishBtn').textContent = pub ? (dirty ? 'Публикувай промените' : 'Публикувано ✓') : 'Публикувай';
    $('#publishBtn').disabled = pub && !dirty;
    $('#draftBtn').textContent = pub ? 'Скрий от сайта' : 'Запази като чернова';
    $('#viewLink').hidden = !pub; if (pub) $('#viewLink').href = '/blog/' + p.slug;
    $('#delBtn').hidden = !p;
  }
  function setState(text, kind = '') { const s = $('#saveState'); s.textContent = text; s.className = 'adm-state ' + kind; }

  function openEditor(p) {
    editing = p; dirty = false;
    form.reset(); clearErrors(); mode('write');
    const v = p || { date: today, author: 'Десислава Топалова' };
    FIELDS.forEach(k => { if (k !== 'cover') form.elements[k].value = v[k] || ''; });
    setCover(v.cover);
    $('#cats').innerHTML = '';
    [...new Set(posts.map(x => x.category).filter(Boolean))].forEach(c => { const o = document.createElement('option'); o.value = c; $('#cats').appendChild(o); });
    paintStatus(); setState(p ? '' : 'Черновата се запазва автоматично, докато пишете.');
    // незапазен текст от предишен път
    if (p) {
      let b = null; try { b = JSON.parse(localStorage.getItem('atol-backup-' + p.id) || 'null'); } catch {}
      if (b && b.at > (p.updatedAt || '')) {
        const s = $('#saveState'); s.className = 'adm-state warn'; s.innerHTML = 'Имате незапазени промени от предишния път. ';
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Върни ги';
        btn.onclick = () => { FIELDS.forEach(k => { if (k !== 'cover' && b.v[k] != null) form.elements[k].value = b.v[k]; }); setCover(b.v.cover); changed(); };
        s.appendChild(btn);
      }
    }
    show('vEdit'); if (!p) $('#f-title').focus();
  }

  function clearErrors() { $$('.field', form).forEach(f => { f.classList.remove('err'); const m = $('.msg', f); if (m) m.textContent = ''; }); }
  function showErrors(errs) {
    Object.entries(errs).forEach(([k, t]) => { const f = form.elements[k]?.closest('.field'); if (f) { f.classList.add('err'); const m = $('.msg', f); if (m) m.textContent = t; } });
    const first = $('.field.err', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  let saving = Promise.resolve();
  function save(status, auto) {
    saving = saving.then(async () => {
      const data = { ...values(), status };
      if (editing) data.id = editing.id;
      if (!auto) clearErrors();
      setState('Запазване...');
      const r = await api('/api/admin/posts', { method: 'POST', json: data });
      if (r.status === 401) { show('vLogin'); return false; }
      if (r.status === 400 && r.data.errors) { if (!auto) { showErrors(r.data.errors); setState(''); toast('Попълнете отбелязаните полета.', 'bad'); } else setState(''); return false; }
      if (r.status !== 200) { setState('Няма връзка. Промените са пазени на този компютър.', 'warn'); backup(); if (!auto) toast('Не успяхме да запазим. Проверете интернета и опитайте пак.', 'bad'); return false; }
      const p = r.data.post; editing = p; dirty = false;
      const i = posts.findIndex(x => x.id === p.id); if (i >= 0) posts[i] = p; else posts.unshift(p);
      form.elements.slug.value = p.slug; form.elements.excerpt.value = p.excerpt;
      try { localStorage.removeItem('atol-backup-' + p.id); } catch {}
      setState((auto ? 'Запазено автоматично в ' : 'Запазено в ') + hhmm(), 'ok');
      paintStatus();
      return true;
    });
    return saving;
  }
  function backup() { if (editing) try { localStorage.setItem('atol-backup-' + editing.id, JSON.stringify({ at: new Date().toISOString(), v: values() })); } catch {} }

  let autoT;
  function changed() {
    dirty = true; paintStatus(); clearTimeout(autoT);
    const pub = editing && editing.status === 'published';
    if (pub) { backup(); setState('Има промени, които още не са публикувани.', 'warn'); return; }
    setState('Има незапазени промени...');
    autoT = setTimeout(() => {
      const v = values();
      if (v.title.trim().length >= 3 && v.body.trim().length >= 20) save('draft', true);
      else setState('Напишете заглавие и малко текст и ще запазим черновата автоматично.');
    }, 2500);
  }
  form.addEventListener('input', e => { if (e.target.closest('.field')) e.target.closest('.field').classList.remove('err'); changed(); });
  async function flush() { clearTimeout(autoT); if (dirty && !(editing && editing.status === 'published')) { const v = values(); if (v.title.trim().length >= 3 && v.body.trim().length >= 20) await save('draft', true); } await saving; }

  $('#publishBtn').addEventListener('click', async () => {
    clearTimeout(autoT);
    const wasPub = editing && editing.status === 'published';
    if (await save('published')) toast(editing.date > today ? 'Статията ще се появи на ' + fmt(editing.date) + '.' : wasPub ? 'Промените са публикувани.' : 'Статията е публикувана в сайта!');
  });
  $('#draftBtn').addEventListener('click', async () => {
    clearTimeout(autoT);
    const wasPub = editing && editing.status === 'published';
    if (wasPub && !await confirmBox('Да скрием ли статията от сайта?', 'Тя ще стане чернова и посетителите няма да я виждат, докато не я публикувате отново.', 'Да, скрий')) return;
    if (await save('draft')) toast(wasPub ? 'Статията е скрита от сайта.' : 'Черновата е запазена.');
  });
  $('#delBtn').addEventListener('click', async () => { if (await removePost(editing)) { dirty = false; load(); } });
  $('#back').addEventListener('click', async () => {
    const pub = editing && editing.status === 'published';
    if (dirty && pub && !await confirmBox('Промените не са публикувани', 'Ако излезете, те остават запазени само на този компютър. Можете да ги публикувате по-късно.', 'Излез')) return;
    await flush(); load();
  });
  window.addEventListener('beforeunload', e => { if (dirty && !$('#vEdit').hidden) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Преглед ---------- */
  function inline(t) {
    let s = esc(t);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
    return s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:|tel:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function render(body) {
    const out = [];
    for (const block of String(body).replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const one = lines.length === 1 ? lines[0] : null;
      const img = one && one.match(/^!\[([^\]]*)\]\((\/uploads\/[a-z0-9]+\.(?:jpg|png|webp))\)$/);
      if (img) out.push(`<figure><img src="${img[2]}" alt="">${img[1] ? `<figcaption>${esc(img[1])}</figcaption>` : ''}</figure>`);
      else if (one && /^###\s/.test(one)) out.push(`<h3>${inline(one.slice(4))}</h3>`);
      else if (one && /^##\s/.test(one)) out.push(`<h2>${inline(one.slice(3))}</h2>`);
      else if (one && /^>\s/.test(one)) out.push(`<blockquote>${inline(one.slice(2))}</blockquote>`);
      else if (lines.every(l => /^[-•]\s/.test(l))) out.push('<ul>' + lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>');
      else if (lines.every(l => /^\d+[.)]\s/.test(l))) out.push('<ol>' + lines.map(l => `<li>${inline(l.replace(/^\d+[.)]\s/, ''))}</li>`).join('') + '</ol>');
      else out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
    }
    return out.join('\n');
  }
  function mode(m) {
    $$('.adm-switch button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    const prev = m === 'preview';
    $('#bodyDrop').hidden = prev; $('#tools').hidden = prev; $('#preview').hidden = !prev;
    if (prev) {
      const v = values();
      $('#preview').innerHTML = `<h1 class="adm-ptitle">${esc(v.title || 'Без заглавие')}</h1>` + (render(v.body) || '<p class="muted">Още няма текст.</p>');
    }
  }
  $$('.adm-switch button').forEach(b => b.addEventListener('click', () => mode(b.dataset.mode)));

  /* ---------- Снимки ---------- */
  async function upload(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Изберете снимка във формат JPG, PNG или WebP.', 'bad'); return null; }
    if (file.size > 5 * 1024 * 1024) { toast('Снимката е над 5 MB. Намалете я и опитайте пак.', 'bad'); return null; }
    setState('Качване на снимката...');
    const r = await api('/api/admin/upload', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
    if (r.status !== 200) { setState(''); toast(r.data.error || 'Снимката не беше качена.', 'bad'); return null; }
    setState('Снимката е качена.', 'ok');
    return r.data.url;
  }
  function droppable(el, onFile) {
    ['dragenter', 'dragover'].forEach(t => el.addEventListener(t, e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('over'); } }));
    ['dragleave', 'drop'].forEach(t => el.addEventListener(t, () => el.classList.remove('over')));
    el.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); onFile(f); } });
  }
  const setCoverFile = async f => { const u = await upload(f); if (u) { setCover(u); changed(); } };
  $('#coverFile').addEventListener('change', e => { setCoverFile(e.target.files[0]); e.target.value = ''; });
  $('#coverBox').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#coverFile').click(); } });
  droppable($('#coverBox'), setCoverFile);
  $('#coverDel').addEventListener('click', () => { setCover(''); changed(); });
  const addBodyImg = async f => { const u = await upload(f); if (u) { put('\n\n![](' + u + ')\n\n'); toast('Снимката е добавена в текста.'); } };
  $('#bodyImg').addEventListener('change', e => { addBodyImg(e.target.files[0]); e.target.value = ''; });
  droppable($('#bodyDrop'), addBodyImg);
  ta.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])][0]; if (f && f.type.startsWith('image/')) { e.preventDefault(); addBodyImg(f); } });

  /* ---------- Бутони за оформление ---------- */
  function put(text, selFrom, selTo) {
    const s = ta.selectionStart;
    ta.setRangeText(text, s, ta.selectionEnd, 'end'); ta.focus();
    if (selFrom != null) { ta.selectionStart = s + selFrom; ta.selectionEnd = s + selTo; }
    changed();
  }
  function wrap(mark, ph) { const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || ph; put(mark + sel + mark, mark.length, mark.length + sel.length); }
  function lines(prefix, numbered) {
    let s = ta.selectionStart, e = ta.selectionEnd;
    s = ta.value.lastIndexOf('\n', s - 1) + 1;
    const nl = ta.value.indexOf('\n', e); e = nl < 0 ? ta.value.length : Math.max(e, nl);
    const block = ta.value.slice(s, e) || (numbered || prefix === '- ' ? 'първа точка' : 'текст');
    const out = block.split('\n').map((l, i) => (numbered ? (i + 1) + '. ' : prefix) + l.replace(/^(#{2,3}\s|[-•]\s|\d+[.)]\s|>\s)/, '')).join('\n');
    ta.setSelectionRange(s, e); ta.setRangeText(out, s, e, 'select'); ta.focus(); changed();
  }
  $$('[data-md]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.md;
    if (t === 'b') wrap('**', 'удебелен текст');
    else if (t === 'h2') lines('## ');
    else if (t === 'h3') lines('### ');
    else if (t === 'ul') lines('- ');
    else if (t === 'ol') lines('', true);
    else if (t === 'q') lines('> ');
    else if (t === 'img') $('#bodyImg').click();
    else if (t === 'a') {
      $('#lText').value = ta.value.slice(ta.selectionStart, ta.selectionEnd); $('#lUrl').value = '';
      $('#linkDlg').showModal(); ($('#lText').value ? $('#lUrl') : $('#lText')).focus();
    }
  }));
  $('#linkForm').addEventListener('submit', e => {
    e.preventDefault();
    let url = $('#lUrl').value.trim(); if (!/^(https?:\/\/|\/|mailto:|tel:)/.test(url)) url = 'https://' + url;
    $('#linkDlg').close(); put(`[${$('#lText').value.trim()}](${url})`);
  });
  $('[data-cancel]', $('#linkDlg')).addEventListener('click', () => $('#linkDlg').close());

  load();
})();
