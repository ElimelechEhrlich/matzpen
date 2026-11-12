import { route } from '../lib/http.js';
import { publicProviders } from '../lib/providers.js';

export default route({ GET: async () => ({ providers: publicProviders() }) }, { auth: false });
