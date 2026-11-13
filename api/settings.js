import { route } from '../lib/http.js';
import { getSettings, saveSettings } from '../lib/store.js';

const ALLOWED = { lowBalanceThreshold: 'number', forecastDays: 'number', savingsUnits: 'object' };

export default route({
  GET: async () => { const { deals, ...s } = await getSettings(); return { settings: s }; },
  POST: async ({ body }) => {
    const clean = Object.fromEntries(Object.entries(body).filter(([k, v]) => ALLOWED[k] && typeof v === ALLOWED[k]));
    if (clean.savingsUnits) clean.savingsUnits = Object.fromEntries(Object.entries(clean.savingsUnits).filter(([, v]) => Number.isInteger(v) && v > 0 && v < 20));
    if (clean.forecastDays) clean.forecastDays = Math.min(90, Math.max(7, Math.round(clean.forecastDays)));
    await saveSettings(clean);
    const { deals, ...s } = await getSettings();
    return { settings: s };
  },
});
