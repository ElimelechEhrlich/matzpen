// Finds bills that are probably more expensive than they need to be.
// Spending per category is measured from the real transactions; the "typical price"
// comes from live deals when available (scripts/deals.js), otherwise from the estimates below.

import { normalizeDesc } from './analysis.js';

const DAY = 86400000;

export const CATEGORIES = [
  {
    id: 'cellular', name: 'סלולר',
    match: /(מובייל|mobile|פלאפון|pelephone|סלקום סלולר|פרטנר תקשורת|partner comm|גולן טלקום|golan|we4g|רמי לוי תקשורת|xphone|019 סלולר|012 מובייל|סלקום|cellcom|פרטנר|partner)/i,
    benchmark: 40, unit: 'לשורה לחודש', hasUnits: true, unitsLabel: 'שורות',
    tip: 'מסלולי 5G בלי הגבלת גלישה עולים היום בערך 30–50 ₪ לשורה. מעבר חברה עם ניוד מספר הוא בחינם ולוקח בערך יום.',
    search: 'מבצעי מסלולי סלולר 5G בישראל ללא הגבלת גלישה, מחיר חודשי לשורה',
  },
  {
    id: 'home', name: 'אינטרנט וטלוויזיה',
    match: /(בזק|bezeq|הוט|hot net|hot\b|yes\b|יס\b|נטוויז|netvision|סיבים|fiber|פייבר|אינטרנט|internet|ספק תשתית|unlimited|xfone|sting|סטינג|next tv)/i,
    pct: 0.25,
    tip: 'בשיחה למחלקת השימור אפשר בדרך כלל לקבל 20–30% הנחה. כדאי להגיע עם הצעה כתובה מחברה מתחרה.',
    search: 'מבצעי אינטרנט סיבים בישראל כולל ספק, מחיר חודשי',
  },
  {
    id: 'electricity', name: 'חשמל',
    match: /(חברת החשמל|חח"?י|iec|electric)/i,
    pct: 0.07,
    tip: 'ספקי חשמל פרטיים נותנים הנחה על התעריף, בלי טכנאי ובלי החלפת מונה. בודקים איזה מסלול מתאים לשעות הצריכה שלכם.',
    search: 'השוואת ספקי חשמל פרטיים בישראל אחוז הנחה מתעריף חברת החשמל',
  },
  {
    id: 'insurance', name: 'ביטוחים',
    match: /(ביטוח|הראל|מגדל|כלל |הפניקס|מנורה|איילון|ליברה|ביטוח ישיר|aig|שלמה|הכשרה|wobi|9 מיליון)/i,
    pct: 0.15,
    tip: 'כדאי לבקש 2–3 הצעות לפני כל חידוש. באתר הממשלתי "הר הביטוח" רואים את כל הפוליסות שלכם ואם יש כפל ביטוחים.',
  },
  {
    id: 'streaming', name: 'מנויי סטרימינג',
    match: /(netflix|נטפליקס|spotify|ספוטיפיי|disney|דיסני|youtube|יוטיוב|apple\.com|itunes|amazon prime|prime video|hbo|deezer|icloud)/i,
    perService: true,
    tip: 'הרבה אנשים מחזיקים כמה שירותי סטרימינג במקביל. אפשר להחזיק שירות אחד בכל פעם ולעבור ביניהם כל חודש או חודשיים.',
  },
  {
    id: 'fees', name: 'עמלות ודמי כרטיס',
    match: /(עמלה|עמלת|עמ'|דמי ניהול|דמי כרטיס|דמי טיפול|דמי חבר)/i,
    pct: 0.7,
    tip: 'אפשר לבקש מהבנק מסלול עמלות דיגיטלי או פטור, ומחברת האשראי לבטל את דמי הכרטיס. הבקשה הזו מתקבלת ברוב המקרים.',
  },
];

export function categorize(t) {
  return CATEGORIES.find((c) => c.match.test(t.description || '')) || null;
}

/**
 * @param txns normalized transactions
 * @param opts.today ISO date
 * @param opts.units { cellular: 2 } number of lines etc.
 * @param opts.deals { byCategory: { cellular: [{ price, ... }] }, updatedAt }
 * @param opts.dismissed Set of 'saving:<id>'
 */
export function findSavings(txns, { today, units = {}, deals = null, dismissed = new Set(), lookbackDays = 180 } = {}) {
  const from = new Date(Date.parse(today) - lookbackDays * DAY).toISOString().slice(0, 10);
  const outflows = txns.filter((t) => t.chargedAmount < 0 && t.date > from && t.date <= today && t.type !== 'installments');
  if (!outflows.length) return [];
  const firstDate = outflows.reduce((m, t) => (t.date < m ? t.date : m), today);
  const span = Math.max(30, Math.round((Date.parse(today) - Date.parse(firstDate)) / DAY));
  const toYear = (sum) => (sum * 365) / span;

  const out = [];
  for (const c of CATEGORIES) {
    if (dismissed.has('saving:' + c.id)) continue;
    const list = outflows.filter((t) => categorize(t) === c);
    if (!list.length) continue;
    const merchants = new Map();
    for (const t of list) {
      const k = normalizeDesc(t.description);
      const m = merchants.get(k) || { description: t.description, total: 0, count: 0 };
      m.total += -t.chargedAmount; m.count++;
      merchants.set(k, m);
    }
    const yearly = toYear(list.reduce((s, t) => s - t.chargedAmount, 0));
    const monthly = yearly / 12;
    const live = deals?.byCategory?.[c.id]?.filter((d) => typeof d.price === 'number') || [];

    let target, save, basis;
    if (c.hasUnits) {
      const n = Math.max(1, Number(units[c.id]) || 1);
      const unitPrice = live.length ? Math.min(...live.map((d) => d.price)) : c.benchmark;
      target = unitPrice * n;
      save = monthly > target * 1.1 ? (monthly - target) * 12 : 0;
      basis = live.length ? `המבצע הזול ביותר שנמצא: ${unitPrice} ₪ ${c.unit}` : `מחיר מקובל: כ־${c.benchmark} ₪ ${c.unit}`;
    } else if (c.perService) {
      const services = [...merchants.values()].map((m) => toYear(m.total)).sort((a, b) => b - a);
      save = services.length >= 2 ? services.slice(1).reduce((s, x) => s + x, 0) : 0;
      target = monthly - save / 12;
      basis = `${services.length} שירותים פעילים`;
    } else {
      // electricity deals are a discount percent; use the best one found
      const pct = c.id === 'electricity' && live.length ? Math.min(0.3, Math.max(...live.map((d) => d.price)) / 100) : c.pct;
      save = yearly * pct;
      target = monthly * (1 - pct);
      basis = `חיסכון אפשרי של כ־${Math.round(pct * 100)}%`;
    }
    save = Math.round(save);
    if (save < 100) continue;
    out.push({
      id: c.id, name: c.name, tip: c.tip, basis,
      units: c.hasUnits ? { label: c.unitsLabel, value: Math.max(1, Number(units[c.id]) || 1) } : null,
      monthly: Math.round(monthly), target: Math.round(target), yearlySave: save,
      merchants: [...merchants.values()].sort((a, b) => b.total - a.total).slice(0, 4).map((m) => m.description),
      deals: live.slice(0, 4),
      dealsCheckedAt: live.length ? deals.updatedAt : null,
    });
  }
  return out.sort((a, b) => b.yearlySave - a.yearlySave);
}

/** Categories worth searching live deals for (only those that have a search query and appear in the data). */
export function categoriesToSearch(txns) {
  const present = new Set(txns.filter((t) => t.chargedAmount < 0).map((t) => categorize(t)?.id).filter(Boolean));
  return CATEGORIES.filter((c) => c.search && present.has(c.id));
}
