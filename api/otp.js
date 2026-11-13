import { route, badRequest } from '../lib/http.js';
import { submitOtp } from '../lib/otp.js';
import { listConnections } from '../lib/store.js';

export default route({
  GET: async () => ({ waiting: (await listConnections()).filter((c) => c.otp_waiting).map((c) => ({ id: c.id, label: c.label, providerName: c.providerName })) }),
  POST: async ({ body }) => {
    const id = Number(body.connectionId);
    const code = String(body.code || '').replace(/\s+/g, '');
    if (!id) throw badRequest('חסר מזהה חיבור');
    if (!/^[0-9A-Za-z]{4,10}$/.test(code)) throw badRequest('הקוד צריך להיות 4–10 ספרות');
    if (!(await submitOtp(id, code))) throw badRequest('עבר יותר מדי זמן. הרץ סנכרון חדש וחכה ל־SMS הבא.');
    return { ok: true };
  },
});
