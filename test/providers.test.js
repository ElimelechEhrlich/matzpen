import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PROVIDERS, validateCredentials } from '../lib/providers.js';

const { SCRAPERS } = createRequire(import.meta.url)('israeli-bank-scrapers');

test('every provider of the scraper library is listed, with the same login fields', () => {
  for (const [id, s] of Object.entries(SCRAPERS)) {
    const p = PROVIDERS.find((x) => x.id === id);
    assert.ok(p, `missing provider ${id}`);
    const expected = s.loginFields.filter((f) => f !== 'otpCodeRetriever');
    assert.deepEqual(p.fields, expected, `fields differ for ${id}`);
  }
});

test('validateCredentials names the missing fields in Hebrew', () => {
  assert.throws(() => validateCredentials('isracard', { id: '1' }), /6 ספרות.*סיסמה/);
  assert.deepEqual(validateCredentials('max', { username: ' a ', password: 'b', extra: 1 }), { username: 'a', password: 'b' });
});
