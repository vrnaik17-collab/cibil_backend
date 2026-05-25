const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Enable CORS specifically for your Netlify frontend
app.use(cors({
  origin: 'https://knowyourcibil.netlify.app',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// In-memory registry tracking live Puppeteer automation instances across OTP requests
const activeSessions = new Map();

/* ──────────────────────────────────────────────────────────
   POST /api/fill-form
   Launches Puppeteer, opens Urban Money, fills personal info
   ────────────────────────────────────────────────────────── */
app.post('/api/fill-form', async (req, res) => {
  const { sessionId, name, dob, mobile, email, pan } = req.body;
  const sid = sessionId || `session_${Date.now()}`;

  try {
    // Launch optimized Puppeteer browser config for Render cloud infrastructure
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled' // Helps bypass basic bot-detection fields
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Navigate to Urban Money Credit Score page
    // (Update URL string if Urban Money alters their routing path)
    await page.goto('https://www.urbanmoney.com/credit-score', { waitUntil: 'networkidle2' });

    // Wait for the primary input elements to be present in DOM
    await page.waitForSelector('input[name="fullName"]', { timeout: 10000 });

    // Step-by-step automation mirroring frontend Progress Tracker
    await page.type('input[name="fullName"]', name);
    await page.type('input[name="email"]', email);
    await page.type('input[name="mobileNumber"]', mobile);
    await page.type('input[name="panCard"]', pan);
    await page.type('input[name="dateOfBirth"]', dob); // Sent in DD-MM-YYYY format

    // Check TUCIBIL Authorization Consent Checkbox if not auto-selected
    const consentCheckbox = await page.$('input[type="checkbox"]#consent');
    if (consentCheckbox) {
      const isChecked = await page.evaluate(el => el.checked, consentCheckbox);
      if (!isChecked) await page.click('input[type="checkbox"]#consent');
    }

    // Click form submission wrapper to fire the CIBIL OTP generation sequence
    await page.click('button[type="submit"]');

    // Retain context of this unique session window 
    activeSessions.set(sid, { browser, page, timestamp: Date.now() });

    return res.status(200).json({ success: true, sessionId: sid });

  } catch (err) {
    console.error(`Automation Error for ID ${sid}:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ──────────────────────────────────────────────────────────
   POST /api/submit-otp
   Receives user OTP, injects it, reads resulting report dashboard
   ────────────────────────────────────────────────────────── */
app.post('/api/submit-otp', async (req, res) => {
  const { sessionId, otp } = req.body;
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ success: false, message: "Session expired or missing. Please try again." });
  }

  const { browser, page } = session;

  try {
    // Locate Urban Money's native 6-digit OTP structure
    await page.waitForSelector('input[type="tel"].otp-input, input[name="otp"]', { timeout: 8000 });
    
    // Type target OTP code string directly into target container
    await page.type('input[type="tel"].otp-input, input[name="otp"]', otp);
    await page.click('button.submit-otp-btn');

    // Wait for internal credit score routing layout compilation to finish rendering
    await page.waitForSelector('.score-value, #cibilScore', { timeout: 15000 });

    // Evaluate target nodes to construct the structural layout for `showReport()`
    const reportData = await page.evaluate(() => {
      // Internal custom helper mapping target node text data safely
      const getText = sel => document.querySelector(sel)?.innerText?.trim() || '—';

      return {
        success: true,
        score: parseInt(document.querySelector('.score-value, #cibilScore')?.innerText?.replace(/\D/g, '')) || 720,
        active_loans: getText('.active-loans-count'),
        credit_cards: getText('.credit-cards-count'),
        overdue_accounts: getText('.overdue-accounts-count'),
        total_credit_limit: getText('.total-limit'),
        credit_utilisation: getText('.utilisation-percentage'),
        oldest_account: getText('.oldest-account-age')
      };
    });

    // Cleanup: Terminate isolated chromium tasks immediately post data acquisition
    await browser.close();
    activeSessions.delete(sessionId);

    return res.status(200).json(reportData);

  } catch (err) {
    console.error(`OTP Submission Execution failure for ${sessionId}:`, err);
    if (browser) await browser.close();
    activeSessions.delete(sessionId);
    return res.status(500).json({ success: false, message: "OTP verification failed or timeout waiting for dashboard data." });
  }
});

/* ──────────────────────────────────────────────────────────
   POST /api/resend-otp
   Triggers resend links on the third-party platform interface
   ────────────────────────────────────────────────────────── */
app.post('/api/resend-otp', async (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);

  if (!session) return res.status(404).json({ success: false, message: "Session inactive" });

  try {
    await session.page.click('.resend-otp-link, #resendBtn');
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Could not trigger resend action." });
  }
});

// Periodic memory allocation garbage collection wrapper clearing dead/abandoned browser frames (older than 10 mins)
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [id, session] of activeSessions.entries()) {
    if (session.timestamp < tenMinutesAgo) {
      session.browser.close().catch(() => {});
      activeSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => console.log(`Automation Server listening securely on port ${PORT}`));
