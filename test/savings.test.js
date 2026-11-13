import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSavings, categorize, categoriesToSearch } from '../lib/savings.js';

let n = 0;
const tx = (date, description, chargedAmount) => ({ id: ++n, kind: 'card', provider: 'max', accountNumber: '1', type: 'normal', date, description, chargedAmount });
const monthly = (desc, amount, months = 6) => Array.from({ length: months }, (_, i) => tx(`2026-${String(10 - i).padStart(2, '0')}-08`, desc, -amount));

test('categorizes common Israeli bills', () => {
  assert.equal(categorize({ description: 'פלאפון תקשורת בע"מ' }).id, 'cellular');
  assert.equal(categorize({ description: 'NETFLIX.COM' }).id, 'streaming');
  assert.equal(categorize({ description: 'חברת החשמל לישראל' }).id, 'electricity');
  assert.equal(categorize({ description: 'הראל ביטוח רכב' }).id, 'insurance');
  assert.equal(categorize({ description: 'עמלת פעולה בערוץ ישיר' }).id, 'fees');
  assert.equal(categorize({ description: 'סופר השכונה' }), null);
});

test('cellular above the typical price per line is flagged, scaled by number of lines', () => {
  const txns = monthly('פלאפון תקשורת', 89);
  const [s] = findSavings(txns, { today: '2026-11-12' });
  assert.equal(s.id, 'cellular');
  assert.ok(Math.abs(s.yearlySave - (s.monthly - 40) * 12) <= 12);
  // two lines at 89 total is already cheap: no suggestion
  assert.equal(findSavings(txns, { today: '2026-11-12', units: { cellular: 2 } }).length, 0);
});

test('live deals replace the built-in price', () => {
  const txns = monthly('פלאפון תקשורת', 89);
  const deals = { updatedAt: '2026-11-10T00:00:00Z', byCategory: { cellular: [{ provider: 'X', plan: '5G', price: 29, unit: 'לשורה', url: 'https://x', details: '' }] } };
  const [s] = findSavings(txns, { today: '2026-11-12', deals });
  assert.equal(s.target, 29);
  assert.equal(s.deals.length, 1);
  assert.match(s.basis, /29/);
});

test('streaming: suggests keeping one service at a time; one service is not flagged', () => {
  const one = monthly('NETFLIX.COM', 55);
  assert.equal(findSavings(one, { today: '2026-11-12' }).length, 0);
  const three = [...one, ...monthly('SPOTIFY', 22), ...monthly('DISNEY PLUS', 40)];
  const [s] = findSavings(three, { today: '2026-11-12' });
  assert.equal(s.id, 'streaming');
  assert.ok(s.yearlySave > 600 && s.yearlySave < 800);
});

test('dismissed categories and small amounts are skipped', () => {
  const txns = [...monthly('הראל ביטוח', 300), ...monthly('עמלת פעולה', 2)];
  const ids = findSavings(txns, { today: '2026-11-12' }).map((s) => s.id);
  assert.deepEqual(ids, ['insurance']);
  assert.equal(findSavings(txns, { today: '2026-11-12', dismissed: new Set(['saving:insurance']) }).length, 0);
});

test('only searchable categories present in the data are sent for a deal search', () => {
  const txns = [...monthly('פלאפון', 89), ...monthly('הראל ביטוח', 300)];
  assert.deepEqual(categoriesToSearch(txns).map((c) => c.id), ['cellular']);
});
