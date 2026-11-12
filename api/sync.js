import { route } from '../lib/http.js';
import { triggerSync } from '../lib/github.js';

export default route({ POST: async ({ body }) => triggerSync(body.connectionId) });
