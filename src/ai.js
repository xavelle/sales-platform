// AI brain - answers customer messages in Bangla/English.
// Provider chain (all free tiers), best first:
//   1. Gemini 3.8 Flash (Google)      2. Llama 3.3 70B (Groq)
//   3. GPT-4o mini (GitHub Models)    4. Gemini 3.5 Flash-Lite (Google)
// If every provider fails, a built-in rule-based demo brain answers,
// so no customer message ever goes unanswered.
const { db, getSetting } = require('./db');
const { getWebsiteProducts } = require('./website');

// লোকাল ব্যাকআপ কনটেক্সট — ওয়েবসাইট থেকে ক্যাটালগ না পেলে এটা চলবে।
function businessContext() {
  const products = db.prepare('SELECT name, price, sizes, stock, description FROM products').all();
  const faqs = db.prepare('SELECT question, answer FROM faqs').all();
  const lines = [
    `Business: ${getSetting('business_name', 'Xavelle')}`,
    `Greeting: ${getSetting('greeting', 'স্বাগতম!')}`,
    `Website: ${getSetting('website', 'https://xavelle.github.io/xavelle/')}`,
    `Phone: ${getSetting('phone', '01887099973')}`,
    `Location: ${getSetting('location', 'অনলাইন শপ — সারা বাংলাদেশে হোম ডেলিভারি')}`,
    `Delivery charge: ${getSetting('delivery_charge', 'ঢাকায় ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা')}`,
    `Return policy: ${getSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে')}`,
    `Payment: ${getSetting('payment', 'ক্যাশ অন ডেলিভারি')}`,
  ];
  lines.push('Products:');
  for (const p of products) lines.push(`- ${p.name}: ৳${p.price} (sizes: ${p.sizes || 'free'}, availability: ${p.stock > 0 ? 'স্টক সীমিত' : 'স্টক শেষ'}) ${p.description || ''}`);
  if (faqs.length) { lines.push('FAQs:'); for (const f of faqs) lines.push(`Q: ${f.question} A: ${f.answer}`); }
  return lines.join('\n');
}

// মূল কনটেক্সট — প্রোডাক্ট তালিকা আসে ওয়েবসাইটের লাইভ ক্যাটালগ থেকে (কন্ট্রোল প্যানেলই নিয়ন্ত্রণ করে)।
// স্টকের সংখ্যা ইচ্ছাকৃতভাবে দেওয়া হয় না — শুধু "সীমিত" / "শেষ"।
async function buildContext() {
  const site = await getWebsiteProducts();
  if (!site || !site.length) return businessContext();
  const faqs = db.prepare('SELECT question, answer FROM faqs').all();
  const lines = [
    `Business: ${getSetting('business_name', 'Xavelle')}`,
    `Greeting: ${getSetting('greeting', 'স্বাগতম!')}`,
    `Website: ${getSetting('website', 'https://xavelle.github.io/xavelle/')}`,
    `Phone: ${getSetting('phone', '01887099973')}`,
    `Location: ${getSetting('location', 'অনলাইন শপ — সারা বাংলাদেশে হোম ডেলিভারি')}`,
    `Delivery charge: ${getSetting('delivery_charge', 'ঢাকায় ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা')}`,
    `Return policy: ${getSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে')}`,
    `Payment: ${getSetting('payment', 'ক্যাশ অন ডেলিভারি')}`,
    'Products (LIVE from the shop website — this is the full current catalog):',
  ];
  for (const p of site) {
    lines.push(`- ${p.nameEn} (${p.nameBn}) — ৳${p.price}${p.oldPrice > p.price ? ` (আগের দাম ৳${p.oldPrice})` : ''}, সাইজ: ${p.sizes.join(', ') || 'Free'}, ক্যাটাগরি: ${p.category}, availability: ${p.inStock ? 'স্টক সীমিত' : 'স্টক শেষ'}${p.descBn ? ' — ' + p.descBn.slice(0, 90) : ''}`);
  }
  if (faqs.length) { lines.push('FAQs:'); for (const f of faqs) lines.push(`Q: ${f.question} A: ${f.answer}`); }
  return lines.join('\n');
}

