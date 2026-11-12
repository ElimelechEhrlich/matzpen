// Pure functions over normalized transactions. No I/O, so they are easy to test.
//
// Transaction shape:
// { id, source, kind: 'bank'|'card', provider, accountNumber, identifier,
//   date: 'YYYY-MM-DD', processedDate: 'YYYY-MM-DD', description,
//   chargedAmount (negative = money out), type: 'normal'|'installments', status: 'completed'|'pending' }

const DAY = 86400000;
export const toDate = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
export const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function normalizeDesc(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[0-9]{4,}/g, ' ') // reference numbers
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Debits in the bank account that are the monthly bill of a credit card.
const CARD_BILL = /(כאל|ויזה|visa|cal|מקס|max|לאומי קארד|ישראכרט|isracard|אמריקן|אמקס|amex|דיינרס|diners)/i;
export const isCardBill = (t) => t.kind === 'bank' && t.chargedAmount < 0 && CARD_BILL.test(t.description || '');

const sourceOf = (t) => t.source ?? `${t.provider}:${t.accountNumber}`;

/**
 * Charges that look like they were taken twice.
 * - same source, same merchant and amount, within `windowDays`
 * - different sources (two cards), same merchant and amount, in the same month (a doubled subscription)
 */
export function findDuplicates(txns, { today, dismissed = new Set(), windowDays = 3, lookbackDays = 60, minAmount = 5 } = {}) {
  const from = today ? addDays(today, -lookbackDays) : '0000-00-00';
  const charges = txns.filter((t) => t.chargedAmount <= -minAmount && t.type !== 'installments' && t.date >= from);
  const groups = new Map();
  for (const t of charges) {
    const k = normalizeDesc(t.description) + '|' + Math.abs(t.chargedAmount).toFixed(2);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (used.has(a) || used.has(b)) continue;
        if (a.identifier && b.identifier && a.identifier === b.identifier && sourceOf(a) === sourceOf(b)) continue;
        const gap = dayDiff(a.date, b.date);
        const sameSource = sourceOf(a) === sourceOf(b);
        let reason = null;
        if (sameSource && gap <= windowDays) {
          reason = gap === 0 ? 'אותו סכום ואותו בית עסק, באותו יום' : `אותו סכום ואותו בית עסק, בהפרש של ${gap} ימים`;
        } else if (!sameSource && a.date.slice(0, 7) === b.date.slice(0, 7)) {
          reason = 'אותו חיוב בשני אמצעי תשלום באותו חודש';
        }
        if (!reason) continue;
        const key = [a.id, b.id].map(String).sort().join('~');
        if (dismissed.has(key)) continue;
        used.add(a); used.add(b);
        out.push({ key, description: a.description, amount: Math.abs(a.chargedAmount), reason, a, b });
      }
    }
  }
  return out.sort((x, y) => (x.b.date < y.b.date ? 1 : -1));
}

