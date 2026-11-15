// Facebook Messenger channel.
// Needs: FB_VERIFY_TOKEN, FB_PAGE_ACCESS_TOKEN in .env + webhook URL set in Meta app.
const { db, getSetting, findOrCreateCustomer, findOrCreateConversation, addMessage } = require('../db');
const { generateReply, generateImageReply } = require('../ai');
const { transcribeAudio } = require('../media');
const { getWebsiteProducts } = require('../website');
const { handleCartMessage } = require('../cart');

function verify(req, res) {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

async function sendMessage(psid, text) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) { console.log(`[messenger] no PAGE_ACCESS_TOKEN - would send to ${psid}: ${text}`); return false; }
  const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: psid }, message: { text } })
  });
  return res.ok;
}

// Facebook মাঝে মাঝে একই মেসেজ একাধিকবার পাঠায় (সার্ভার ঘুমিয়ে থাকলে retry হয়)।
// mid দেখে ডুপ্লিকেট আটকাই — এক মেসেজের উত্তর একবারই যাবে।
const seenMids = new Set();
function alreadySeen(mid) {
  if (!mid) return false;
  if (seenMids.has(mid)) return true;
  seenMids.add(mid);
  if (seenMids.size > 1000) {
    const it = seenMids.values();
    for (let i = 0; i < 500; i++) seenMids.delete(it.next().value);
  }
  return false;
}
const seenPostbacks = new Set();
function alreadySeenPostback(psid, payload, ts) {
  const key = `${psid}|${payload}|${ts}`;
  if (seenPostbacks.has(key)) return true;
  seenPostbacks.add(key);
  if (seenPostbacks.size > 1000) {
    const it = seenPostbacks.values();
    for (let i = 0; i < 500; i++) seenPostbacks.delete(it.next().value);
  }
  return false;
}

// কথোপকথনের শেষ ছবি — পরের লেখা ("এটা আছে?") এলে ওই ছবি ধরেই উত্তর দেওয়ার জন্য
const lastImageByConv = new Map();

/* ---------- মেনু / রেডি প্রশ্নের নির্দিষ্ট উত্তর (লাইভ ডাটা থেকে, AI-এর আন্দাজে নয়) ---------- */
// প্রোডাক্ট তালিকা — ওয়েবসাইটের লাইভ ক্যাটালগ থেকে (স্টকের সংখ্যা কখনো দেখানো হয় না, শুধু "সীমিত"/"শেষ")
async function productListText() {
  const site = await getWebsiteProducts();
  if (site && site.length) {
    if (site.length <= 8) {
      const lines = site.map(p => p.inStock ? `• ${p.nameEn} (${p.nameBn}) — ৳${p.price} (স্টক সীমিত)` : `• ${p.nameEn} (${p.nameBn}) — ৳${p.price} (স্টক শেষ)`);
      return `আমাদের প্রোডাক্টসমূহ:\n${lines.join('\n')}\nঅর্ডার করতে প্রোডাক্টের নাম লিখে পাঠান।`;
    }
    const counts = {};
    for (const p of site) { const c = p.category || 'অন্যান্য'; counts[c] = (counts[c] || 0) + 1; }
    const catLines = Object.entries(counts).map(([c, n]) => `${c} ${n}টি`).join(' · ');
    return `আমাদের ওয়েবসাইটে এখন ${site.length}টি প্রোডাক্ট আছে — ${catLines}।\nযেকোনো প্রোডাক্টের নাম লিখলেই দাম আর সাইজ বলে দিচ্ছি। পুরো ক্যাটালগ: ${getSetting('website', 'https://xavelle.github.io/xavelle/')}`;
  }
  const products = db.prepare('SELECT name, price, stock FROM products ORDER BY id').all();
  if (!products.length) return 'এখন নতুন কালেকশন আসছে — শীঘ্রই প্রোডাক্ট দেখতে পারবেন! কী ধরনের ডিজাইন খুঁজছেন, জানালে এসে গেলেই জানিয়ে দেব।';
  const lines = products.map(p => p.stock > 0 ? `• ${p.name} — ৳${p.price} (স্টক সীমিত)` : `• ${p.name} — ৳${p.price} (স্টক শেষ)`);
  return `আমাদের প্রোডাক্টসমূহ:\n${lines.join('\n')}\nঅর্ডার করতে প্রোডাক্টের নাম লিখে পাঠান।`;
}
function deliveryText() {
  return `🚚 ডেলিভারি চার্জ: ${getSetting('delivery_charge', 'ঢাকার ভেতরে ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা')}। ঢাকায় ১-২ দিন, ঢাকার বাইরে ২-৩ দিনে পৌঁছে যায়।\n💵 পেমেন্ট: ${getSetting('payment', 'ক্যাশ অন ডেলিভারি (COD)')}\n↩️ রিটার্ন: ${getSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে')}`;
}
function orderHelpText() {
  return 'অর্ডার করতে পছন্দের প্রোডাক্টের নাম, সাইজ, আপনার নাম, মোবাইল নম্বর আর সম্পূর্ণ ঠিকানা এখানেই পাঠিয়ে দিন — বাকিটা আমরা সাজিয়ে নেব।';
}
function codText() {
  return `হ্যাঁ, সারা বাংলাদেশে ${getSetting('payment', 'ক্যাশ অন ডেলিভারি (COD)')} সুবিধা আছে — প্রোডাক্ট হাতে পেয়ে টাকা দেবেন।`;
}

