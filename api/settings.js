import { route } from '../lib/http.js';
import { getSettings, saveSettings } from '../lib/store.js';

const ALLOWED = { lowBalanceThreshold: 'number', forecastDays: 'number' };

export default route({
  GET: async () => ({ settings: await getSettings() }),
  POST: async ({ body }) => {
    const clean = Object.fromEntries(Object.entries(body).filter(([k, v]) => ALLOWED[k] && typeof v === ALLOWED[k]));
    if (clean.forecastDays) clean.forecastDays = Math.min(90, Math.max(7, Math.round(clean.forecastDays)));
    await saveSettings(clean);
    return { settings: await getSettings() };
  },
});
