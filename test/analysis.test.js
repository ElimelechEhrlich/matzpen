import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicates, detectRecurring, forecast, balanceAlerts, upcomingCardBills, estimateDailySpend } from '../lib/analysis.js';

let n = 0;
const tx = (o) => ({ id: ++n, kind: 'card', provider: 'visaCal', accountNumber: '4417', type: 'normal', status: 'completed', ...o });

test('flags the same charge twice on one card within a few days', () => {
  const list = [
    tx({ date: '2026-11-11', description: 'סופר השכונה', chargedAmount: -312.5 }),
    tx({ date: '2026-11-11', description: 'סופר השכונה', chargedAmount: -312.5 }),
    tx({ date: '2026-11-11', description: 'סופר השכונה', chargedAmount: -40 }),
  ];
  const d = findDuplicates(list, { today: '2026-11-12' });
  assert.equal(d.length, 1);
  assert.equal(d[0].amount, 312.5);
});

test('flags a subscription paid on two different cards in the same month', () => {
  const list = [
    tx({ date: '2026-11-03', description: 'SPOTIFY 1234567', chargedAmount: -21.9, provider: 'max', accountNumber: '9032' }),
    tx({ date: '2026-11-05', description: 'Spotify', chargedAmount: -21.9 }),
  ];
  const d = findDuplicates(list, { today: '2026-11-12' });
  assert.equal(d.length, 1);
  assert.match(d[0].reason, /שני אמצעי תשלום/);
});

test('does not flag monthly charges, installments, or dismissed pairs', () => {
  const list = [
    tx({ date: '2026-10-05', description: 'Spotify', chargedAmount: -21.9 }),
    tx({ date: '2026-11-05', description: 'Spotify', chargedAmount: -21.9 }),
    tx({ date: '2026-11-01', description: 'מקרר', chargedAmount: -300, type: 'installments' }),
    tx({ date: '2026-11-01', description: 'מקרר', chargedAmount: -300, type: 'installments' }),
  ];
  assert.equal(findDuplicates(list, { today: '2026-11-12' }).length, 0);
  const pair = [tx({ date: '2026-11-10', description: 'קפה', chargedAmount: -14 }), tx({ date: '2026-11-10', description: 'קפה', chargedAmount: -14 })];
  const key = findDuplicates(pair, { today: '2026-11-12' })[0].key;
  assert.equal(findDuplicates(pair, { today: '2026-11-12', dismissed: new Set([key]) }).length, 0);
});

const bank = (o) => tx({ kind: 'bank', provider: 'hapoalim', accountNumber: '12-345', ...o });

test('detects monthly bank items and forecasts the next debit', () => {
  const list = [];
  for (const m of ['07', '08', '09', '10']) {
    list.push(bank({ date: `2026-${m}-13`, description: 'ארנונה', chargedAmount: -1000 }));
    list.push(bank({ date: `2026-${m}-15`, description: 'משכורת', chargedAmount: 9200 }));
  }
  const rec = detectRecurring(list, { today: '2026-11-12' });
  assert.deepEqual(rec.map((r) => [r.description, r.dayOfMonth]).sort(), [['ארנונה', 13], ['משכורת', 15]]);

  const fc = forecast({ startBalance: 500, today: '2026-11-12', days: 30, recurring: rec });
  assert.equal(fc.days[1].balance, -500);
  assert.equal(fc.days[3].balance, 8700);
  const alerts = balanceAlerts(fc);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].date, '2026-11-13');
  assert.equal(alerts[0].shortfall, 500);
});

test('card bills come from unbilled card charges, and bank card-bill debits are not double counted', () => {
  const list = [
    tx({ date: '2026-11-02', processedDate: '2026-12-10', description: 'דלק', chargedAmount: -265 }),
    tx({ date: '2026-11-05', processedDate: '2026-12-10', description: 'סופר', chargedAmount: -735 }),
    tx({ date: '2026-10-05', processedDate: '2026-11-10', description: 'ישן', chargedAmount: -99 }),
  ];
  const bills = upcomingCardBills(list, { today: '2026-11-12', providerNames: { visaCal: 'כאל' } });
  assert.deepEqual(bills.map((b) => [b.date, b.amount, b.label]), [['2026-12-10', -1000, 'חיוב כאל ·· 4417']]);

  const rec = [{ kind: 'bank', description: 'כאל חיוב חודשי', amount: -900, dayOfMonth: 10, lastDate: '2026-11-10' }];
  const fc = forecast({ startBalance: 2000, today: '2026-11-12', days: 30, recurring: rec, cardBills: bills, hasCards: true });
  assert.equal(fc.days.at(-1).balance, 1000);
});

test('daily spend ignores monthly items and card bills', () => {
  const list = [
    bank({ date: '2026-11-01', description: 'כספומט', chargedAmount: -600 }),
    bank({ date: '2026-11-10', description: 'ויזה כאל', chargedAmount: -3000 }),
    bank({ date: '2026-11-11', description: 'ארנונה', chargedAmount: -1000 }),
  ];
  const daily = estimateDailySpend(list, [{ description: 'ארנונה' }], { today: '2026-11-12', lookbackDays: 60 });
  assert.equal(daily, 10);
});