/* ---------- Get Started / মেনু / রেডি প্রশ্নের ট্যাপ ---------- */
async function handlePostback(psid, payload) {
  const customer = findOrCreateCustomer('messenger', String(psid));
  const conv = findOrCreateConversation(customer);
  const label = {
    GET_STARTED: '[Get Started চাপা হয়েছে]',
    MENU_PRODUCTS: '[মেনু: প্রোডাক্ট দেখুন]',
    MENU_HUMAN: 'মানুষের সাথে কথা বলতে চাই',
    ICE_ORDER: 'কীভাবে অর্ডার করব?',
    ICE_DELIVERY: 'ডেলিভারি চার্জ কত?',
    ICE_COD: 'ক্যাশ অন ডেলিভারি আছে?',
    ICE_HUMAN: 'মানুষের সাথে কথা বলতে চাই',
  }[payload] || `[${payload}]`;
  addMessage(conv.id, 'customer', label);

  let reply = null;
  if (payload === 'GET_STARTED') {
    reply = `${getSetting('greeting', 'আসসালামু আলাইকুম! Xavelle-এ স্বাগতম')} 😊\nপণ্য, দাম, ডেলিভারি বা অর্ডার নিয়ে সরাসরি লিখুন — অথবা নিচের মেনু থেকে বেছে নিন।`;
  } else if (payload === 'MENU_PRODUCTS') {
    reply = await productListText();
  } else if (payload === 'ICE_DELIVERY') {
    reply = deliveryText();
  } else if (payload === 'ICE_ORDER') {
    reply = orderHelpText();
  } else if (payload === 'ICE_COD') {
    reply = codText();
  } else if (payload === 'MENU_HUMAN' || payload === 'ICE_HUMAN') {
    // মানুষ দায়িত্ব নেবে — এই কথোপকথনে AI বন্ধ, ইনবক্সে unread হিসেবে উঠবে
    db.prepare('UPDATE conversations SET ai_enabled = 0, unread = 1 WHERE id = ?').run(conv.id);
    reply = `ঠিক আছে, আমাদের প্রতিনিধিকে জানিয়ে দিয়েছি — তিনি শীঘ্রই এখানেই উত্তর দেবেন। জরুরি হলে কল করুন: ${getSetting('phone', '01887099973')}`;
  }
  if (reply) { addMessage(conv.id, 'ai', reply); await sendMessage(psid, reply); }
}

