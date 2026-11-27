(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();

  /* Меню и хедър */
  const header = $('.site-header');
  const menuBtn = $('#menuBtn');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  menuBtn.addEventListener('click', () => {
    const open = header.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  $$('#navLinks a').forEach(a => a.addEventListener('click', () => {
    header.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', false);
  }));


  /* Плаваща лента: появява се след скрол, пулсира след няколко секунди */
  const dock = $('#dock');
  if (dock) {
    let closed = false, pulseT = null;
    try { closed = sessionStorage.getItem('dockClosed') === '1'; } catch {}
    dock.hidden = false; dock.classList.add('away');
    const show = () => {
      if (closed) return;
      const want = window.scrollY > 420;
      dock.classList.toggle('away', !want);
      if (want && !pulseT && !dock.classList.contains('pulse')) pulseT = setTimeout(() => dock.classList.add('pulse'), 4000);
      if (!want) { clearTimeout(pulseT); pulseT = null; dock.classList.remove('pulse'); }
    };
    window.addEventListener('scroll', show, { passive: true }); show();
    $('#dockClose').addEventListener('click', () => {
      closed = true; dock.classList.add('away'); clearTimeout(pulseT);
      try { sessionStorage.setItem('dockClosed', '1'); } catch {}
    });
  }

  /* Активна връзка в менюто */
  const links = $$('.nav-links a[href^="#"]');
  const secs = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(s => io.observe(s));
  }

  /* Поява при скрол: скриваме само елементите под екрана */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    const vh = innerHeight;
    const pending = $$('.rv').filter(el => el.getBoundingClientRect().top > vh * 0.92);
    pending.forEach(el => el.classList.add('pre'));
    const ro = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.remove('pre'); ro.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    pending.forEach(el => ro.observe(el));
    setTimeout(() => pending.forEach(el => el.classList.remove('pre')), 6000);
  }

  /* Светлина след курсора върху услугите */
  $$('.svc').forEach(c => c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }));

  /* Клик върху услуга избира темата на срещата */
  const serviceSel = $('#b-service');
  $$('[data-service]').forEach(a => a.addEventListener('click', () => { serviceSel.value = a.dataset.service; }));

  /* API помощник. Без сървър (статичен преглед) работи в демо режим. */
  async function api(path, opts) {
    try {
      const res = await fetch(path, opts);
      const type = res.headers.get('content-type') || '';
      if (!type.includes('application/json')) return { demo: true };
      return { status: res.status, data: await res.json() };
    } catch { return { demo: true }; }
  }

  /* Дата и свободни часове */
  const SLOTS = ['09:30', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];
  const dateIn = $('#b-date'), slotsBox = $('#slots'), slotMsg = $('#slotMsg');
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const isWeekend = s => { const d = new Date(s + 'T12:00:00'); return d.getDay() === 0 || d.getDay() === 6; };
  const nextWorkday = () => { const d = new Date(); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); return d; };
  const min = nextWorkday(); const max = new Date(); max.setDate(max.getDate() + 60);
  dateIn.min = iso(min); dateIn.max = iso(max); dateIn.value = iso(min);

  async function loadSlots() {
    slotsBox.innerHTML = ''; slotMsg.textContent = '';
    const v = dateIn.value;
    if (!v) return;
    if (isWeekend(v)) { slotsBox.innerHTML = '<span class="slots-empty">Срещи се провеждат от понеделник до петък.</span>'; return; }
    let taken = [];
    const r = await api('/api/slots?date=' + encodeURIComponent(v));
    if (r.demo) { const n = +v.slice(-2); taken = [SLOTS[n % SLOTS.length], SLOTS[(n + 3) % SLOTS.length]]; }
    else if (r.status === 200) taken = r.data.taken || [];
    let firstFree = true;
    SLOTS.forEach(t => {
      const busy = taken.includes(t);
      const lab = document.createElement('label'); lab.className = 'slot';
      const inp = document.createElement('input');
      inp.type = 'radio'; inp.name = 'time'; inp.value = t; inp.disabled = busy;
      if (!busy && firstFree) { inp.checked = true; firstFree = false; }
      const sp = document.createElement('span'); sp.textContent = t;
      if (busy) lab.title = 'Зает час';
      lab.append(inp, sp); slotsBox.appendChild(lab);
    });
  }
  dateIn.addEventListener('change', loadSlots);
  loadSlots();

  /* Валидация (същите правила проверява и сървърът) */
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const phoneRe = /^[+\d][\d\s()-]{6,20}$/;
  function showStatus(form, kind, text) {
    const s = $('.status', form); s.hidden = false; s.className = 'status ' + kind; s.textContent = text;
  }
  function validate(form) {
    let ok = true;
    $('.status', form).hidden = true;
    $$('.field', form).forEach(f => { f.classList.remove('err'); const m = $('.msg', f); if (m) m.textContent = ''; });
    const fail = (el, msg) => { ok = false; const f = el.closest('.field'); if (f) { f.classList.add('err'); const m = $('.msg', f); if (m) m.textContent = msg; } };
    $$('input,select,textarea', form).forEach(el => {
      if (el.name === 'website' || el.type === 'radio' || el.type === 'checkbox') return;
      const v = el.value.trim();
      if (el.required && !v) return fail(el, 'Попълнете това поле.');
      if (v && el.type === 'email' && !emailRe.test(v)) return fail(el, 'Проверете имейл адреса.');
      if (v && el.type === 'tel' && !phoneRe.test(v)) return fail(el, 'Проверете телефонния номер.');
    });
    if (form.id === 'bookingForm') {
      if (dateIn.value && isWeekend(dateIn.value)) fail(dateIn, 'Изберете работен ден.');
      if (!form.querySelector('input[name="time"]:checked')) { ok = false; slotMsg.textContent = 'Изберете час.'; }
    }
    const consent = form.querySelector('input[name="consent"]');
    if (ok && consent && !consent.checked) { ok = false; showStatus(form, 'bad', 'Потвърдете съгласието си, за да изпратим заявката.'); }
    return ok;
  }

  async function submit(form, path, okText) {
    if (!validate(form)) { const e = $('.err input,.err select,.err textarea', form); if (e) e.focus(); return; }
    const btn = $('button[type="submit"]', form); btn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    data.consent = !!data.consent;
    const r = await api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    btn.disabled = false;
    if (r.demo) return showStatus(form, 'ok', 'Демо версия: заявката не е изпратена. На живия сайт тук клиентът получава потвърждение.');
    if (r.status === 200 && r.data.ok) {
      showStatus(form, 'ok', okText); form.reset();
      if (form.id === 'bookingForm') { dateIn.value = iso(min); loadSlots(); }
      return;
    }
    if (r.status === 400 && r.data.errors) {
      Object.entries(r.data.errors).forEach(([k, msg]) => {
        const el = form.elements[k];
        const f = el && el.closest ? el.closest('.field') : null;
        if (f) { f.classList.add('err'); $('.msg', f).textContent = msg; }
      });
      return showStatus(form, 'bad', 'Проверете отбелязаните полета.');
    }
    if (r.status === 409) { loadSlots(); return showStatus(form, 'bad', 'Този час току-що беше зает. Изберете друг.'); }
    if (r.status === 429) return showStatus(form, 'bad', 'Изпратихте много заявки за кратко време. Опитайте отново след няколко минути.');
    showStatus(form, 'bad', 'Заявката не беше изпратена. Обадете се на +359 894 097 779 или опитайте отново.');
  }
  $('#bookingForm').addEventListener('submit', e => { e.preventDefault(); submit(e.target, '/api/booking', 'Благодарим! Получихме заявката ви и ще потвърдим часа по имейл.'); });
  $('#contactForm').addEventListener('submit', e => { e.preventDefault(); submit(e.target, '/api/contact', 'Благодарим! Ще ви отговорим до един работен ден.'); });
})();