async function systemPrompt() {
  return `You are the salesman of this shop's Facebook page, chatting with customers on Messenger. Write EXACTLY like a real, experienced Bangladeshi shop salesman chatting — short, natural, warm. The customer should feel they are talking to a helpful person in the shop. Use ONLY this business info:\n${await buildContext()}\nHOW YOU SELL:\n- Talk ONLY about the shop: products, prices, offers, sizes, delivery, payment, ordering. Nothing else.\n- Answer what the customer asked FIRST, then add one helpful nudge. Appreciate their taste ("খুব সুন্দর পছন্দ!") and make them feel good.\n- Persuade smartly, never pushy: mention the discount (আগের দাম vs এখনকার দাম), one real quality point, soft urgency ("স্টক সীমিত"), and cash-on-delivery + easy return to remove fear.\n- Move toward the order step by step like a human: product → size → name/phone/address, ONE thing at a time. Never dump a form.\n- Suggest ONE extra matching item only when it truly fits. Never list unrelated products.\n- Keep replies SHORT: 1-2 lines, like real chat. At most one emoji, and not in every message. Mirror the customer's language and style (Bangla/English/Banglish).\n- GREETING: Greet ONLY in the very first reply of the conversation. After that NEVER start with a salam/greeting again — just answer.\n- OFF-TOPIC: If the customer asks or sends something unrelated to shopping (counting things, jokes, general knowledge, random photos), do NOT answer that thing and do NOT ask for a phone number for it. Smile it off in ONE short friendly line and bring the talk back to a product or an offer.\n- SHOP FACTS (STRICT): Only mention products and prices from the info above, exactly as listed. Never invent a price, discount or product. If a SHOP question's answer is not in the info (e.g. EMI), say you will confirm it ("নিশ্চিত করে জানাচ্ছি") and ask for the customer's phone number — only for shop questions.\n- STOCK (STRICT): Never state an exact stock quantity — you are not given numbers. Available = "স্টক সীমিত". Marked স্টক শেষ = honestly say out of stock and suggest the closest available alternative.\n- The shop also sends photo cards with order buttons for the products being discussed — that is normal. Keep your text short and do not read out long product lists.\n- TOTALS: Never add up prices yourself — when the customer takes several items or asks for a total, the shop system sends the exact itemized bill itself. Just confirm the items warmly; never state a sum you calculated.\n- WEBSITE: The shop's website is LIVE at the Website address above. Give that exact address when asked; never say it is under construction.\n- IDENTITY: You are the shop's own salesman. Never volunteer that you are an AI/bot or explain your system. If a customer DIRECTLY asks whether you are a robot/AI, be honest in one warm line (you are the shop's online assistant, here to help) and keep helping.`;
}

async function fetchWithTimeout(url, options, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

// কথা চলার মাঝখানে আবার সালাম/স্বাগতম এলে কেটে ফেলা — সেলসম্যান প্রতিবার সালাম দেয় না।
function stripGreeting(reply, alreadyTalking) {
  if (!reply || !alreadyTalking) return reply;
  let r = reply.trim();
  r = r.replace(/^(আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহ|আসসালামু আলাইকুম|ওয়ালাইকুম আসসালাম|ওয়ালাইকুমুস সালাম)[!।,.]*\s*/i, '');
  r = r.replace(/^[^।!?\n]{0,45}স্বাগতম[^।!?\n]*[।!]\s*/i, '');
  r = r.replace(/^স্বাগতম[!।,.]*\s*/i, '');
  return r.trim() || reply;
}

// One Gemini model attempt. Returns reply text or null.
async function tryGemini(history, model, prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const contents = history.map(m => ({
    role: m.sender === 'customer' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));
  try {
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: prompt }] }, contents })
    });
    if (!res.ok) { console.error('[ai] gemini HTTP', res.status, model); return null; }
    const data = await res.json();
    const t = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return t ? t.trim() : null;
  } catch (e) { console.error('[ai] gemini error', e.message, model); return null; }
}

// One OpenAI-compatible provider attempt (Groq, GitHub Models). Returns reply text or null.
async function tryOpenAICompatible(label, url, key, model, history, prompt) {
  if (!key) return null;
  const messages = [{ role: 'system', content: prompt }];
  for (const m of history) messages.push({ role: m.sender === 'customer' ? 'user' : 'assistant', content: m.text });
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages })
    });
    if (!res.ok) { console.error('[ai]', label, 'HTTP', res.status, model); return null; }
    const data = await res.json();
    const t = data?.choices?.[0]?.message?.content;
    return t ? t.trim() : null;
  } catch (e) { console.error('[ai]', label, 'error', e.message, model); return null; }
}