async function receive(req, res) {
  res.status(200).send('EVENT_RECEIVED');
  try {
    const body = req.body;
    if (body.object !== 'page') return;
    for (const entry of body.entry || []) {
      for (const ev of entry.messaging || []) {
        if (ev.postback && ev.postback.payload) {
          if (alreadySeenPostback(ev.sender.id, ev.postback.payload, ev.timestamp)) continue;
          await handlePostback(ev.sender.id, ev.postback.payload);
          continue;
        }
        if (!ev.message || ev.message.is_echo) continue;
        if (alreadySeen(ev.message.mid)) continue;
        const psid = ev.sender.id;
        const customer = findOrCreateCustomer('messenger', String(psid));
        const conv = findOrCreateConversation(customer);
        const atts = ev.message.attachments || [];
        const audio = atts.find(a => a.type === 'audio');
        const image = atts.find(a => a.type === 'image');
        const isSticker = ev.message.sticker_id || atts.some(a => a.payload && a.payload.sticker_id);

        if (!ev.message.text && isSticker) {
          // লাইক/স্টিকার — কোনো উত্তর না, শুধু রেকর্ড
          addMessage(conv.id, 'customer', '👍 [লাইক]');
          continue;
        }

        if (ev.message.text) {
          const prevCust = db.prepare("SELECT text FROM messages WHERE conversation_id = ? AND sender = 'customer' ORDER BY id DESC LIMIT 1").get(conv.id);
          addMessage(conv.id, 'customer', ev.message.text);
          if (conv.ai_enabled) {
            // হিসাবের ব্যাপার হলে কোডে তৈরি সঠিক বিলটাই যাবে, AI আন্দাজে যোগ করবে না
            let reply = await handleCartMessage(conv.id, ev.message.text);
            if (!reply) {
              const imgUrl = lastImageByConv.get(conv.id);
              // ঠিক আগের মেসেজটা ছবি হলে, এই প্রশ্নটা ওই ছবি নিয়েই — ছবি দেখে উত্তর
              if (imgUrl && prevCust && prevCust.text.startsWith('📷')) {
                reply = await generateImageReply(imgUrl, ev.message.text, true);
              }
            }
            if (!reply) reply = await generateReply(conv.id);
            if (reply) { addMessage(conv.id, 'ai', reply); await sendMessage(psid, reply); }
          }
        } else if (audio) {
          // ভয়েস মেসেজ: আগে লেখায় বদলাও, তারপর সাধারণ মেসেজের মতোই উত্তর
          const transcript = await transcribeAudio(audio.payload && audio.payload.url);
          if (transcript) {
            addMessage(conv.id, 'customer', '🎤 ' + transcript);
            if (conv.ai_enabled) {
              const reply = await generateReply(conv.id);
              if (reply) { addMessage(conv.id, 'ai', reply); await sendMessage(psid, reply); }
            }
          } else {
            addMessage(conv.id, 'customer', '🎤 [ভয়েস মেসেজ — শোনা যায়নি]');
            if (conv.ai_enabled) {
              const t = 'দুঃখিত, ভয়েস মেসেজটা ঠিক শুনতে পারিনি। কষ্ট করে একটু লিখে পাঠাবেন?';
              addMessage(conv.id, 'ai', t); await sendMessage(psid, t);
            }
          }
        } else if (image) {
          // ছবি: সেলসম্যান ছবি ধরে বিক্রির কথা বলবে
          const imgUrl = image.payload && image.payload.url;
          if (imgUrl) lastImageByConv.set(conv.id, imgUrl);
          addMessage(conv.id, 'customer', '📷 [ছবি পাঠিয়েছেন]');
          if (conv.ai_enabled) {
            const priorAi = db.prepare("SELECT 1 FROM messages WHERE conversation_id = ? AND sender = 'ai' LIMIT 1").get(conv.id);
            const reply = await generateImageReply(imgUrl, undefined, !!priorAi);
            const t = reply || 'ছবিটা পেয়েছি! এই ডিজাইনটা নিয়ে জানতে চাইলে প্রোডাক্টের নামটা একটু লিখে পাঠান, দামসহ বলে দিচ্ছি।';
            addMessage(conv.id, 'ai', t); await sendMessage(psid, t);
          }
        }
      }
    }
  } catch (e) { console.error('[messenger] receive error', e.message); }
}

module.exports = { verify, receive, sendMessage };
