// Login helpers that run around the scraper library's own login:
// - detect a one-time-code (SMS) screen, wait for the code from the app, type it and continue
// - remember the bank's "trusted device" cookies between runs
// - when a login gets stuck, log the page structure (field names only, no content) so it can be fixed

const OTP_HINT = /(otp|sms|one.?time|verification|verify|token|passcode|קוד|אימות|סיסמה חד)/i;
const SKIP_FIELD = /^(usercode|username|user|password|pass|id|nationalid|card6digits|num)$/i;
const SUBMIT_TEXT = /(אישור|אשר|המשך|כניסה|שלח|אמת|התחבר|submit|continue|confirm|verify|login|next)/i;

/** Runs inside the page: finds a visible input that looks like a one-time-code field and tags it. */
function findOtpInBrowser(hintSrc, skipSrc) {
  const hint = new RegExp(hintSrc, 'i');
  const skip = new RegExp(skipSrc, 'i');
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const inputs = [...document.querySelectorAll('input')].filter((el) => !['hidden', 'checkbox', 'radio', 'submit', 'button'].includes(el.type) && visible(el) && !el.disabled);
  const label = (el) => [el.id, el.name, el.placeholder, el.getAttribute('aria-label'), el.autocomplete, el.labels?.[0]?.textContent].join(' ');
  let el = inputs.find((i) => i.autocomplete === 'one-time-code')
    || inputs.find((i) => !skip.test(i.id || i.name || '') && hint.test(label(i)));
  // several single-digit boxes
  const boxes = inputs.filter((i) => i.maxLength === 1);
  if (!el && boxes.length >= 4) { boxes.forEach((b, n) => b.setAttribute('data-matzpen-otp', String(n))); return { boxes: boxes.length }; }
  if (!el) {
    const text = document.body?.innerText || '';
    const short = inputs.filter((i) => !skip.test(i.id || i.name || '') && i.maxLength >= 4 && i.maxLength <= 8);
    if (hint.test(text) && short.length === 1) el = short[0];
  }
  if (!el) return null;
  el.setAttribute('data-matzpen-otp', '0');
  return { boxes: 0 };
}

/** Runs inside the page: clicks the button that submits the code form. */
function clickSubmitInBrowser(textSrc) {
  const re = new RegExp(textSrc, 'i');
  const field = document.querySelector('[data-matzpen-otp]');
  const scope = field?.closest('form') || document;
  const buttons = [...scope.querySelectorAll('button, input[type=submit], [role=button], a.btn')]
    .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.disabled; });
  const btn = buttons.find((b) => b.type === 'submit') || buttons.find((b) => re.test(b.textContent || b.value || ''));
  if (btn) { btn.click(); return true; }
  return false;
}

/** Runs inside the page: describes forms without any values or personal text. */
function describeInBrowser() {
  const mask = (s) => String(s || '').replace(/\d/g, '#').replace(/\s+/g, ' ').trim().slice(0, 60);
  return {
    path: location.host + location.pathname,
    title: mask(document.title),
    headings: [...document.querySelectorAll('h1,h2,h3,label,legend')].slice(0, 12).map((h) => mask(h.textContent)),
    inputs: [...document.querySelectorAll('input,select,textarea')].slice(0, 20).map((i) => ({
      tag: i.tagName.toLowerCase(), type: i.type, id: i.id, name: i.name, autocomplete: i.autocomplete,
      maxlength: i.maxLength, placeholder: mask(i.placeholder), aria: mask(i.getAttribute('aria-label')),
    })),
    buttons: [...document.querySelectorAll('button,input[type=submit],[role=button]')].slice(0, 12).map((b) => ({ id: b.id, cls: String(b.className).slice(0, 60), text: mask(b.textContent || b.value) })),
  };
}

async function inFrames(page, fn, ...args) {
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(fn, ...args);
      if (r) return { frame, result: r };
    } catch { /* detached or cross-origin frame */ }
  }
  return null;
}

export async function describePage(page) {
  const out = [];
  for (const frame of page.frames()) {
    try { out.push(await frame.evaluate(describeInBrowser)); } catch { /* ignore */ }
  }
  return out;
}