// Demo brain: keyword-based, works without any API key.
function demoBrain(text, history) {
  const t = text.toLowerCase();
  const products = db.prepare('SELECT * FROM products').all();
  const hit = products.find(p => t.includes(p.name.toLowerCase().split(' ')[0]) || p.name.toLowerCase().split(' ').some(w => w.length > 3 && t.includes(w)));

  if (/(website|ওয়েবসাইট|ওয়েব সাইট|link|লিংক|সাইট)/.test(t)) return `আমাদের ওয়েবসাইট: ${getSetting('website', 'https://xavelle.github.io/xavelle/')} — সব প্রোডাক্ট ওখানে দেখে সরাসরি অর্ডার করতে পারবেন।`;
  if (/(delivery|ডেলিভারি|কুরিয়ার|পাঠা)/.test(t)) return `${getSetting('delivery_charge', 'ঢাকায় ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা')}। অর্ডার করলে ২-৩ দিনে পৌঁছে যাবে।`;
  if (/(return|রিটার্ন|ফেরত|exchange|এক্সচেঞ্জ)/.test(t)) return `${getSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে')}।`;
  if (/(দাম|price|cost|কত)/.test(t)) {
    if (hit) {
      if (hit.stock <= 0) return `দুঃখিত, ${hit.name} এখন স্টক শেষ। অন্য কিছু দেখতে চান?`;
      return `${hit.name}-এর দাম ৳${hit.price}। ${hit.sizes ? 'সাইজ: ' + hit.sizes + '। ' : ''}স্টক সীমিত আছে — শেষ হওয়ার আগেই অর্ডার করুন। অর্ডার করতে চাইলে আপনার নাম, ঠিকানা আর ফোন নম্বর দিন।`;
    }
    const list = products.map(p => `${p.name} ৳${p.price}`).join(', ');
    return `আমাদের কালেকশন: ${list}। কোনটার দাম জানতে চান?`;
  }
  if (/(স্টক|stock)/.test(t)) {
    if (hit) return hit.stock > 0 ? `${hit.name}-এর স্টক সীমিত আছে — শেষ হওয়ার আগেই অর্ডার করে ফেলুন।` : `দুঃখিত, ${hit.name} এখন স্টক শেষ।`;
    const avail = products.filter(p => p.stock > 0);
    return avail.length ? `স্টক সীমিত আছে: ${avail.map(p => p.name).join(', ')}। কোনটা নিতে চান?` : `দুঃখিত, এখন সব প্রোডাক্ট স্টক শেষ।`;
  }
  if (/(ভালো হবে|recommend|সাজেস্ট|suggest|কোনটা নিব|পরামর্শ|best)/.test(t)) {
    const avail = products.filter(p => p.stock > 0).slice(0, 3);
    if (!avail.length) return `দুঃখিত, এখন সব প্রোডাক্ট স্টক শেষ।`;
    if (avail.length === 1) return `আমার সাজেশন: ${avail[0].name} ৳${avail[0].price} — ${avail[0].description || 'বেস্ট সেলার'}।`;
    return `আপনার জন্য সাজেশন: ${avail.map(p => `${p.name} ৳${p.price}`).join(', ')}। কোনটা পছন্দ হলো?`;
  }
  if (/(size|সাইজ|মাপ)/.test(t)) {
    if (hit) return `${hit.name}-এ সাইজ আছে: ${hit.sizes || 'ফ্রি সাইজ'}। স্টক সীমিত আছে।`;
    return `কোন ড্রেসের সাইজ জানতে চান?`;
  }
  if (/(order|অর্ডার|নিব|কিনব|চাই)/.test(t)) {
    const prod = hit ? hit.name : 'কোন প্রোডাক্ট';
    return `অবশ্যই! ${prod} অর্ডার করতে আপনার নাম, মোবাইল নম্বর আর সম্পূর্ণ ঠিকানা দিন।`;
  }
  if (/(hi|hello|hey|সালাম|আসসালামু|হাই|adab)/.test(t)) return `${getSetting('greeting', 'আসসালামু আলাইকুম! Xavelle-এ স্বাগতম')} 😊 কীভাবে সাহায্য করতে পারি?`;
  if (/(ধন্যবাদ|thanks|thank)/.test(t)) return `আপনাকেও ধন্যবাদ! আর কিছু জানতে চাইলে বলুন।`;
  for (const f of db.prepare('SELECT * FROM faqs').all()) {
    if (t.includes(f.question.toLowerCase().slice(0, 12))) return f.answer;
  }
  return `হা হা, ওটা আমার কাজ না 😊 তার চেয়ে আমাদের কালেকশনটা দেখুন — কী ধরনের প্রোডাক্ট খুঁজছেন বলুন, সেরাটা দেখিয়ে দিচ্ছি।`;
}

