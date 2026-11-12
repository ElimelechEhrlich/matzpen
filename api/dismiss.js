import { route, badRequest } from '../lib/http.js';
import { dismiss } from '../lib/store.js';

export default route({
  POST: async ({ body }) => {
    if (!body.key) throw badRequest('חסר מפתח');
    await dismiss(String(body.key));
    return { ok: true };
  },
});
