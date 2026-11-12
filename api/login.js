import { route, sessionToken, badRequest } from '../lib/http.js';
import { safeEqual } from '../lib/crypto.js';

export default route({
  POST: async ({ body }) => {
    if (!safeEqual(String(body.password || ''), process.env.APP_PASSWORD || '')) throw Object.assign(badRequest('סיסמה שגויה'), { status: 401 });
    return { token: sessionToken() };
  },
}, { auth: false });
