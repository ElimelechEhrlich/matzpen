import { route, badRequest } from '../lib/http.js';
import { publicKey, saveSubscription, removeSubscription, countSubscriptions, notify } from '../lib/push.js';

export default route({
  GET: async () => ({ publicKey: await publicKey(), devices: await countSubscriptions() }),
  POST: async ({ body }) => {
    if (body.action === 'test') {
      const sent = await notify({ title: 'מצפן', body: 'ההתראות עובדות. כאן תקבל בקשה לקוד SMS.', url: '/', tag: 'test' });
      return { sent };
    }
    try { await saveSubscription(body.subscription); } catch { throw badRequest('המכשיר לא נרשם. נסה שוב.'); }
    return { ok: true };
  },
  DELETE: async ({ query }) => { if (query.endpoint) await removeSubscription(query.endpoint); return { ok: true }; },
});
