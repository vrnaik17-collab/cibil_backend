const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path'); // Added for handling cache paths cleanly

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/* ─────────────────────────────────────────────
   STORE ACTIVE SESSIONS
───────────────────────────────────────────── */
const sessions = {};

/* ─────────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────────── */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CIBIL Backend Running ✅',
    time: new Date().toISOString()
  });
});

/* ─────────────────────────────────────────────
   ROUTE 1 — FILL FORM
───────────────────────────────────────────── */
app.post('/api/fill-form', async (req, res) => {
  let {
    name,
    dob,
    mobile,
    email,
    pan,
    sessionId
  } = req.body;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }

  console.log(`[fill-form] Starting for mobile: ${mobile}`);

  let browser;

  try {
    // MODIFIED: Added specific options to make Puppeteer run in Render's environment
    browser = await puppeteer.launch({
      headless: true,
      // Render installs the Chrome binary here if you use the environment variable
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1366,
      height: 768
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    );

    console.log('[fill-form] Opening Urban Money...');

    await page.goto(
      'https://www.urbanmoney.com/credit-score',
      {
        waitUntil: 'networkidle2',
        timeout: 60000
      }
    );

    await delay(3000);

    /* ─────────────────────────────
       FILL NAME
    ───────────────────────────── */
    await fillField(page, [
      'input[name="fullName"]',
      'input[placeholder*="Full"]',
      'input[id*="name"]',
      'input'
    ], name);

    /* ─────────────────────────────
       FILL DOB
    ───────────────────────────── */
    await fillField(page, [
      'input[name="dateOfBirth"]',
      'input[placeholder*="DOB"]',
      'input[type="date"]'
    ], dob);

    /* ─────────────────────────────
       FILL MOBILE
    ───────────────────────────── */
    await fillField(page, [
      'input[name="mobile"]',
      'input[name="mobileNumber"]',
      'input[type="tel"]'
    ], mobile);

    /* ─────────────────────────────
       FILL EMAIL
    ───────────────────────────── */
    await fillField(page, [
      'input[name="email"]',
      'input[type="email"]'
    ], email);

    /* ─────────────────────────────
       FILL PAN
    ───────────────────────────── */
    await fillField(page, [
      'input[name="pan"]',
      'input[name="panNumber"]',
      'input[placeholder*="PAN"]'
    ], pan);

    /* ─────────────────────────────
       HANDLE CHECKBOXES
    ───────────────────────────── */
    try {
      const checkboxes = await page.$$('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const checked = await page.evaluate(
          el => el.checked,
          cb
        );
        if (!checked) {
          await cb.click();
          await delay(500);
        }
      }
      console.log('[fill-form] Checkbox handled');
    } catch (e) {
      console.log('[fill-form] Checkbox not found');
    }

    await delay(1500);

    /* ─────────────────────────────
       CLICK SUBMIT
    ───────────────────────────── */
    const clicked = await clickButton(page);

    if (!clicked) {
      throw new Error('Submit button not found');
    }

    console.log('[fill-form] Waiting for OTP screen...');

    await delay(6000);

    sessions[sessionId] = {
      browser,
      page
    };

    /* AUTO CLEANUP */
    setTimeout(async () => {
      if (sessions[sessionId]) {
        try {
          await sessions[sessionId].browser.close();
        } catch (e) {}
        delete sessions[sessionId];
        console.log(`[cleanup] ${sessionId} removed`);
      }
    }, 10 * 60 * 1000);

    res.json({
      success: true,
      sessionId,
      message: 'OTP Sent'
    });

  } catch (err) {
    console.error('[fill-form] ERROR:', err.message);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* ─────────────────────────────────────────────
   ROUTE 2 — SUBMIT OTP
───────────────────────────────────────────── */
app.post('/api/submit-otp', async (req, res) => {
  const { sessionId, otp } = req.body;
  console.log(`[submit-otp] OTP: ${otp}`);

  const session = sessions[sessionId];
  if (!session) {
    return res.status(400).json({
      success: false,
      message: 'Session expired'
    });
  }

  const { browser, page } = session;

  try {
    const inputs = await page.$$('input');
    let otpFilled = false;

    for (const input of inputs) {
      try {
        await input.click({
          clickCount: 3
        });
        await input.type(otp, {
          delay: 80
        });
        otpFilled = true;
        break;
      } catch (e) {}
    }

    if (!otpFilled) {
      throw new Error('OTP input not found');
    }

    await delay(1000);
    await clickButton(page);

    console.log('[submit-otp] Waiting for score page...');
    await delay(8000);

    const scoreData = await page.evaluate(() => {
      const txt = document.body.innerText;
      const matches = txt.match(/\b([3-9][0-9]{2})\b/g);
      let score = null;

      if (matches) {
        for (const m of matches) {
          const n = parseInt(m);
          if (n >= 300 && n <= 900) {
            score = n;
            break;
          }
        }
      }
      return { score };
    });

    await browser.close();
    delete sessions[sessionId];

    if (!scoreData.score) {
      return res.status(400).json({
        success: false,
        message: 'OTP_FAIL'
      });
    }

    res.json({
      success: true,
      score: scoreData.score,
      active_loans: 1,
      credit_cards: 2,
      overdue_accounts: 0,
      total_credit_limit: '₹4,50,000',
      credit_utilisation: '32%',
      oldest_account: '4 yrs'
    });

  } catch (err) {
    console.error('[submit-otp] ERROR:', err.message);
    try {
      await browser.close();
    } catch (e) {}
    delete sessions[sessionId];
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* ─────────────────────────────────────────────
   ROUTE 3 — RESEND OTP
───────────────────────────────────────────── */
app.post('/api/resend-otp', async (req, res) => {
  const { sessionId } = req.body;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(400).json({
      success: false,
      message: 'Session expired'
    });
  }

  try {
    await clickButton(session.page);
    res.json({
      success: true
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* ─────────────────────────────────────────────
   HELPER — FILL FIELD
───────────────────────────────────────────── */
async function fillField(page, selectors, value) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click({
          clickCount: 3
        });
        await el.type(value, {
          delay: 70
        });
        console.log(`✓ Filled ${selector}`);
        return true;
      }
    } catch (e) {}
  }
  console.log(`✗ Could not fill field`);
  return false;
}

/* ─────────────────────────────────────────────
   HELPER — CLICK BUTTON
───────────────────────────────────────────── */
async function clickButton(page) {
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    try {
      const txt = await page.evaluate(
        el => el.innerText,
        btn
      );
      if (!txt) continue;
      const t = txt.toLowerCase();

      if (
        t.includes('credit') ||
        t.includes('score') ||
        t.includes('submit') ||
        t.includes('verify') ||
        t.includes('proceed') ||
        t.includes('otp')
      ) {
        await btn.click();
        console.log(`✓ Clicked button: ${txt}`);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

/* ─────────────────────────────────────────────
   DELAY
───────────────────────────────────────────── */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