async function generateReply(conversation_id) {
  const history = require('./db').getHistory(conversation_id, 12);
  if (!history.length) return getSetting('greeting', 'আসসালামু আলাইকুম! স্বাগতম 😊');
  const lastCustomer = [...history].reverse().find(m => m.sender === 'customer');
  if (!lastCustomer) return null;
  // Don't reply twice to the same message
  const last = history[history.length - 1];
  if (last.sender !== 'customer') return null;

  const prompt = await systemPrompt();
  const attempts = [
    () => tryGemini(history, 'gemini-3.8-flash', prompt),
    () => tryOpenAICompatible('groq', 'https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', history, prompt),
    () => tryOpenAICompatible('github-models', 'https://models.github.ai/inference/chat/completions', process.env.GITHUB_MODELS_TOKEN, 'openai/gpt-4o-mini', history, prompt),
    () => tryGemini(history, 'gemini-3.5-flash-lite', prompt),
  ];
  const alreadyTalking = history.some(m => m.sender === 'ai');
  for (const attempt of attempts) {
    const reply = await attempt();
    if (reply) return stripGreeting(reply, alreadyTalking);
  }
  return stripGreeting(demoBrain(lastCustomer.text, history), alreadyTalking);
}

/* ---------- ছবি বোঝা: সেলসম্যানের মতো ছবি ধরে বিক্রির কথা ---------- */
async function imagePrompt(question) {
  return `You are the salesman of this shop chatting on Messenger. Write like a real person: SHORT (1-2 lines), warm, Bangla (mirror the customer). NO greeting/salam — the chat is already going. Use ONLY this business info:\n${await buildContext()}\nA customer sent this photo${question ? ` and asks: "${question}"` : ''}. Act as a salesman:\n- If the photo matches a product in the list: pitch it — name, price (mention the আগের দাম discount if higher), one quality point, "স্টক সীমিত" if available, then ask their size or if they want to order. NEVER give an exact stock quantity.\n- If it is a similar product the shop does NOT carry: one line that this exact one is not in the collection, then pitch the ONE closest listed product with its price.\n- If it is NOT a product photo at all (a hand, a selfie, anything random): do NOT describe, count or analyze it. One short light friendly line, then hook back to the collection (one good product or an offer).\n- If it is a payment (bKash/Nagad) screenshot: warmly thank them and say the payment/order will be confirmed shortly.\nNever invent a price or a product that is not in the list.`;
}

async function tryGeminiVision(imageUrl, model, question) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const imgRes = await fetchWithTimeout(imageUrl, {}, 20000);
    if (!imgRes.ok) return null;
    const mime = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: await imagePrompt(question) }, { inline_data: { mime_type: mime, data: buf.toString('base64') } }] }] })
    });
    if (!res.ok) { console.error('[ai] gemini vision HTTP', res.status, model); return null; }
    const data = await res.json();
    const t = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return t ? t.trim() : null;
  } catch (e) { console.error('[ai] gemini vision error', e.message, model); return null; }
}

async function tryOpenAIVision(imageUrl, question) {
  const key = process.env.GITHUB_MODELS_TOKEN;
  if (!key) return null;
  try {
    const res = await fetchWithTimeout('https://models.github.ai/inference/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: [{ type: 'text', text: await imagePrompt(question) }, { type: 'image_url', image_url: { url: imageUrl } }] }] })
    });
    if (!res.ok) { console.error('[ai] gpt vision HTTP', res.status); return null; }
    const data = await res.json();
    const t = data?.choices?.[0]?.message?.content;
    return t ? t.trim() : null;
  } catch (e) { console.error('[ai] gpt vision error', e.message); return null; }
}

async function generateImageReply(imageUrl, question, alreadyTalking) {
  if (!imageUrl) return null;
  const reply = (await tryGeminiVision(imageUrl, 'gemini-3.8-flash', question))
      || (await tryOpenAIVision(imageUrl, question))
      || (await tryGeminiVision(imageUrl, 'gemini-3.5-flash-lite', question));
  return reply ? stripGreeting(reply, alreadyTalking !== false) : null;
}

module.exports = { generateReply, generateImageReply, businessContext, buildContext, stripGreeting };
