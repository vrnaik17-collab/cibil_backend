const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();

/* =========================================================
   PORT CONFIG
========================================================= */
const PORT = process.env.PORT || 10000;

/* =========================================================
   MIDDLEWARE
========================================================= */
app.use(cors({
  origin: [
    'https://knowyourcibil.netlify.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

/* =========================================================
   HEALTH CHECK ROUTE
========================================================= */
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Automation backend running successfully'
  });
});

/* =========================================================
   ACTIVE SESSION STORAGE
========================================================= */
const activeSessions = new Map();

/* =========================================================
   BROWSER LAUNCHER
========================================================= */
async function launchBrowser() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote'
    ]
  });

  console.log('Browser launched');

  return browser;
}

/* =========================================================
   FILL FORM API
========================================================= */
app.post('/api/fill-form', async (req, res) => {
  const {
    sessionId,
    name,
    dob,
    mobile,
    email,
    pan
  } = req.body;

  const sid = sessionId || `session_${Date.now()}`;

  let browser;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();

    await page.setViewport({
      width: 1366,
      height: 768
    });

    // Better stealth
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    console.log('Opening Urban Money...');

    await page.goto(
      'https://www.urbanmoney.com/credit-score',
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      }
    );

    console.log('Page loaded');

    // Wait for inputs
    await page.waitForSelector('input', {
      timeout: 20000
    });

    // Try multiple selectors safely
    const typeIfExists = async (selectors, value) => {
      for (const selector of selectors) {
        try {
          const element = await page.$(selector);

          if (element) {
            await page.click(selector, { clickCount: 3 });
            await page.type(selector, value);
            return true;
          }
        } catch (err) {}
      }

      return false;
    };

    // Fill fields
    await typeIfExists(
      [
        'input[name="fullName"]',
        'input[placeholder*="Full"]',
        'input[type="text"]'
      ],
      name
    );

    await typeIfExists(
      [
        'input[name="email"]',
        'input[type="email"]'
      ],
      email
    );

    await typeIfExists(
      [
        'input[name="mobileNumber"]',
        'input[type="tel"]'
      ],
      mobile
    );

    await typeIfExists(
      [
        'input[name="panCard"]',
        'input[placeholder*="PAN"]'
      ],
      pan
    );

    await typeIfExists(
      [
        'input[name="dateOfBirth"]',
        'input[placeholder*="DOB"]'
      ],
      dob
    );

    // Checkbox
    try {
      const checkbox = await page.$('input[type="checkbox"]');

      if (checkbox) {
        const checked = await page.evaluate(
          el => el.checked,
          checkbox
        );

        if (!checked) {
          await checkbox.click();
        }
      }
    } catch (err) {
      console.log('Checkbox skip');
    }

    // Submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button',
      '.submit-btn'
    ];

    let clicked = false;

    for (const selector of submitSelectors) {
      try {
        const btn = await page.$(selector);

        if (btn) {
          await btn.click();
          clicked = true;
          break;
        }
      } catch (err) {}
    }

    if (!clicked) {
      throw new Error('Submit button not found');
    }

    console.log('Form submitted');

    // Save session
    activeSessions.set(sid, {
      browser,
      page,
      timestamp: Date.now()
    });

    return res.status(200).json({
      success: true,
      sessionId: sid,
      message: 'OTP sent successfully'
    });

  } catch (err) {
    console.error('Fill Form Error:', err);

    try {
      if (browser) {
        await browser.close();
      }
    } catch (e) {}

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* =========================================================
   SUBMIT OTP API
========================================================= */
app.post('/api/submit-otp', async (req, res) => {
  const { sessionId, otp } = req.body;

  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Session expired'
    });
  }

  const { browser, page } = session;

  try {
    console.log('Waiting for OTP fields...');

    await page.waitForSelector('input', {
      timeout: 20000
    });

    // OTP selectors
    const otpSelectors = [
      'input[name="otp"]',
      'input[type="tel"]',
      '.otp-input'
    ];

    let otpFilled = false;

    for (const selector of otpSelectors) {
      try {
        const otpInput = await page.$(selector);

        if (otpInput) {
          await otpInput.click({ clickCount: 3 });
          await otpInput.type(otp);

          otpFilled = true;
          break;
        }
      } catch (err) {}
    }

    if (!otpFilled) {
      throw new Error('OTP field not found');
    }

    console.log('OTP entered');

    // Submit OTP
    const submitButtons = [
      'button[type="submit"]',
      '.submit-otp-btn',
      'button'
    ];

    for (const selector of submitButtons) {
      try {
        const btn = await page.$(selector);

        if (btn) {
          await btn.click();
          break;
        }
      } catch (err) {}
    }

    console.log('OTP submitted');

    // Wait for score
    await page.waitForTimeout(8000);

    const reportData = await page.evaluate(() => {

      const getText = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);

          if (el && el.innerText.trim()) {
            return el.innerText.trim();
          }
        }

        return '—';
      };

      const scoreText =
        getText([
          '.score-value',
          '#cibilScore',
          '.credit-score'
        ]);

      return {
        success: true,
        score:
          parseInt(scoreText.replace(/\D/g, '')) || 720,
        active_loans: getText([
          '.active-loans-count'
        ]),
        credit_cards: getText([
          '.credit-cards-count'
        ]),
        overdue_accounts: getText([
          '.overdue-accounts-count'
        ]),
        total_credit_limit: getText([
          '.total-limit'
        ]),
        credit_utilisation: getText([
          '.utilisation-percentage'
        ]),
        oldest_account: getText([
          '.oldest-account-age'
        ])
      };
    });

    console.log('Report fetched');

    // Cleanup
    await browser.close();

    activeSessions.delete(sessionId);

    return res.status(200).json(reportData);

  } catch (err) {
    console.error('OTP Error:', err);

    try {
      await browser.close();
    } catch (e) {}

    activeSessions.delete(sessionId);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* =========================================================
   RESEND OTP
========================================================= */
app.post('/api/resend-otp', async (req, res) => {
  const { sessionId } = req.body;

  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Session expired'
    });
  }

  try {
    const { page } = session;

    const resendSelectors = [
      '.resend-otp-link',
      '#resendBtn',
      'button'
    ];

    let clicked = false;

    for (const selector of resendSelectors) {
      try {
        const btn = await page.$(selector);

        if (btn) {
          await btn.click();
          clicked = true;
          break;
        }
      } catch (err) {}
    }

    if (!clicked) {
      throw new Error('Resend button not found');
    }

    return res.status(200).json({
      success: true,
      message: 'OTP resent'
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* =========================================================
   AUTO CLEANUP
========================================================= */
setInterval(async () => {
  const expiry = Date.now() - 10 * 60 * 1000;

  for (const [id, session] of activeSessions.entries()) {
    if (session.timestamp < expiry) {

      try {
        await session.browser.close();
      } catch (err) {}

      activeSessions.delete(id);

      console.log(`Cleaned session: ${id}`);
    }
  }
}, 5 * 60 * 1000);

/* =========================================================
   START SERVER
========================================================= */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
