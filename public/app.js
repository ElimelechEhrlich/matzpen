(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ils = (n, sign) => {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    const s = abs.toLocaleString('he-IL', { minimumFractionDigits: abs % 1 && abs < 1000 ? 2 : 0, maximumFractionDigits: abs < 1000 ? 2 : 0 });
    return (n < 0 ? '−' : sign && n > 0 ? '+' : '') + '₪' + s;
  };
  const dm = (iso) => { const [, m, d] = iso.split('-'); return `${+d}.${+m}`; };
  const daysFrom = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

  // ---------- state ----------
  let token = store.get('matzpen.token');
  let demo = new URLSearchParams(location.search).has('demo');
  let data = null;
  let providers = null;
  let view = 'overview';
  let txFilter = 'all';
  let accountsMode = { screen: 'list' }; // list | pick | form

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
  }

  async function api(path, opts = {}) {
    const r = await fetch('/api/' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== 'login') { logout(); throw new Error('נדרשת התחברות מחדש'); }
    if (!r.ok) throw new Error(j.error || 'שגיאה ' + r.status);
    return j;
  }

  // ---------- auth ----------
  function showLogin() { $('#loginScreen').hidden = false; $('#appScreen').hidden = true; $('#pw').focus(); }
  function logout() { token = null; store.set('matzpen.token', null); showLogin(); }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      const j = await api('login', { method: 'POST', body: { password: $('#pw').value } });
      token = j.token; store.set('matzpen.token', token); $('#pw').value = '';
      start();
    } catch (err) { $('#loginErr').textContent = err.message === 'Failed to fetch' ? 'אין חיבור לשרת' : err.message; }
  });
  $('#demoBtn').addEventListener('click', () => { demo = true; start(); });
  $('#exitDemo').addEventListener('click', () => { demo = false; data = null; token ? start() : showLogin(); });

  async function start() {
    $('#loginScreen').hidden = true; $('#appScreen').hidden = false;
    $('#demoTag').hidden = !demo;
    await load();
  }

  async function load() {
    if (demo) data = window.MATZPEN_DEMO;
    else {
      try { data = await api('dashboard'); } catch (e) {
        if (!token) return;
        $('#viewTitle').textContent = 'סקירה';
        document.querySelectorAll('.view').forEach((s) => (s.hidden = s.dataset.view !== 'overview'));
        $('[data-view="overview"]').innerHTML = `<div class="card empty-state"><h2>לא הצלחתי לטעון את הנתונים</h2><p>${esc(e.message === 'Failed to fetch' ? 'אין חיבור לאינטרנט או לשרת.' : e.message)}</p><div class="actions"><button class="btn primary" type="button" data-retry>נסה שוב</button><button class="btn ghost" type="button" data-logout>יציאה</button></div></div>`;
        return;
      }
    }
    render();
  }

  // ---------- nav ----------
  const ICONS = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    tx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    savings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3S9.5 10.5 12 11s4.5 1.3 4.5 3.2-2 3.3-4.5 3.3-4.5-1.4-4.5-3"/></svg>',
    accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/></svg>',
  };
  const VIEWS = [{ id: 'overview', label: 'סקירה' }, { id: 'tx', label: 'תנועות' }, { id: 'savings', label: 'חיסכון' }, { id: 'accounts', label: 'חשבונות' }];

  function renderNav() {
    const badge = (data?.alerts.length || 0) + (data?.duplicates.length || 0);
    const errs = (data?.connections || []).filter((c) => c.last_status === 'error').length;
    const html = VIEWS.map((v) => `<button type="button" data-go="${v.id}" ${v.id === view ? 'aria-current="page"' : ''}>${ICONS[v.id]}<span>${v.label}</span>${
      v.id === 'overview' && badge ? `<span class="badge">${badge}</span>` : v.id === 'accounts' && errs ? `<span class="badge">${errs}</span>` : v.id === 'savings' && data?.savings?.length ? `<span class="badge" style="background:var(--good)">${data.savings.length}</span>` : ''}</button>`).join('');
    $('#nav').innerHTML = html; $('#tabbar').innerHTML = html;
  }
  function go(id) {
    view = id;
    if (id === 'accounts') accountsMode = { screen: 'list' };
    document.querySelectorAll('.view').forEach((s) => (s.hidden = s.dataset.view !== id));
    $('#viewTitle').textContent = VIEWS.find((v) => v.id === id).label;
    renderNav(); renderView(); window.scrollTo({ top: 0 });
  }
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

  function render() {
    const d = new Date(data.today + 'T12:00:00Z');
    $('#todayLabel').textContent = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const errs = data.connections.filter((c) => c.last_status === 'error').length;
    $('#syncInfo').innerHTML = data.lastSync
      ? `<span><span class="dot" style="${errs ? 'background:var(--warn)' : ''}"></span>${errs ? `${errs} חיבורים דורשים טיפול` : 'כל החשבונות מסונכרנים'}</span><span>עדכון אחרון: ${new Date(data.lastSync).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>${demo ? '' : '<button class="linkish" type="button" data-sync>סנכרן עכשיו</button><button class="linkish" type="button" data-logout>יציאה</button>'}`
      : (demo ? '' : '<button class="linkish" type="button" data-logout>יציאה</button>');
    renderNav(); renderView();
  }
  function renderView() {
    if (!data) return;
    ({ overview: renderOverview, tx: renderTx, savings: renderSavings, accounts: renderAccounts })[view]();
  }

  // ---------- overview ----------
  function renderOverview() {
    const el = $('[data-view="overview"]');
    if (!data.hasData) {
      el.innerHTML = `<div class="card empty-state"><h2>עוד אין נתונים</h2><p>חבר חשבון בנק או כרטיס אשראי. הנתונים יופיעו כאן אחרי הסנכרון הראשון.</p><button class="btn primary" type="button" data-go="accounts">חיבור חשבון</button></div>`;
      return;
    }
    const fc = data.forecast;
    const a = data.alerts[0];
    let alertHTML = '';
    if (a) {
      const n = daysFrom(data.today, a.date);
      const when = n === 1 ? 'מחר' : n === 2 ? 'מחרתיים' : `ב־${dm(a.date)}`;
      const need = Math.ceil(a.shortfall / 50) * 50;
      alertHTML = `<div class="alert" id="alert"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></div>
        <div id="alertBody"><h2>${when} יורדים ${ils(-a.amount)}, ויש בעו״ש רק ${ils(a.balanceBefore)}</h2>
        <p>החיוב "${esc(a.label)}" ב־${dm(a.date)} יכניס את החשבון ל־${ils(a.balanceAfter)}. כדי להישאר ביתרה חיובית צריך להכניס לפחות ${ils(need)} עד ${dm(a.date)}.</p>
        <div class="math"><span>יתרה צפויה לפני החיוב<br><b class="num">${ils(a.balanceBefore)}</b></span><span>חיוב<br><b class="num">${ils(a.amount)}</b></span><span class="neg">אחרי החיוב<br><b class="num">${ils(a.balanceAfter)}</b></span></div>
        <div class="actions"><button class="btn primary" type="button" data-alert-done>טיפלתי בזה</button></div></div></div>`;
    }
    const minNeg = fc.low.balance < 0;
    el.innerHTML = `${alertHTML}
      <div class="stats">
        <div class="stat"><span class="label">יתרה בעו״ש</span><span class="value num">${ils(data.balance)}</span><span class="hint">${data.connections.filter((c) => c.kind === 'bank').length} חשבונות בנק</span></div>
        <div class="stat"><span class="label">נקודת השפל ב־${fc.days.length - 1} יום</span><span class="value num ${minNeg ? 'crit' : 'good'}">${ils(fc.low.balance)}</span><span class="hint">ב־${dm(fc.low.date)}</span></div>
        <div class="stat"><span class="label">חיובי אשראי שטרם ירדו</span><span class="value num">${ils(data.openCardCharges)}</span><span class="hint">${data.connections.filter((c) => c.kind === 'card').length} כרטיסים</span></div>
        <div class="stat"><span class="label">הוצאה יומית ממוצעת</span><span class="value num">${ils(fc.dailySpend)}</span><span class="hint">מחוץ לחיובים קבועים</span></div>
      </div>
      <div class="grid2">
        <div class="card"><div class="card-head"><h2>תחזית יתרה ל־${fc.days.length - 1} יום</h2><span class="sub">חיובים קבועים, חיובי אשראי והוצאה יומית ממוצעת</span></div>
          <div class="chart-wrap" id="chartWrap"><svg id="chart" viewBox="0 0 640 240" role="img" aria-label="תחזית יתרת העו״ש"></svg><div class="tip" id="tip"></div></div>
          <div class="legend"><span><i style="background:var(--accent)"></i>יתרה צפויה</span><span><i style="background:var(--crit)"></i>מתחת לאפס</span><span><i style="background:var(--muted)"></i>חיוב או הכנסה</span></div></div>
        <div class="card"><div class="card-head"><h2>צפוי בקרוב</h2><span class="sub">14 הימים הבאים</span></div><div class="list">${
          data.upcoming.length ? data.upcoming.map((u) => row(u.label, `${dm(u.date)} · ${u.kind === 'card' ? 'חיוב כרטיס' : 'חיוב קבוע'}`, u.amount)).join('') : '<div class="empty">לא זוהו חיובים צפויים בשבועיים הקרובים.</div>'}</div></div>
      </div>
      <div class="card"><div class="card-head"><h2>חיובים שנראים כפולים</h2><span class="sub">${data.duplicates.length ? `${data.duplicates.length} לבדיקה · ${ils(data.duplicates.reduce((s, d) => s + d.amount, 0))}` : ''}</span></div><div id="dups">${dupsHTML()}</div></div>
      ${(data.savings || []).length ? `<div class="card"><div class="card-head"><h2>אפשר לחסוך</h2><button class="btn ghost" type="button" data-go="savings">לכל ההצעות</button></div>
        <div class="savings-total"><span class="big num">${ils(data.savings.reduce((s, x) => s + x.yearlySave, 0))}</span><span style="color:var(--muted)">בשנה</span></div>
        <div class="list">${data.savings.slice(0, 4).map((x) => `<div class="row"><div class="ic">${esc(x.name[0])}</div><div style="min-width:0"><div class="t">${esc(x.name)}</div><div class="s">${esc(x.merchants[0] || '')} · היום ${ils(x.monthly)} לחודש</div></div><div class="amt num in">${ils(x.yearlySave)}</div></div>`).join('')}</div></div>` : ''}`;
    drawChart();
  }

  const row = (title, sub, amount, extra = '') => `<div class="row"><div class="ic">${esc(String(title).trim()[0] || '·')}</div><div style="min-width:0"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}${extra}</div></div><div class="amt num ${amount > 0 ? 'in' : 'out'}">${ils(amount, true)}</div></div>`;
  const srcName = (t) => { const c = data.connections.find((x) => x.provider === t.provider); return `${c?.providerName || t.provider}${t.accountNumber ? ' ·· ' + String(t.accountNumber).slice(-4) : ''}`; };

  function dupsHTML() {
    if (!data.duplicates.length) return '<div class="empty">לא נמצאו חיובים כפולים. הבדיקה רצה בכל סנכרון.</div>';
    return data.duplicates.map((d) => `<div class="dup" data-key="${esc(d.key)}">
      <div class="head"><strong>${esc(d.description)}</strong><span class="num" style="font-weight:600">${ils(d.amount)}</span></div>
      <div style="color:var(--muted);font-size:13px">${esc(d.reason)}</div>
      <div class="pair"><div><b>${esc(srcName(d.a))}</b>${dm(d.a.date)}</div><div><b>${esc(srcName(d.b))}</b>${dm(d.b.date)}</div></div>
      <div class="actions"><button class="btn primary" type="button" data-dispute>נוסח פנייה לבירור</button><button class="btn ghost" type="button" data-dismiss>זה בסדר</button></div>
    </div>`).join('');
  }

  document.addEventListener('click', async (e) => {
    const card = e.target.closest('.dup');
    if (card && e.target.closest('[data-dismiss]')) {
      const key = card.dataset.key;
      try { if (!demo) await api('dismiss', { method: 'POST', body: { key } }); data.duplicates = data.duplicates.filter((d) => d.key !== key); $('#dups').innerHTML = dupsHTML(); renderNav(); toast('סומן כתקין'); }
      catch (err) { toast(err.message); }
    }
    if (card && e.target.closest('[data-dispute]')) {
      const d = data.duplicates.find((x) => x.key === card.dataset.key);
      const text = `שלום,\nבכרטיס ${srcName(d.b)} מופיע חיוב כפול לבית העסק "${d.description}" על סך ${ils(d.amount)}, בתאריכים ${dm(d.a.date)} ו־${dm(d.b.date)}.\nאבקש לבדוק ולזכות את החיוב הכפול.\nתודה`;
      card.querySelector('.actions').innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;width:100%"><div class="copybox">${esc(text)}</div><div class="actions"><button class="btn" type="button" data-copy>העתק</button></div></div>`;
      card.querySelector('[data-copy]').addEventListener('click', () => navigator.clipboard.writeText(text).then(() => toast('הועתק'), () => toast('סמן את הטקסט והעתק ידנית')));
    }
    if (e.target.closest('[data-alert-done]')) { $('#alertBody').innerHTML = '<h2>מעולה</h2><p style="margin:4px 0 0">התחזית תתעדכן בסנכרון הבא.</p>'; }
    if (e.target.closest('[data-logout]')) logout();
    if (e.target.closest('[data-retry]')) load();
    if (e.target.closest('[data-sync]')) {
      try { const r = await api('sync', { method: 'POST', body: {} }); toast(r.started ? 'הסנכרון התחיל. זה לוקח כמה דקות.' : r.reason); } catch (err) { toast(err.message); }
    }
  });

  // ---------- chart ----------
  function drawChart() {
    const svg = $('#chart'); if (!svg) return;
    const W = 640, H = 240, P = { l: 12, r: 58, t: 16, b: 30 };
    const days = data.forecast.days, N = days.length - 1;
    const vals = days.map((x) => x.balance);
    const span = Math.max(...vals, 0) - Math.min(...vals, 0) || 1000;
    const step = [500, 1000, 2000, 5000, 10000, 20000, 50000].find((s) => span / s <= 6) || 100000;
    const lo = Math.floor(Math.min(0, ...vals) / step) * step, hi = Math.ceil(Math.max(0, ...vals) / step) * step || step;
    const X = (i) => W - P.r - (i / N) * (W - P.l - P.r);
    const Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const k = (v) => (v === 0 ? '0' : (v < 0 ? '−' : '') + (Math.abs(v) >= 1000 ? Math.abs(v) / 1000 + 'K' : Math.abs(v)));
    let g = '';
    for (let v = lo; v <= hi; v += step) {
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="${v === 0 ? 1.5 : 1}" ${v === 0 ? '' : 'stroke-dasharray="2 4"'}/>`;
      g += `<text x="${W - P.r + 8}" y="${Y(v) + 4}" font-size="11" fill="var(--muted)" direction="ltr" style="unicode-bidi:plaintext">${k(v)}</text>`;
    }
    for (let i = 0; i <= N; i += 7) g += `<text x="${X(i)}" y="${H - 8}" font-size="11" fill="var(--muted)" text-anchor="middle">${i === 0 ? 'היום' : dm(days[i].date)}</text>`;
    let path = '';
    days.forEach((x, i) => { path += i === 0 ? `M${X(0)},${Y(x.balance)}` : ` H${X(i)} V${Y(x.balance)}`; });
    const area = path + ` H${X(N)} V${Y(lo)} H${X(0)} Z`, zy = Y(0);
    g += `<defs><linearGradient id="fillG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>
      <clipPath id="above"><rect x="0" y="0" width="${W}" height="${zy}"/></clipPath><clipPath id="below"><rect x="0" y="${zy}" width="${W}" height="${H}"/></clipPath></defs>
      <path d="${area}" fill="url(#fillG)" clip-path="url(#above)"/><path d="${area}" fill="var(--crit)" fill-opacity=".14" clip-path="url(#below)"/>
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" clip-path="url(#above)"/>
      <path d="${path}" fill="none" stroke="var(--crit)" stroke-width="2.4" stroke-linejoin="round" clip-path="url(#below)"/>`;
    days.forEach((x, i) => { if (x.events.length) g += `<circle cx="${X(i)}" cy="${Y(x.balance)}" r="3.5" fill="var(--surface)" stroke="var(--muted)" stroke-width="1.6"/>`; });
    const li = days.indexOf(data.forecast.low) >= 0 ? days.indexOf(data.forecast.low) : days.findIndex((x) => x.date === data.forecast.low.date);
    g += `<circle cx="${X(li)}" cy="${Y(days[li].balance)}" r="5" fill="${days[li].balance < 0 ? 'var(--crit)' : 'var(--accent)'}" stroke="var(--surface)" stroke-width="2"/>`;
    g += `<line id="hair" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" stroke="var(--muted)" opacity="0"/><rect id="hit" x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/>`;
    svg.innerHTML = g;
    const tip = $('#tip'), hair = $('#hair');
    $('#hit').addEventListener('pointermove', (ev) => {
      const r = svg.getBoundingClientRect(); const sx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(N, Math.round(((W - P.r - sx) / (W - P.l - P.r)) * N)));
      const x = days[i];
      hair.setAttribute('x1', X(i)); hair.setAttribute('x2', X(i)); hair.setAttribute('opacity', 0.5);
      tip.innerHTML = `${dm(x.date)} · <span class="num">${ils(x.balance)}</span>${x.events.map((e) => `<br>${esc(e.label)} <span class="num">${ils(e.amount, true)}</span>`).join('')}`;
      const px = (X(i) / W) * r.width;
      tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth) + 'px';
      tip.style.top = (Y(x.balance) / H) * r.height + 'px'; tip.style.transform = 'translateY(-115%)'; tip.style.opacity = 1;
    });
    $('#hit').addEventListener('pointerleave', () => { tip.style.opacity = 0; hair.setAttribute('opacity', 0); });
  }

  // ---------- transactions ----------
  function renderTx() {
    const dupIds = new Set(data.duplicates.flatMap((d) => [d.a.id, d.b.id]));
    const chips = [['all', 'הכל'], ['dup', 'חשד לכפל'], ['out', 'הוצאות'], ['in', 'הכנסות'], ['bank', 'בנק'], ['card', 'אשראי']];
    $('#txChips').innerHTML = chips.map(([k, l]) => `<button type="button" class="chip" data-txf="${k}" aria-pressed="${k === txFilter}">${l}</button>`).join('');
    const list = data.recent.filter((t) => txFilter === 'all' || (txFilter === 'dup' ? dupIds.has(t.id) : txFilter === 'out' ? t.chargedAmount < 0 : txFilter === 'in' ? t.chargedAmount > 0 : t.kind === txFilter));
    $('#txList').innerHTML = list.map((t) => row(t.description, `${srcName(t)} · ${dm(t.date)}${t.status === 'pending' ? ' · ממתין' : ''}${t.installments ? ` · תשלום ${t.installments.number}/${t.installments.total}` : ''}`, t.chargedAmount,
      dupIds.has(t.id) ? ' <span class="pill crit">חשד לכפל</span>' : '')).join('') || '<div class="empty">אין תנועות להצגה.</div>';
  }
  document.addEventListener('click', (e) => { const c = e.target.closest('[data-txf]'); if (c) { txFilter = c.dataset.txf; renderTx(); } });

  // ---------- recurring ----------
  function renderSavings() {
    const el = $('[data-view="savings"]');
    const sv = data.savings || [];
    const subs = data.subscriptions;
    const total = sv.reduce((s, x) => s + x.yearlySave, 0);
    const dealsLine = data.dealsUpdatedAt
      ? `מבצעים עדכניים נבדקו ב־${new Date(data.dealsUpdatedAt).toLocaleDateString('he-IL')}`
      : 'המחירים להשוואה הם הערכה. כדי לקבל מבצעים עדכניים מהרשת כל שבוע, הוסף ANTHROPIC_API_KEY (ראה README).';
    const card = (s) => `<div class="offer" data-saving="${s.id}">
      <span class="cat">${esc(s.name)}</span>
      <h3>${esc(s.merchants.join(' · '))}</h3>
      <div class="compare"><div>היום<b class="num">${ils(s.monthly)}</b>לחודש</div><span class="arrow">←</span><div>אפשרי<b class="num">${ils(s.target)}</b>לחודש</div></div>
      <p>${esc(s.tip)}</p>
      <p style="font-size:12.5px">${esc(s.basis)}</p>
      ${s.units ? `<div class="field" style="flex-direction:row;align-items:center;gap:8px"><label for="u_${s.id}" style="margin:0">מספר ${esc(s.units.label)} בחיוב:</label><input id="u_${s.id}" type="number" min="1" max="19" value="${s.units.value}" style="width:72px" data-units="${s.id}"></div>` : ''}
      ${s.deals.length ? `<div class="list">${s.deals.map((d) => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><div class="t" style="white-space:normal">${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${esc(d.provider)} · ${esc(d.plan)}</a>` : `${esc(d.provider)} · ${esc(d.plan)}`}</div><div class="s">${esc(d.details)}</div></div><div class="amt num">${esc(d.price)} ${esc(d.unit)}</div></div>`).join('')}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span class="save">חיסכון של כ־<span class="num">${ils(s.yearlySave)}</span> בשנה</span><button class="btn ghost" type="button" data-saving-dismiss>לא רלוונטי</button></div>
    </div>`;
    el.innerHTML = `<div class="card">
        <div class="savings-total"><span class="big num">${ils(total)}</span><span style="color:var(--muted)">חיסכון שנתי אפשרי${sv.length ? ` מ־${sv.length} הצעות` : ''}</span></div>
        ${sv.length ? `<div class="offers">${sv.map(card).join('')}</div>` : '<div class="empty">לא נמצאו חיובים יקרים מהמקובל. הבדיקה מתעדכנת בכל סנכרון.</div>'}
        <p style="color:var(--muted);font-size:12.5px;margin:14px 0 0">${esc(dealsLine)}</p>
      </div>
      <div class="card"><div class="card-head"><h2>כל החיובים הקבועים</h2><span class="sub num">${ils(subs.reduce((s, x) => s + x.yearly, 0))} בשנה</span></div>
        <div class="list">${subs.map((s) => row(s.description, `${s.kind === 'card' ? 'בכרטיס' : 'בבנק'} · בערך ב־${s.dayOfMonth} לחודש · ${ils(s.yearly)} בשנה`, s.amount)).join('') || '<div class="empty">החיובים הקבועים יזוהו אחרי 3 חודשים של נתונים.</div>'}</div>
      </div>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-saving-dismiss]'); if (!b) return;
    const id = b.closest('[data-saving]').dataset.saving;
    try { if (!demo) await api('dismiss', { method: 'POST', body: { key: 'saving:' + id } }); data.savings = data.savings.filter((s) => s.id !== id); renderSavings(); toast('ההצעה הוסתרה'); } catch (err) { toast(err.message); }
  });
  document.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-units]'); if (!inp) return;
    const v = Math.max(1, Math.min(19, Math.round(Number(inp.value) || 1)));
    if (demo) { const s = data.savings.find((x) => x.id === inp.dataset.units); const per = s.target / s.units.value; s.units.value = v; s.target = Math.round(per * v); s.yearlySave = Math.max(0, (s.monthly - s.target) * 12); renderSavings(); return; }
    try { const cur = (await api('settings')).settings.savingsUnits || {}; await api('settings', { method: 'POST', body: { savingsUnits: { ...cur, [inp.dataset.units]: v } } }); await load(); } catch (err) { toast(err.message); }
  });

  // ---------- accounts ----------
  async function ensureProviders() {
    if (providers) return providers;
    try { providers = (await api('providers')).providers; } catch { providers = []; }
    return providers;
  }

  async function renderAccounts() {
    const el = $('[data-view="accounts"]');
    if (accountsMode.screen === 'pick') {
      const list = await ensureProviders();
      const group = (kind, title) => `<div class="group-title">${title}</div><div class="providers">${list.filter((p) => p.kind === kind).map((p) => `<button type="button" class="prov" data-prov="${p.id}"><b>${esc(p.name)}</b><span>${p.fields.length} שדות התחברות${p.note ? ' · ' + esc(p.note) : ''}</span></button>`).join('')}</div>`;
      el.innerHTML = `<div class="card"><div class="card-head"><h2>מה לחבר?</h2><button class="btn ghost" type="button" data-acc-back>ביטול</button></div>
        ${list.length ? group('bank', 'בנקים') + group('card', 'כרטיסי אשראי ומועדונים') : '<div class="empty">לא ניתן לטעון את רשימת הספקים. בדוק את החיבור לשרת.</div>'}</div>`;
      return;
    }
    if (accountsMode.screen === 'form') {
      const list = await ensureProviders();
      const p = list.find((x) => x.id === accountsMode.provider);
      const c = accountsMode.edit ? data.connections.find((x) => x.id === accountsMode.edit) : null;
      el.innerHTML = `<div class="card"><form class="sheet" id="connForm" autocomplete="off">
        <div class="card-head" style="margin:0"><h2>${c ? 'עדכון פרטי התחברות' : 'חיבור'} · ${esc(p.name)}</h2><button class="btn ghost" type="button" data-acc-back>ביטול</button></div>
        <div class="field"><label for="f_label">שם לתצוגה</label><input id="f_label" value="${esc(c?.label || p.name)}" maxlength="60"></div>
        ${p.fields.map((f) => `<div class="field"><label for="f_${f.key}">${esc(f.label)}</label><input id="f_${f.key}" name="${f.key}" type="${f.secret ? 'password' : 'text'}" ${f.key === 'card6Digits' ? 'inputmode="numeric" maxlength="6"' : ''} autocomplete="off" required></div>`).join('')}
        <div class="note">הפרטים נשמרים מוצפנים (AES-256) ומשמשים רק לקריאת תנועות. האפליקציה לא יכולה לבצע העברות.</div>
        <div class="err" id="connErr"></div>
        <button class="btn primary" type="submit">${c ? 'שמירה' : 'חיבור וסנכרון'}</button></form></div>`;
      $('#connForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const credentials = Object.fromEntries(p.fields.map((f) => [f.key, $('#f_' + f.key).value]));
        const label = $('#f_label').value;
        if (demo) { toast('במצב דוגמה לא שומרים חיבורים'); return; }
        const btn = e.submitter; btn.disabled = true;
        try {
          if (c) { await api('connections?id=' + c.id, { method: 'PATCH', body: { label, credentials } }); toast('הפרטים עודכנו. הם ישמשו בסנכרון הבא.'); }
          else { const r = await api('connections', { method: 'POST', body: { provider: p.id, label, credentials } }); toast(r.sync?.started ? 'החשבון חובר. הסנכרון הראשון התחיל ולוקח כמה דקות.' : 'החשבון חובר. הנתונים ימשכו בסנכרון היומי.'); }
          accountsMode = { screen: 'list' }; await load();
        } catch (err) { $('#connErr').textContent = err.message; btn.disabled = false; }
      });
      return;
    }
    const st = (c) => !c.enabled ? '<span class="pill neutral">מושהה</span>' : c.last_status === 'error' ? '<span class="pill crit">שגיאה</span>' : c.last_status === 'ok' ? '<span class="pill good">מחובר</span>' : '<span class="pill warn">ממתין לסנכרון ראשון</span>';
    el.innerHTML = `<div class="accounts">${data.connections.map((c) => {
      const bal = c.accounts.map((a) => a.balance).filter((b) => b != null);
      return `<div class="acct"><span class="kind">${c.kind === 'card' ? 'כרטיס אשראי' : 'בנק'} · ${esc(c.providerName)}</span><span class="name">${esc(c.label)}</span>
        ${bal.length ? `<span class="bal num">${ils(bal.reduce((s, b) => s + b, 0))}</span>` : ''}
        <div class="meta"><span>${c.accounts.length ? c.accounts.map((a) => '·· ' + esc(String(a.accountNumber).replace(/\D/g, '').slice(-4))).join(', ') : ''}</span>${st(c)}</div>
        ${c.last_status === 'error' ? `<span class="error">${esc(c.last_error)}</span>` : ''}
        <div class="actions"><button class="btn" type="button" data-acc-edit="${c.id}">עדכון סיסמה</button><button class="btn" type="button" data-acc-toggle="${c.id}">${c.enabled ? 'השהיה' : 'הפעלה'}</button><button class="btn ghost" type="button" data-acc-del="${c.id}">מחיקה</button></div></div>`;
    }).join('')}<button class="acct add" type="button" data-acc-add>+ חיבור בנק או כרטיס אשראי</button></div>
    ${demo ? '' : `<div class="card"><div class="card-head"><h2>הגדרות</h2></div><form class="settings-row" id="setForm">
      <div class="field"><label for="s_thr">התראה כשהיתרה הצפויה יורדת מתחת ל־(₪)</label><input id="s_thr" type="number" step="100" value="0"></div>
      <div class="field"><label for="s_days">ימי תחזית</label><input id="s_days" type="number" min="7" max="90" value="${data.forecast.days.length - 1}"></div>
      <button class="btn primary" type="submit">שמירה</button></form></div>`}`;
    const sf = $('#setForm');
    if (sf) {
      api('settings').then((r) => { $('#s_thr').value = r.settings.lowBalanceThreshold; }).catch(() => {});
      sf.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api('settings', { method: 'POST', body: { lowBalanceThreshold: Number($('#s_thr').value) || 0, forecastDays: Number($('#s_days').value) || 30 } }); toast('נשמר'); await load(); } catch (err) { toast(err.message); }
      });
    }
  }

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-acc-add]')) { accountsMode = { screen: 'pick' }; renderAccounts(); }
    else if (t.closest('[data-acc-back]')) { accountsMode = { screen: 'list' }; renderAccounts(); }
    else if (t.closest('[data-prov]')) { accountsMode = { screen: 'form', provider: t.closest('[data-prov]').dataset.prov }; renderAccounts(); }
    else if (t.closest('[data-acc-edit]')) { const c = data.connections.find((x) => x.id === +t.closest('[data-acc-edit]').dataset.accEdit); accountsMode = { screen: 'form', provider: c.provider, edit: c.id }; renderAccounts(); }
    else if (t.closest('[data-acc-toggle]')) {
      const c = data.connections.find((x) => x.id === +t.closest('[data-acc-toggle]').dataset.accToggle);
      if (demo) { c.enabled = !c.enabled; renderAccounts(); return; }
      try { await api('connections?id=' + c.id, { method: 'PATCH', body: { enabled: !c.enabled } }); await load(); } catch (err) { toast(err.message); }
    } else if (t.closest('[data-acc-del]')) {
      const b = t.closest('[data-acc-del]');
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'למחוק? כל התנועות יימחקו'; b.classList.remove('ghost'); b.style.color = 'var(--crit)'; return; }
      const id = +b.dataset.accDel;
      if (demo) { data.connections = data.connections.filter((x) => x.id !== id); renderAccounts(); return; }
      try { await api('connections?id=' + id, { method: 'DELETE' }); toast('החיבור נמחק'); await load(); } catch (err) { toast(err.message); }
    }
  });

  // ---------- boot ----------
  if (demo || token) start(); else showLogin();
})();
