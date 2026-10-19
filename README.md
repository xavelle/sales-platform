# Sales Platform — All-in-one AI Sales App

Facebook Messenger + Website chat + AI chatbot + Order management, এক dashboard-এ।
(WhatsApp option ready — API দিলে plug করা যাবে।)

## চালানো (Run)

```bash
cd sales-platform
cp .env.example .env
npm install
npm run seed     # demo data (1st time)
npm start
```

Browser-এ খুলুন: **http://localhost:3000**

## Website-এ chat widget বসানো

```html
<script src="http://YOUR-SERVER:3000/widget.js" data-api="http://YOUR-SERVER:3000"></script>
```

## Facebook Messenger connect করা

1. [developers.facebook.com](https://developers.facebook.com) → App বানান → Messenger product add
2. Webhook URL: `https://YOUR-SERVER/webhook/messenger`
   Verify Token: `.env`-এর `FB_VERIFY_TOKEN`
3. Page Access Token নিয়ে `.env`-এ বসান:
   ```
   FB_PAGE_ACCESS_TOKEN=...
   ```
4. Server restart করুন — Messenger চালু!

## WhatsApp চালু করা (পরে)

`.env`-এ:
```
WHATSAPP_ENABLED=true
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```
তারপর `src/channels/whatsapp.js`-এর TODO অংশ implement করুন (Messenger-এর মতোই pattern)।

## AI brain

- `GEMINI_API_KEY` দিলে (https://aistudio.google.com — free) smart AI reply দেবে
- না দিলে built-in demo brain চলবে (বাংলা keyword-based)

## Features

- 💬 Unified Inbox (website + Messenger, AI auto-reply on/off)
- 📦 Orders (create, status: pending → delivered)
- 👗 Products CRUD
- 📢 Broadcast
- 🧠 AI Setup (business info, FAQs — AI এগুলো শিখে উত্তর দেয়)
- 📊 Analytics
- 📞 Tap-to-call (customer number-এ)