/** Charges or income that repeat monthly: at least `minMonths` distinct months with a similar amount. */
export function detectRecurring(txns, { today, lookbackMonths = 6, minMonths = 3, tolerance = 0.2 } = {}) {
  const from = today ? addDays(today, -31 * lookbackMonths) : '0000-00-00';
  const groups = new Map();
  for (const t of txns) {
    if (t.date < from || !t.chargedAmount || t.type === 'installments') continue;
    const k = `${t.kind}|${Math.sign(t.chargedAmount)}|${normalizeDesc(t.description)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const list of groups.values()) {
    const amounts = list.map((t) => t.chargedAmount);
    const med = median(amounts);
    const similar = list.filter((t) => Math.abs(t.chargedAmount - med) <= Math.abs(med) * tolerance);
    const months = new Set(similar.map((t) => t.date.slice(0, 7)));
    if (months.size < minMonths) continue;
    // one per month, otherwise it is frequent spending rather than a monthly item
    if (similar.length > months.size * 1.5) continue;
    similar.sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = similar[similar.length - 1];
    out.push({
      description: last.description,
      kind: last.kind,
      provider: last.provider,
      source: sourceOf(last),
      amount: Math.round(median(similar.map((t) => t.chargedAmount)) * 100) / 100,
      dayOfMonth: Math.round(median(similar.map((t) => toDate(t.date).getUTCDate()))),
      months: months.size,
      lastDate: last.date,
    });
  }
  return out.sort((a, b) => a.amount - b.amount);
}

/** Average daily spending from the bank account that is not a monthly item or a card bill. */
export function estimateDailySpend(txns, recurring, { today, lookbackDays = 60 } = {}) {
  const from = addDays(today, -lookbackDays);
  const rec = new Set(recurring.map((r) => normalizeDesc(r.description)));
  const total = txns
    .filter((t) => t.kind === 'bank' && t.chargedAmount < 0 && t.date > from && t.date <= today)
    .filter((t) => !isCardBill(t) && !rec.has(normalizeDesc(t.description)))
    .reduce((s, t) => s + -t.chargedAmount, 0);
  return Math.round((total / lookbackDays) * 100) / 100;
}

/** Card charges not yet billed, grouped into the bank debit expected on each billing date. */
export function upcomingCardBills(txns, { today, providerNames = {} } = {}) {
  const bills = new Map();
  for (const t of txns) {
    if (t.kind !== 'card' || !t.processedDate || t.processedDate <= today) continue;
    const k = `${sourceOf(t)}|${t.processedDate}`;
    if (!bills.has(k)) bills.set(k, { date: t.processedDate, amount: 0, label: `חיוב ${providerNames[t.provider] || t.provider}${t.accountNumber ? ' ·· ' + String(t.accountNumber).slice(-4) : ''}`, source: sourceOf(t) });
    bills.get(k).amount += t.chargedAmount;
  }
  return [...bills.values()].map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function nextOccurrences(item, today, days) {
  const res = [];
  const end = addDays(today, days);
  const t = toDate(today);
  for (let m = 0; m <= Math.ceil(days / 28) + 1; m++) {
    const y = t.getUTCFullYear(), mo = t.getUTCMonth() + m;
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const d = iso(new Date(Date.UTC(y, mo, Math.min(item.dayOfMonth, last))));
    if (d <= today || d > end) continue;
    if (item.lastDate && item.lastDate.slice(0, 7) === d.slice(0, 7)) continue; // already happened this month
    res.push(d);
  }
  return res;
}

/**
 * Day-by-day projection of the bank balance.
 * Events: monthly bank items (excluding card bills when cards are connected) + upcoming card bills.
 */
export function forecast({ startBalance, today, days = 30, recurring = [], cardBills = [], dailySpend = 0, hasCards = false }) {
  const events = new Map();
  const push = (date, e) => { if (!events.has(date)) events.set(date, []); events.get(date).push(e); };
  for (const r of recurring) {
    if (r.kind !== 'bank') continue;
    if (hasCards && CARD_BILL.test(r.description)) continue;
    for (const d of nextOccurrences(r, today, days)) push(d, { label: r.description, amount: r.amount, kind: 'recurring' });
  }
  for (const b of cardBills) if (b.date > today && b.date <= addDays(today, days)) push(b.date, { label: b.label, amount: b.amount, kind: 'card' });

  const out = [];
  let bal = startBalance;
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const ev = i === 0 ? [] : events.get(date) || [];
    if (i > 0) bal -= dailySpend;
    for (const e of ev) bal += e.amount;
    out.push({ date, balance: Math.round(bal * 100) / 100, events: ev });
  }
  const low = out.reduce((m, x) => (x.balance < m.balance ? x : m), out[0]);
  return { days: out, low, dailySpend };
}

/** Alerts for days where a scheduled debit leaves the balance under `threshold`. */
export function balanceAlerts(fc, { threshold = 0 } = {}) {
  const alerts = [];
  let prev = fc.days[0].balance;
  for (const d of fc.days.slice(1)) {
    const debits = d.events.filter((e) => e.amount < 0);
    if (debits.length && d.balance < threshold && prev >= threshold) {
      const big = debits.reduce((m, e) => (e.amount < m.amount ? e : m));
      alerts.push({
        severity: 'critical',
        date: d.date,
        label: big.label,
        amount: debits.reduce((s, e) => s + e.amount, 0),
        balanceBefore: prev,
        balanceAfter: d.balance,
        shortfall: Math.round((threshold - d.balance) * 100) / 100,
      });
    }
    prev = d.balance;
  }
  return alerts;
}
