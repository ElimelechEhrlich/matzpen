// Every bank and card company the sync job can connect to.
// Kept as plain data (no import of the scraper library) so the Vercel API stays small.
// test/providers.test.js checks this list against the library, so a new provider there fails the test.

export const FIELD_LABELS = {
  userCode: 'קוד משתמש',
  username: 'שם משתמש',
  password: 'סיסמה',
  id: 'תעודת זהות',
  nationalID: 'תעודת זהות',
  num: 'קוד מזהה',
  card6Digits: '6 ספרות אחרונות של הכרטיס',
  email: 'אימייל',
  phoneNumber: 'מספר טלפון',
  otpLongTermToken: 'טוקן OTP לטווח ארוך',
};

export const SECRET_FIELDS = new Set(['password', 'otpLongTermToken']);

export const PROVIDERS = [
  { id: 'hapoalim', name: 'בנק הפועלים', kind: 'bank', fields: ['userCode', 'password'] },
  { id: 'leumi', name: 'בנק לאומי', kind: 'bank', fields: ['username', 'password'] },
  { id: 'discount', name: 'בנק דיסקונט', kind: 'bank', fields: ['id', 'password', 'num'] },
  { id: 'mizrahi', name: 'מזרחי טפחות', kind: 'bank', fields: ['username', 'password'] },
  { id: 'beinleumi', name: 'הבינלאומי', kind: 'bank', fields: ['username', 'password'] },
  { id: 'mercantile', name: 'בנק מרכנתיל', kind: 'bank', fields: ['id', 'password', 'num'] },
  { id: 'yahav', name: 'בנק יהב', kind: 'bank', fields: ['username', 'nationalID', 'password'] },
  { id: 'otsarHahayal', name: 'בנק אוצר החייל', kind: 'bank', fields: ['username', 'password'] },
  { id: 'massad', name: 'בנק מסד', kind: 'bank', fields: ['username', 'password'] },
  { id: 'union', name: 'בנק איגוד', kind: 'bank', fields: ['username', 'password'] },
  { id: 'pagi', name: 'בנק פאג״י', kind: 'bank', fields: ['username', 'password'] },
  { id: 'oneZero', name: 'וואן זירו', kind: 'bank', fields: ['email', 'password', 'phoneNumber', 'otpLongTermToken'], note: 'נדרש טוקן OTP לטווח ארוך' },
  { id: 'visaCal', name: 'כאל', kind: 'card', fields: ['username', 'password'] },
  { id: 'max', name: 'מקס', kind: 'card', fields: ['username', 'password'] },
  { id: 'isracard', name: 'ישראכרט', kind: 'card', fields: ['id', 'card6Digits', 'password'] },
  { id: 'amex', name: 'אמריקן אקספרס', kind: 'card', fields: ['id', 'card6Digits', 'password'] },
  { id: 'beyahadBishvilha', name: 'ביחד בשבילך', kind: 'card', fields: ['id', 'password'] },
  { id: 'behatsdaa', name: 'בהצדעה', kind: 'card', fields: ['id', 'password'] },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

export function publicProviders() {
  return PROVIDERS.map((p) => ({
    ...p,
    fields: p.fields.map((f) => ({ key: f, label: FIELD_LABELS[f] || f, secret: SECRET_FIELDS.has(f) })),
  }));
}

/** Throws a readable error when credentials don't match the provider's fields. */
export function validateCredentials(providerId, credentials) {
  const p = getProvider(providerId);
  if (!p) throw new Error(`ספק לא מוכר: ${providerId}`);
  if (!credentials || typeof credentials !== 'object') throw new Error('חסרים פרטי התחברות');
  const missing = p.fields.filter((f) => !String(credentials[f] ?? '').trim());
  if (missing.length) throw new Error('חסרים שדות: ' + missing.map((f) => FIELD_LABELS[f] || f).join(', '));
  return Object.fromEntries(p.fields.map((f) => [f, String(credentials[f]).trim()]));
}
