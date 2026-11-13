// Everything the home screen needs, computed from stored data.
import { detectRecurring, upcomingCardBills, estimateDailySpend, forecast, balanceAlerts, findDuplicates } from './analysis.js';
import { PROVIDERS } from './providers.js';
import { findSavings } from './savings.js';

export const israelToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

export function buildDashboard({ connections, txns, dismissed = new Set(), settings = {}, today = israelToday() }) {
  const providerNames = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.name]));
  const bankAccounts = connections.filter((c) => c.kind === 'bank' && c.enabled).flatMap((c) => c.accounts);
  const balances = bankAccounts.map((a) => a.balance).filter((b) => b != null);
  const startBalance = balances.reduce((s, b) => s + b, 0);
  const hasCards = connections.some((c) => c.kind === 'card' && c.enabled);

  const recurring = detectRecurring(txns, { today });
  const cardBills = upcomingCardBills(txns, { today, providerNames });
  const dailySpend = estimateDailySpend(txns, recurring, { today });
  const fc = forecast({ startBalance, today, days: settings.forecastDays || 30, recurring, cardBills, dailySpend, hasCards });
  const alerts = balanceAlerts(fc, { threshold: settings.lowBalanceThreshold || 0 });
  const duplicates = findDuplicates(txns, { today, dismissed });

  const savings = findSavings(txns, { today, units: settings.savingsUnits || {}, deals: settings.deals || null, dismissed });

  const upcoming = fc.days.slice(1, 15).flatMap((d) => d.events.map((e) => ({ date: d.date, ...e })));
  const subscriptions = recurring
    .filter((r) => r.amount < 0 && !(r.kind === 'bank' && hasCards && /(כאל|ויזה|מקס|ישראכרט|אמריקן|amex|max|cal|isracard)/i.test(r.description)))
    .map((r) => ({ ...r, yearly: Math.round(-r.amount * 12) }))
    .sort((a, b) => b.yearly - a.yearly);

  return {
    today,
    hasData: balances.length > 0 || txns.length > 0,
    balance: balances.length ? startBalance : null,
    openCardCharges: cardBills.reduce((s, b) => s + b.amount, 0),
    forecast: fc,
    alerts,
    duplicates,
    upcoming,
    subscriptions,
    savings,
    dealsUpdatedAt: settings.deals?.updatedAt || null,
    recent: txns.slice(0, 80),
    connections: connections.map(({ credentials, ...c }) => c),
    lastSync: connections.map((c) => c.last_sync_at).filter(Boolean).sort().at(-1) || null,
  };
}
