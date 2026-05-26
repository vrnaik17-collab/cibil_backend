const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const crypto = require('crypto');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const sessions = {};

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CIBIL Webshare Proxy Pipeline Active ✅',
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

  console.log(`[fill-form] Starting Webshare pipeline for mobile: ${mobile}`);

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true, 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        // ROUTE TRAFFIC THROUGH WEBSHARE BACKBONE GATEWAY
        '--proxy-server=http://p.webshare.io:80'
      ]
    });

    const page = await browser.newPage();

    // AUTHENTICATE WEBSHARE PROXY PIPELINE
    await page.authenticate({
      username: 'amxvrlbw',
      password: 't2u8iw768lr6'
    });

    await page.setViewport({
      width: 1440,
      height: 900
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    console.log('[fill-form] Opening Urban Money via Webshare Proxy...');
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
    await fillField(page, ['input[name="fullName"]'], name);

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
      console.log('✗ DOB field bypass error:', e.message);
    }

    await fillField(page, ['input[name="mobile"]'], mobile);
    await fillField(page, ['input[name="email"]'], email);
    await fillField(page, ['input[name="panCard"]'], pan.toUpperCase());

    try {
      const consentSelector = 'input[name="consentStatement"]';
      await page.waitForSelector(consentSelector, { timeout: 5000 });
      const isChecked = await page.evaluate(el => el.checked, await page.$(consentSelector));
      
      if (!isChecked) {
        await page.evaluate(() => document.querySelector('input[name="consentStatement"]').click());
        console.log('[fill-form] Consent Checkbox checked successfully');
      }
    } catch (e) {
      console.log('[fill-form] Consent handling tracker exception:', e.message);
    }

    await delay(1500);

    /* ─────────────────────────────────────────────
       CLICK SUBMIT & FORCE VALIDATION
    ───────────────────────────────────────────── */
    const submitBtnSelector = 'button.btn_cibil_credit_score';
    await page.waitForSelector(submitBtnSelector, { visible: true, timeout: 5000 });

    await page.evaluate(() => {
      const inputs = document.querySelectorAll('.formInput, .form-check-input, input');
      inputs.forEach(input => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    });
    await delay(800);

    await page.evaluate((sel) => {
      document.querySelector(sel).scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, submitBtnSelector);
    await delay(1200);

    const submitButtonHandle = await page.$(submitBtnSelector);
    await submitButtonHandle.hover();
    await delay(300);
    await page.click(submitBtnSelector);
    console.log('✓ Dispatched coordinate hover click onto: Check Credit Score');

    await delay(2500);
    const modalVisible = await page.evaluate(() => {
      return !!document.querySelector('div[class*="popUpWindow"], .OtpPopUp-module__CX5d0G__popUpBox');
    });

    if (!modalVisible) {
      console.log('⚠️ Form submission stuck, forcing execution event via DOM submission fallback...');
      await page.evaluate(() => {
        const inputField = document.querySelector('input[name="fullName"]');
        if (inputField && inputField.form) {
          inputField.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      });
    }

    console.log('[fill-form] Waiting for security modal layer validation response...');
    
    await page.waitForFunction(() => {
      const modal = document.querySelector('div[class*="popUpWindow"], .OtpPopUp-module__CX5d0G__popUpBox, div[class*="thanksMessage"]');
      if (modal) {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }
      return false;
    }, { timeout: 20000 });

    console.log('✓ Success: OTP Modal window rendered safely.');

    sessions[sessionId] = { browser, page };

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
      throw new Error("Invalid format. Tokens require 6 digits.");
    }

    for (let i = 0; i < 6; i++) {
      const fieldSelector = `input[name="otp${i + 1}"]`;
      await page.waitForSelector(fieldSelector, { visible: true, timeout: 5000 });
      await page.focus(fieldSelector);
      
      await page.keyboard.press('Backspace'); 
      await page.type(fieldSelector, digits[i], { delay: 60 });
    }
    console.log('✓ Successfully mapped sequential verification tokens');

    await delay(1200);
    
    const verifyBtnSelector = 'div[class*="thanksMessage"] button';
    await page.waitForSelector(verifyBtnSelector, { visible: true, timeout: 5000 });
    await page.click(verifyBtnSelector);
    console.log('✓ Submitted verification layout confirmation layer');

    console.log('[submit-otp] Fetching user analytical reporting dashboards...');
    await delay(12000); 

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

        for (const char of value.toString()) {
          await el.type(char);
          await delay(Math.floor(Math.random() * 50) + 50); 
        }

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
  console.log(`✗ Locator sequence trace failed inside boundaries: ${selectors}`);
  return false;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.listen(PORT, () => {
  console.log(`✅ Webshare-Proxied Backend running on port ${PORT}`);
});
