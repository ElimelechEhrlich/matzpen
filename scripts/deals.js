// Weekly: asks Claude (with web search) for current Israeli deals in the bill categories found in your data.
// Only the category is sent (for example "cellular plans") — never transactions, names or amounts.
// Needs ANTHROPIC_API_KEY. Runs from .github/workflows/deals.yml, or locally: `npm run deals`.
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../lib/db.js';
import { loadTransactions, saveSettings } from '../lib/store.js';
import { categoriesToSearch } from '../lib/savings.js';

const MODEL = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['deals'],
  properties: {
    deals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'plan', 'price', 'unit', 'url', 'details'],
        properties: {
          provider: { type: 'string', description: 'Company name, in Hebrew if it has one' },
          plan: { type: 'string', description: 'Plan or deal name' },
          price: { type: 'number', description: 'Monthly price in ILS (for electricity: discount percent)' },
          unit: { type: 'string', description: 'What the price is per, in Hebrew, e.g. "לשורה לחודש" or "% הנחה"' },
          url: { type: 'string', description: 'Page where the deal appears' },
          details: { type: 'string', description: 'One short Hebrew sentence: what is included and any condition, such as a price that rises after 12 months' },
        },
      },
    },
  },
};

const client = new Anthropic();

async function searchDeals(category) {
  const messages = [{
    role: 'user',
    content: `חפש ברשת מבצעים עדכניים בישראל: ${category.search}.
החזר עד 5 מבצעים זולים ואמיתיים מאתרי החברות או מאתרי השוואה מוכרים, שפורסמו בחודשיים האחרונים.
לכל מבצע ציין את המחיר החודשי בשקלים. אם המחיר עולה אחרי תקופה, ציין את זה בפרטים.
אם לא מצאת מחיר מאומת, אל תכלול את המבצע.`,
  }];
  for (let i = 0; i < 4; i++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'IL' } }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages,
    });
    if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
    if (res.stop_reason === 'refusal') throw new Error('the request was declined');
    if (res.stop_reason === 'max_tokens') throw new Error('response was cut off');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = JSON.parse(text);
    return parsed.deals.filter((d) => /^https?:\/\//.test(d.url) && d.price > 0);
  }
  throw new Error('search did not finish');
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.log('ANTHROPIC_API_KEY is not set; skipping deal search.'); return; }
  const pool = await db();
  const cats = categoriesToSearch(await loadTransactions({ sinceDays: 180 }));
  if (!cats.length) { console.log('No bill categories found yet.'); await pool.end(); return; }

  const byCategory = {};
  for (const c of cats) {
    try {
      byCategory[c.id] = await searchDeals(c);
      console.log(`✓ ${c.name}: ${byCategory[c.id].length} deals`);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) console.error(`✗ ${c.name}: rate limited, try again later`);
      else if (e instanceof Anthropic.AuthenticationError) { console.error('✗ ANTHROPIC_API_KEY is invalid'); process.exit(1); }
      else if (e instanceof Anthropic.APIError) console.error(`✗ ${c.name}: API error ${e.status}: ${e.message}`);
      else console.error(`✗ ${c.name}: ${e.message}`);
    }
  }
  if (Object.keys(byCategory).length) await saveSettings({ deals: { updatedAt: new Date().toISOString(), byCategory } });
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