function urlMatches(url, results) {
  for (const list of Object.values(results || {})) {
    for (const m of list || []) {
      if (typeof m === 'string' && url.toLowerCase().startsWith(m.toLowerCase())) return true;
      if (m instanceof RegExp && m.test(url)) return true;
    }
  }
  return false;
}

/**
 * Replaces the scraper's post-login wait.
 * @param page puppeteer page
 * @param loginOptions the scraper's own login options (possibleResults, original postAction)
 * @param hooks { onOtpNeeded(): Promise<string|null>, log(msg) }
 */
export async function postLoginWithOtp(page, loginOptions, { onOtpNeeded, log = console.log, timeoutMs = 45000 }) {
  const start = page.url();
  let end = Date.now() + timeoutMs;
  let codesTried = 0;
  let changedAt = 0;

  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 1500));
    const url = page.url();
    if (urlMatches(url, loginOptions.possibleResults)) return;

    const otp = await inFrames(page, findOtpInBrowser, OTP_HINT.source, SKIP_FIELD.source);
    if (otp) {
      if (codesTried >= 2) throw new Error('הבנק לא קיבל את הקוד. הרץ סנכרון חדש ובדוק שהקלדת את הקוד האחרון שהגיע.');
      log('  … הבנק ביקש קוד אימות. מחכה לקוד מהאפליקציה (עד 4 דקות)');
      const code = await onOtpNeeded();
      if (!code) throw new Error('לא הוזן קוד אימות בזמן. הרץ סנכרון חדש והקלד את הקוד באפליקציה כשיגיע SMS.');
      codesTried++;
      const { frame, result } = otp;
      if (result.boxes) {
        for (let n = 0; n < Math.min(result.boxes, code.length); n++) await frame.type(`[data-matzpen-otp="${n}"]`, code[n]);
      } else {
        await frame.click('[data-matzpen-otp]', { clickCount: 3 });
        await frame.type('[data-matzpen-otp]', code, { delay: 60 });
      }
      const clicked = await frame.evaluate(clickSubmitInBrowser, SUBMIT_TEXT.source).catch(() => false);
      if (!clicked) await page.keyboard.press('Enter');
      log('  … הקוד הוזן');
      await frame.evaluate(() => document.querySelectorAll('[data-matzpen-otp]').forEach((e) => e.removeAttribute('data-matzpen-otp'))).catch(() => {});
      end = Date.now() + timeoutMs; // the wait for the code doesn't count against the login timeout
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }

    // URL changed and no code screen: give the page a moment, then let the scraper judge the result
    if (url !== start) {
      if (!changedAt) changedAt = Date.now();
      if (Date.now() - changedAt > 4000) return;
    }
  }

  log('  … הכניסה לא הסתיימה. מבנה הדף (בלי תוכן אישי):');
  log(JSON.stringify(await describePage(page)));
  throw new Error('הכניסה לבנק לא הסתיימה בזמן. שלח את הלוג של הסנכרון כדי שאוכל לבדוק.');
}

/** Persistent cookies only (not the session), so the bank recognizes the device next time. */
export async function captureDeviceState(page) {
  const cookies = (await page.cookies()).filter((c) => !c.session && c.expires > Date.now() / 1000);
  return { cookies, savedAt: new Date().toISOString() };
}

export async function restoreDeviceState(page, state) {
  if (state?.cookies?.length) await page.setCookie(...state.cookies);
}

/**
 * Wraps a scraper's post-login step: keeps the library's own wait, then handles a one-time-code screen
 * if one appears, and reports the bank's device cookies after the login completes.
 */
export function wrapLogin(scraper, { onOtpNeeded, onDeviceState = () => {}, log = console.log }) {
  if (typeof scraper.getLoginOptions !== 'function') return; // API-based scrapers have no browser login
  const original = scraper.getLoginOptions.bind(scraper);
  scraper.getLoginOptions = (credentials) => {
    const opts = original(credentials);
    const own = opts.postAction;
    return {
      ...opts,
      postAction: async () => {
        try { if (own) await own(); } catch { /* a stuck redirect usually means a code screen; handled below */ }
        await postLoginWithOtp(scraper.page, opts, { onOtpNeeded, log });
        onDeviceState(await captureDeviceState(scraper.page).catch(() => null));
      },
    };
  };
}
