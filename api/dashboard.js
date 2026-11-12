import { route } from '../lib/http.js';
import { listConnections, loadTransactions, getDismissed, getSettings } from '../lib/store.js';
import { buildDashboard } from '../lib/dashboard.js';

export default route({
  GET: async () => {
    const [connections, txns, dismissed, settings] = await Promise.all([listConnections(), loadTransactions(), getDismissed(), getSettings()]);
    return buildDashboard({ connections, txns, dismissed, settings });
  },
});
