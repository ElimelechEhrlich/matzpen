// Starts the sync workflow on GitHub Actions (that is where Chrome runs; Vercel functions can't run it well).
// Needs GH_TOKEN (fine-grained token with "Actions: read and write" on this repo) and GH_REPO ("owner/name").
export async function triggerSync(connectionId) {
  const { GH_TOKEN, GH_REPO } = process.env;
  if (!GH_TOKEN || !GH_REPO) return { started: false, reason: 'סנכרון ידני לא מוגדר (GH_TOKEN / GH_REPO). הסנכרון היומי ימשוך את הנתונים.' };
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/sync.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'matzpen' },
    body: JSON.stringify({ ref: process.env.GH_REF || 'main', inputs: connectionId ? { connection_id: String(connectionId) } : {} }),
  });
  if (!r.ok) return { started: false, reason: `GitHub החזיר ${r.status}` };
  return { started: true };
}
