const express   = require('express');
const puppeteer = require('puppeteer');
const cors      = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Store browser sessions (sessionId → { browser, page })
const sessions = {};

// ─────────────────────────────────────────────
// Health check — Render pings this to keep alive
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'CIBIL Backend Running ✅', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// ROUTE 1: Fill Urban Money form
// Frontend calls this after user submits details
// ─────────────────────────────────────────────
app.post('/api/fill-form', async (req, res) => {
  const { name, dob, mobile, email, pan, sessionId } = req.body;

  console.log(`[fill-form] Starting for mobile: ${mobile}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // Set real browser user agent to avoid bot detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setViewport({ width: 1280, height: 800 });

    console.log('[fill-form] Opening Urban Money...');
    await page.goto('https://www.urbanmoney.com/credit-score', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for form to load
    await page.waitForSelector('input', { timeout: 15000 });
    await delay(1500);

    // ── FILL FULL NAME ──
    await fillField(page, [
      'input[name="fullName"]',
      'input[placeholder*="Full Name"]',
      'input[placeholder*="full name"]',
      'input[id*="name"]',
      'input[id*="Name"]'
    ], name);

    // ── FILL DOB (DD-MM-YYYY format) ──
    await fillField(page, [
      'input[name="dateOfBirth"]',
      'input[placeholder*="DD-MM-YYYY"]',
      'input[placeholder*="DOB"]',
      'input[placeholder*="Date"]',
      'input[id*="dob"]',
      'input[id*="DOB"]',
      'input[type="date"]'
    ], dob);

    // ── FILL MOBILE ──
    await fillField(page, [
      'input[name="mobileNumber"]',
      'input[name="mobile"]',
      'input[placeholder*="Mobile"]',
      'input[placeholder*="Phone"]',
      'input[type="tel"]',
      'input[id*="mobile"]'
    ], mobile);

    // ── FILL EMAIL ──
    await fillField(page, [
      'input[name="email"]',
      'input[name="emailId"]',
      'input[placeholder*="Email"]',
      'input[type="email"]',
      'input[id*="email"]'
    ], email);

    // ── FILL PAN ──
    await fillField(page, [
      'input[name="panNumber"]',
      'input[name="pan"]',
      'input[placeholder*="PAN"]',
      'input[placeholder*="Pan"]',
      'input[id*="pan"]',
      'input[id*="PAN"]'
    ], pan);

    // ── TICK CONSENT CHECKBOX ──
    try {
      const checkboxes = await page.$$('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const isChecked = await page.evaluate(el => el.checked, cb);
        if (!isChecked) {
          await cb.click();
          await delay(300);
        }
      }
      console.log('[fill-form] Checkboxes handled');
    } catch(e) {
      console.log('[fill-form] No checkbox found:', e.message);
    }

    await delay(1000);

    // ── CLICK SUBMIT BUTTON ──
    const submitClicked = await clickButton(page, [
      'button[type="submit"]',
      'button:contains("Check Credit Score")',
      'button:contains("Get Credit Score")',
      'button:contains("Submit")',
      'input[type="submit"]',
      '.submit-btn',
      '#submitBtn'
    ]);

    if (!submitClicked) {
      throw new Error('Could not find submit button on Urban Money form');
    }

    console.log('[fill-form] Submit clicked, waiting for OTP screen...');

    // ── WAIT FOR OTP INPUT TO APPEAR ──
    await page.waitForSelector([
      'input[placeholder*="OTP"]',
      'input[placeholder*="otp"]',
      'input[maxlength="6"]',
      'input[name*="otp"]',
      '#otp',
      '.otp-input'
    ].join(', '), { timeout: 25000 });

    console.log('[fill-form] OTP screen appeared!');

    // Save session for OTP step
    sessions[sessionId] = { browser, page };

    // Auto-cleanup after 10 minutes
    setTimeout(async () => {
      if (sessions[sessionId]) {
        await sessions[sessionId].browser.close().catch(()=>{});
        delete sessions[sessionId];
        console.log(`[cleanup] Session ${sessionId} auto-closed`);
      }
    }, 10 * 60 * 1000);

    res.json({ success: true, sessionId, message: 'OTP sent by Urban Money' });

  } catch (err) {
    console.error('[fill-form] ERROR:', err.message);
    if (browser) await browser.close().catch(()=>{});
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// ROUTE 2: Submit OTP to Urban Money
// User enters OTP on your site → this enters it on Urban Money
// ─────────────────────────────────────────────
app.post('/api/submit-otp', async (req, res) => {
  const { sessionId, otp } = req.body;

  console.log(`[submit-otp] OTP: ${otp} for session: ${sessionId}`);

  const session = sessions[sessionId];
  if (!session) {
    return res.status(400).json({ success: false, message: 'Session expired. Please start again.' });
  }

  const { browser, page } = session;

  try {
    // ── ENTER OTP ──
    const otpFilled = await fillField(page, [
      'input[placeholder*="OTP"]',
      'input[placeholder*="otp"]',
      'input[maxlength="6"]',
      'input[name*="otp"]',
      '#otp',
      '.otp-input'
    ], otp);

    if (!otpFilled) throw new Error('OTP input field not found');

    await delay(500);

    // ── CLICK OTP SUBMIT ──
    await clickButton(page, [
      'button[type="submit"]',
      'button:contains("Verify")',
      'button:contains("Submit")',
      'button:contains("Proceed")',
      '.verify-btn',
      '#verifyOtp'
    ]);

    console.log('[submit-otp] OTP submitted, waiting for score...');

    // ── WAIT FOR SCORE RESULT PAGE ──
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
      .catch(() => {}); // navigation may not always fire

    await delay(3000);

    // ── SCRAPE CIBIL SCORE ──
    const scoreData = await page.evaluate(() => {
      // Try multiple possible score element selectors
      const selectors = [
        '[class*="score"]',
        '[class*="cibil"]',
        '[class*="credit-score"]',
        '[class*="creditScore"]',
        'h1', 'h2', 'h3'
      ];

      let scoreText = null;
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const txt = el.textContent.trim();
          const num = parseInt(txt.replace(/\D/g,''));
          if (num >= 300 && num <= 900) {
            scoreText = num;
            break;
          }
        }
        if (scoreText) break;
      }

      // Try to get extra report fields
      const getText = (selList) => {
        for (const s of selList) {
          const el = document.querySelector(s);
          if (el) return el.textContent.trim();
        }
        return null;
      };

      return {
        score: scoreText,
        pageTitle: document.title,
        pageUrl: window.location.href
      };
    });

    console.log('[submit-otp] Score data:', scoreData);

    // Cleanup session
    await browser.close().catch(()=>{});
    delete sessions[sessionId];

    if (!scoreData.score) {
      // OTP might be wrong — check page URL/title
      const currentUrl = await page.url().catch(()=>'');
      if (currentUrl.includes('otp') || currentUrl.includes('verify')) {
        throw new Error('OTP_WRONG');
      }
    }

    res.json({
      success: true,
      score:               scoreData.score || 0,
      active_loans:        null,
      credit_cards:        null,
      overdue_accounts:    null,
      total_credit_limit:  null,
      credit_utilisation:  null,
      oldest_account:      null
    });

  } catch (err) {
    console.error('[submit-otp] ERROR:', err.message);

    if (err.message === 'OTP_WRONG') {
      return res.status(400).json({ success: false, message: 'OTP_FAIL' });
    }

    await browser.close().catch(()=>{});
    delete sessions[sessionId];
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// ROUTE 3: Resend OTP
// ─────────────────────────────────────────────
app.post('/api/resend-otp', async (req, res) => {
  const { sessionId } = req.body;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(400).json({ success: false, message: 'Session expired' });
  }

  try {
    await clickButton(session.page, [
      'a:contains("Resend")',
      'button:contains("Resend")',
      '[class*="resend"]',
      '#resendOtp',
      '.resend-otp'
    ]);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────
// HELPER: Fill a field trying multiple selectors
// ─────────────────────────────────────────────
async function fillField(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ clickCount: 3 }); // select all
        await el.type(value, { delay: 60 });
        console.log(`  ✓ Filled "${sel}" with "${value}"`);
        return true;
      }
    } catch(e) { /* try next */ }
  }
  console.warn(`  ✗ Could not fill any of: ${selectors.join(', ')}`);
  return false;
}

// ─────────────────────────────────────────────
// HELPER: Click a button trying multiple selectors
// ─────────────────────────────────────────────
async function clickButton(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        console.log(`  ✓ Clicked "${sel}"`);
        return true;
      }
    } catch(e) { /* try next */ }
  }
  // Last resort: evaluate in page context
  try {
    await page.evaluate((sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el) { el.click(); return true; }
      }
      // Try text match
      const buttons = [...document.querySelectorAll('button, input[type="submit"], a')];
      const keywords = ['submit','check','verify','proceed','get score','credit score'];
      for (const btn of buttons) {
        const txt = btn.textContent.toLowerCase();
        if (keywords.some(k => txt.includes(k))) {
          btn.click();
          return true;
        }
      }
    }, selectors);
    return true;
  } catch(e) {}
  return false;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

app.listen(PORT, () => {
  console.log(`✅ CIBIL Backend running on port ${PORT}`);
});
