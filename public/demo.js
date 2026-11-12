// Sample data in the same shape as GET /api/dashboard, for the demo mode.
window.MATZPEN_DEMO = (() => {
  const iso = (d) => d.toISOString().slice(0, 10);
  const t0 = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()) + 'T00:00:00Z');
  const day = (n) => { const d = new Date(t0); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

  const ev = { 1: [['ארנונה', -1000, 'recurring']], 3: [['משכורת', 9200, 'recurring']], 5: [['שכר דירה', -3400, 'recurring']], 8: [['חברת החשמל', -410, 'recurring']],
    12: [['ביטוח רכב', -650, 'recurring']], 20: [['חיוב מקס ·· 9032', -1940, 'card'], ['חיוב ישראכרט ·· 2281', -615, 'card']], 22: [['ועד בית', -180, 'recurring']], 28: [['חיוב כאל ·· 4417', -2860, 'card']] };
  const daily = 85;
  let bal = 500;
  const days = [];
  for (let i = 0; i <= 30; i++) {
    const events = (i ? ev[i] || [] : []).map(([label, amount, kind]) => ({ label, amount, kind }));
    if (i) bal -= daily;
    events.forEach((e) => (bal += e.amount));
    days.push({ date: day(i), balance: bal, events });
  }
  const low = days.reduce((m, x) => (x.balance < m.balance ? x : m), days[0]);

  let id = 0;
  const tx = (d, description, amount, provider, kind, acc, extra = {}) => ({ id: ++id, date: day(d), description, chargedAmount: amount, provider, kind, accountNumber: acc, type: 'normal', status: 'completed', ...extra });
  const recent = [
    tx(-1, 'סופר השכונה', -312.5, 'visaCal', 'card', '4417'), tx(-1, 'סופר השכונה', -312.5, 'visaCal', 'card', '4417'),
    tx(-1, 'תחנת דלק', -265, 'max', 'card', '9032'), tx(-2, 'בית מרקחת', -78.9, 'isracard', 'card', '2281'),
    tx(-2, 'החזר מס הכנסה', 1240, 'hapoalim', 'bank', '12-345'), tx(-3, 'מסעדה', -186, 'visaCal', 'card', '4417'),
    tx(-3, 'חניון עירוני', -18, 'isracard', 'card', '2281'), tx(-3, 'חניון עירוני', -18, 'isracard', 'card', '2281'),
    tx(-4, 'חברת סלולר', -178, 'max', 'card', '9032'), tx(-7, 'מנוי סטרימינג מוזיקה', -21.9, 'visaCal', 'card', '4417'),
    tx(-9, 'מנוי סטרימינג מוזיקה', -21.9, 'max', 'card', '9032'), tx(-10, 'חנות בגדים', -349, 'visaCal', 'card', '4417'),
    tx(-11, 'העברה מאמא', 500, 'hapoalim', 'bank', '12-345'),
  ];
  const dup = (a, b, reason) => ({ key: a.id + '~' + b.id, description: a.description, amount: -a.chargedAmount, reason, a, b });

  return {
    demo: true,
    today: day(0),
    hasData: true,
    balance: 500,
    openCardCharges: -5415,
    forecast: { days, low, dailySpend: daily },
    alerts: [{ severity: 'critical', date: day(1), label: 'ארנונה', amount: -1000, balanceBefore: 500, balanceAfter: -585, shortfall: 585 }],
    duplicates: [
      dup(recent[0], recent[1], 'אותו סכום ואותו בית עסק, באותו יום'),
      dup(recent[9], recent[10], 'אותו חיוב בשני אמצעי תשלום באותו חודש'),
      dup(recent[6], recent[7], 'אותו סכום ואותו בית עסק, באותו יום'),
    ],
    upcoming: days.slice(1, 15).flatMap((d) => d.events.map((e) => ({ date: d.date, ...e }))),
    subscriptions: [
      { description: 'שכר דירה', kind: 'bank', amount: -3400, dayOfMonth: 17, yearly: 40800 },
      { description: 'ארנונה', kind: 'bank', amount: -1000, dayOfMonth: 13, yearly: 12000 },
      { description: 'חברת סלולר', kind: 'card', provider: 'max', amount: -178, dayOfMonth: 8, yearly: 2136 },
      { description: 'חבילת טלוויזיה', kind: 'card', provider: 'visaCal', amount: -119, dayOfMonth: 1, yearly: 1428 },
      { description: 'עמלות ניהול חשבון', kind: 'bank', amount: -31, dayOfMonth: 1, yearly: 372 },
      { description: 'מנוי סטרימינג מוזיקה', kind: 'card', provider: 'visaCal', amount: -21.9, dayOfMonth: 5, yearly: 263 },
    ],
    recent,
    connections: [
      { id: 1, provider: 'hapoalim', providerName: 'בנק הפועלים', kind: 'bank', label: 'עו״ש משפחתי', enabled: true, last_status: 'ok', last_sync_at: day(0) + 'T04:00:00Z', accounts: [{ accountNumber: '12-345', balance: 500 }] },
      { id: 2, provider: 'visaCal', providerName: 'כאל', kind: 'card', label: 'כאל', enabled: true, last_status: 'ok', last_sync_at: day(0) + 'T04:01:00Z', accounts: [{ accountNumber: '4417', balance: null }] },
      { id: 3, provider: 'max', providerName: 'מקס', kind: 'card', label: 'מקס', enabled: true, last_status: 'ok', last_sync_at: day(0) + 'T04:02:00Z', accounts: [{ accountNumber: '9032', balance: null }] },
      { id: 4, provider: 'isracard', providerName: 'ישראכרט', kind: 'card', label: 'ישראכרט', enabled: true, last_status: 'error', last_error: 'פרטי ההתחברות שגויים', last_sync_at: day(0) + 'T04:03:00Z', accounts: [{ accountNumber: '2281', balance: null }] },
    ],
    lastSync: day(0) + 'T04:03:00Z',
  };
})();
