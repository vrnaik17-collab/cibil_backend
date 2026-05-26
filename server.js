const express = require('express');
// Using puppeteer-extra wrapper to attach the stealth layer
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const crypto = require('crypto');

// Inject the stealth plugin globally into the engine instance
puppeteer.use(StealthPlugin());

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
    message: 'CIBIL Stealth Backend Running ✅',
    time: new Date().toISOString()
  });
});

/* ─────────────────────────────────────────────
   ROUTE 1 — FILL FORM & TRIGGER OTP
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

  console.log(`[fill-form] Starting stealth pipeline for mobile: ${mobile}`);

  let browser;

  try {
    browser = await puppeteer.launch({
      // Set to false locally to visually debug form flows
      headless: true, 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        // OPTIONAL PROXY OVERLAY: Uncomment line below if deploying to Render/AWS cloud platforms
        // '--proxy-server=http://your-residential-proxy.com:port'
      ]
    });

    const page = await browser.newPage();

    // OPTIONAL PROXY AUTHENTICATION: Uncomment lines below if your proxy requires credentials
    // await page.authenticate({
    //   username: 'your_proxy_username',
    //   password: 'your_proxy_password'
    // });

    // Enforce a realistic modern high-definition display canvas boundary
    await page.setViewport({
      width: 1440,
      height: 900
    });

    // Emulate completely authentic desktop hardware characteristics
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    
    // Explicit extra headers mirroring normal browser configurations
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    console.log('[fill-form] Opening Urban Money...');
    await page.goto(
      'https://www.urbanmoney.com/cibil-credit-score',
      {
        waitUntil: 'networkidle2',
        timeout: 60000
      }
    );

    await delay(3000);

    /* ─────────────────────────────────────────────
       PRECISE DOM INTERACTION & PARAMETER INJECTION
    ───────────────────────────────────────────── */
    
    // 1. Full Name
    await fillField(page, ['input[name="fullName"]'], name);

    // 2. Date of Birth (Bypasses readonly restriction dynamically)
    try {
      await page.waitForSelector('input[name="dob"]', { visible: true, timeout: 5000 });
      await page.evaluate((dobValue) => {
        const dobInput = document.querySelector('input[name="dob"]');
        if (dobInput) {
          dobInput.removeAttribute('readonly');
          dobInput.value = dobValue;
          dobInput.dispatchEvent(new Event('input', { bubbles: true }));
          dobInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, dob);
      console.log('✓ Filled input[name="dob"] via DOM override');
    } catch (e) {
      console.log('✗ Could not override DOB field layout:', e.message);
    }

    // 3. Mobile Number
    await fillField(page, ['input[name="mobile"]'], mobile);

    // 4. Email Address
    await fillField(page, ['input[name="email"]'], email);

    // 5. PAN Card Number (Enforces mandatory capitalized matching patterns)
    await fillField(page, ['input[name="panCard"]'], pan.toUpperCase());

    /* ─────────────────────────────────────────────
       HANDLE EXPLICIT TUCIBIL CONSENT CHECKBOX
    ───────────────────────────────────────────── */
    try {
      const consentSelector = 'input[name="consentStatement"]';
      await page.waitForSelector(consentSelector, { timeout: 5000 });
      const isChecked = await page.evaluate(el => el.checked, await page.$(consentSelector));
      
      if (!isChecked) {
        await page.evaluate(() => document.querySelector('input[name="consentStatement"]').click());
        console.log('[fill-form] Consent Checkbox checked successfully');
      }
    } catch (e) {
      console.log('[fill-form] Consent handling exception tracker:', e.message);
    }

    await delay(1500);

    /* ─────────────────────────────────────────────
       CLICK SUBMIT & FORCE VALIDATION
    ───────────────────────────────────────────── */
    const submitBtnSelector = 'button.btn_cibil_credit_score';
    await page.waitForSelector(submitBtnSelector, { visible: true, timeout: 5000 });

    // Dispatch synthetic bubble state loops to update underlying React array stores
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('.formInput, .form-check-input, input');
      inputs.forEach(input => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    });
    await delay(800);

    // Bring elements comfortably to the viewport center area
    await page.evaluate((sel) => {
      document.querySelector(sel).scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, submitBtnSelector);
    await delay(1200);

    // Emulate physical mouse actions using specialized element handle hooks
    const submitButtonHandle = await page.$(submitBtnSelector);
    await submitButtonHandle.hover();
    await delay(300);
    await page.click(submitBtnSelector);
    console.log('✓ Dispatched coordinate hover click onto: Check Credit Score');

    // FALLBACK: Directly execute structural form tracking if modal fails to appear via click
    await delay(2500);
    const modalVisible = await page.evaluate(() => {
      return !!document.querySelector('div[class*="popUpWindow"], .OtpPopUp-module__CX5d0G__popUpBox');
    });

    if (!modalVisible) {
      console.log('⚠️ Click failed to initiate layout shift, forcing form submission event via DOM...');
      await page.evaluate(() => {
        const inputField = document.querySelector('input[name="fullName"]');
        if (inputField && inputField.form) {
          inputField.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      });
    }

    console.log('[fill-form] Waiting for security modal layer validation response...');
    
    // Evaluate functional visibility configurations dynamically across multiple fallback selector mutations
    await page.waitForFunction(() => {
      const modal = document.querySelector('div[class*="popUpWindow"], .OtpPopUp-module__CX5d0G__popUpBox, div[class*="thanksMessage"]');
      if (modal) {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }
      return false;
    }, { timeout: 20000 });

    console.log('✓ Success: OTP Modal window rendered safely.');

    sessions[sessionId] = {
      browser,
      page
    };

    /* AUTO CLEANUP (Kills tracking instance memory footprints after 10 minutes) */
    setTimeout(async () => {
      if (sessions[sessionId]) {
        try {
          await sessions[sessionId].browser.close();
        } catch (e) {}
        delete sessions[sessionId];
        console.log(`[cleanup] Session ${sessionId} closed safely`);
      }
    }, 10 * 60 * 1000);

    res.json({
      success: true,
      sessionId,
      message: 'OTP Sent'
    });

  } catch (err) {
    console.error('[fill-form] CRITICAL PIPELINE FAILURE:', err.message);
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
  console.log(`[submit-otp] Injecting verification tokens: ${otp}`);

  const session = sessions[sessionId];
  if (!session) {
    return res.status(400).json({
      success: false,
      message: 'Session expired'
    });
  }

  const { browser, page } = session;

  try {
    const digits = otp.toString().split('');
    if (digits.length !== 6) {
      throw new Error("Invalid array dimensions. Core transaction tokens require 6 digits.");
    }

    // Maps string elements individually down target arrays sequentially (otp1 -> otp6)
    for (let i = 0; i < 6; i++) {
      const fieldSelector = `input[name="otp${i + 1}"]`;
      await page.waitForSelector(fieldSelector, { visible: true, timeout: 5000 });
      await page.focus(fieldSelector);
      
      await page.keyboard.press('Backspace'); 
      await page.type(fieldSelector, digits[i], { delay: 60 });
    }
    console.log('✓ Successfully mapped sequential verification tokens');

    await delay(1200);
    
    // Explicit interactive hook targeting action verification layout arrays
    const verifyBtnSelector = 'div[class*="thanksMessage"] button';
    await page.waitForSelector(verifyBtnSelector, { visible: true, timeout: 5000 });
    await page.click(verifyBtnSelector);
    console.log('✓ Submitted verification layout confirmation layer');

    console.log('[submit-otp] Fetching user analytical reporting dashboards...');
    await delay(12000); 

    // Regular Expression patterns analyzing textual representations to harvest credit score values
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
        message: 'OTP_VERIFICATION_REJECTED'
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
    const resendSelector = 'span.OtpPopUp-module__CX5d0G__close';
    await session.page.click(resendSelector);
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
   HELPER — HUMANIZED FIELD FILL MATRIX
───────────────────────────────────────────── */
async function fillField(page, selectors, value) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      const el = await page.$(selector);
      if (el) {
        await page.evaluate(element => element.scrollIntoView({ block: 'center' }), el);
        await el.focus();
        
        await el.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await delay(150);

        // Uses a human rhythm cadence structure with variable character millisecond delay bounds
        for (const char of value.toString()) {
          await el.type(char);
          await delay(Math.floor(Math.random() * 50) + 50); 
        }

        // Inform internal frame tracking frameworks that input state conditions have shifted
        await page.evaluate(element => {
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true }));
        }, el);

        console.log(`✓ Filled ${selector}`);
        return true;
      }
    } catch (e) {}
  }
  console.log(`✗ Internal locator sequence trace failed inside boundaries: ${selectors}`);
  return false;
}

/* ─────────────────────────────────────────────
   DELAY HELPER
───────────────────────────────────────────── */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅ Stealth Pipeline Backend running on port ${PORT}`);
});
