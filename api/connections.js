import { route, badRequest } from '../lib/http.js';
import { getProvider, validateCredentials } from '../lib/providers.js';
import { listConnections, addConnection, updateConnection, deleteConnection } from '../lib/store.js';
import { triggerSync } from '../lib/github.js';

const idOf = (q) => { const id = Number(q.id); if (!id) throw badRequest('חסר מזהה חיבור'); return id; };

export default route({
  GET: async () => ({ connections: await listConnections() }),

  POST: async ({ body }) => {
    const p = getProvider(body.provider);
    if (!p) throw badRequest('בחר בנק או חברת אשראי');
    let credentials;
    try { credentials = validateCredentials(p.id, body.credentials); } catch (e) { throw badRequest(e.message); }
    const id = await addConnection({ provider: p.id, label: String(body.label || p.name).slice(0, 60), credentials });
    const sync = await triggerSync(id).catch((e) => ({ started: false, reason: e.message }));
    return { id, sync };
  },

  PATCH: async ({ query, body }) => {
    const id = idOf(query);
    const patch = { label: body.label, enabled: body.enabled };
    if (body.credentials) {
      const all = await listConnections();
      const c = all.find((x) => x.id === id);
      if (!c) throw badRequest('החיבור לא נמצא');
      try { patch.credentials = validateCredentials(c.provider, body.credentials); } catch (e) { throw badRequest(e.message); }
    }
    await updateConnection(id, patch);
    return { ok: true };
  },

  DELETE: async ({ query }) => { await deleteConnection(idOf(query)); return { ok: true }; },
});
