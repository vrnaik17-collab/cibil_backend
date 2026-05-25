# 🏦 CIBIL Score Automation Backend

Automation backend for fetching CIBIL scores via Urban Money.
Built with Node.js + Puppeteer + Express.

---

## ⚙️ How It Works

1. User fills their details on your frontend (Name, DOB, PAN, Mobile, Email)
2. This backend opens Urban Money in a headless browser
3. Auto-fills the form and clicks submit
4. Urban Money sends a real OTP to the user's mobile
5. User enters OTP on your frontend
6. This backend enters the OTP on Urban Money and fetches the score
7. Score is returned to your frontend and saved in Supabase

---

## 🗂️ Project Structure
