const express = require('express');
const cors = require('cors');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();

app.use(cors());
app.use(express.json());

const sessions = {};

app.get('/', (req, res) => {
  res.send('Backend running');
});

/* START SESSION */
app.post('/api/fill-form', async (req, res) => {
  try {

    const { name, dob, mobile, email, pan } = req.body;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox']
    });

    const page = await browser.newPage();

    await page.goto(
      'https://www.urbanmoney.com/credit-score/',
      { waitUntil: 'networkidle2' }
    );

    // IMPORTANT:
    // Update these selectors after inspection

    await page.type('input[name="name"]', name);
    await page.type('input[name="mobile"]', mobile);
    await page.type('input[name="email"]', email);
    await page.type('input[name="pan"]', pan);

    const sessionId =
      Date.now().toString();

    sessions[sessionId] = {
      browser,
      page
    };

    return res.json({
      success: true,
      sessionId
    });

  } catch (e) {
    console.error(e);

    return res.status(500).json({
      success: false,
      message: e.message
    });
  }
});

/* SUBMIT OTP */
app.post('/api/submit-otp', async (req, res) => {

  try {

    const { sessionId, otp } = req.body;

    const sess = sessions[sessionId];

    if (!sess) {
      return res.status(400).json({
        success: false,
        message: 'Session expired'
      });
    }

    const { page, browser } = sess;

    await page.type('input[name="otp"]', otp);

    // submit button
    // await page.click(...)

    await page.waitForTimeout(5000);

    // DEMO score
    const score = 782;

    await browser.close();

    delete sessions[sessionId];

    return res.json({
      success: true,
      score
    });

  } catch (e) {

    return res.status(500).json({
      success: false,
      message: e.message
    });
  }

});

app.listen(3001, () => {
  console.log('Running on 3001');
});
