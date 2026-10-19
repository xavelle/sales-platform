// AI brain - answers customer messages in Bangla/English.
// Uses Gemini API when GEMINI_API_KEY is set, otherwise a built-in
// rule-based demo brain (works offline, no key needed).
const { db, getSetting } = require('./db');

function businessContext() {
  const products = db.prepare('SELECT name, price, sizes, stock, description FROM products').all();
  const faqs = db.prepare('SELECT question, answer FROM faqs').all();
  const lines = [
    `Business: ${getSetting('business_name', 'Xavelle')}`,
    `Greeting: ${getSetting('greeting', 'স্বাগতম!')}`,
    `Delivery charge: ${getSetting('delivery_charge', 'ঢাকায় ৭০ টাকা, ঢাকার বাইরে ১২০ টাকা')}`,
    `Return policy: ${getSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে')}`,
    `Payment: ${getSetting('payment', 'ক্যাশ অন ডেলিভারি')}`,
  ];
  lines.push('Products:');
  for (const p of products) lines.push(`- ${p.name}: ৳${p.price} (sizes: ${p.sizes || 'free'}, stock: ${p.stock}) ${p.description || ''}`);
  if (faqs.length) { lines.push('FAQs:'); for (const f of faqs) lines.push(`Q: ${f.question} A: ${f.answer}`); }
  return lines.join('\n');
}

async function geminiReply(history) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const contents = history.map(m => ({
    role: m.sender === 'customer' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));
  const sys = `You are a friendly Bangla/English sales assistant for an online shop. Reply SHORT (1-3 lines), warm, in the customer's language (Bangla/English/Banglish). Use this business info:\n${businessContext()}\nIf the customer wants to order, collect: product name, size, address, phone. Never invent prices.`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents })
    });
    const data = await res.json();
    const t = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return t ? t.trim() : null;
  } catch { return null; }
}

// Demo brain: keyword-based, works without any API key.
function demoBrain(text, history) {
  const t = text.toLowerCase();
  const products = db.prepare('SELECT * FROM products').all();
  const hit = products.find(p => t.includes(p.name.toLowerCase().split(' ')[0]) || p.name.toLowerCase().split(' ').some(w => w.length > 3 && t.includes(w)));

  if (/(delivery|ডেলিভারি|কুরিয়ার|পাঠা)/.test(t)) return `${getSetting('delivery_charge', 'ঢাকায় ৭০ টাকা, ঢাকার বাইরে ১২০ টাকা')}। অর্ডার করলে ২-৩ দিনে পৌঁছে যাবে।`;
  if (/(return|রিটার্ন|ফেরত|exchange|এক্সচেঞ্জ)/.test(t)) return `${getSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে')}।`;
  if (/(দাম|price|cost|কত)/.test(t)) {
    if (hit) return `${hit.name}-এর দাম ৳${hit.price}। ${hit.sizes ? 'সাইজ: ' + hit.sizes + '। ' : ''}অর্ডার করতে চাইলে আপনার নাম, ঠিকানা আর ফোন নম্বর দিন।`;
    const list = products.map(p => `${p.name} ৳${p.price}`).join(', ');
    return `আমাদের কালেকশন: ${list}। কোনটার দাম জানতে চান?`;
  }
  if (/(size|সাইজ|মাপ)/.test(t)) {
    if (hit) return `${hit.name}-এ সাইজ আছে: ${hit.sizes || 'ফ্রি সাইজ'}। স্টকে ${hit.stock} পিস আছে।`;
    return `কোন ড্রেসের সাইজ জানতে চান?`;
  }
  if (/(delivery|ডেলিভারি|পাঠা)/.test(t)) return `${getSetting('delivery_charge', 'ঢাকায় ৭০ টাকা, ঢাকার বাইরে ১২০ টাকা')}। অর্ডার করলে ২-৩ দিনে পৌঁছে যাবে।`;
  if (/(order|অর্ডার|নিব|কিনব|চাই)/.test(t)) {
    const prod = hit ? hit.name : 'কোন প্রোডাক্ট';
    return `অবশ্যই! ${prod} অর্ডার করতে আপনার নাম, মোবাইল নম্বর আর সম্পূর্ণ ঠিকানা দিন।`;
  }
  if (/(return|রিটার্ন|ফেরত|exchange|এক্সচেঞ্জ)/.test(t)) return `${getSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে')}।`;
  if (/(hi|hello|hey|সালাম|আসসালামু|হাই|adab)/.test(t)) return `${getSetting('greeting', 'আসসালামু আলাইকুম! Xavelle-এ স্বাগতম')} 😊 কীভাবে সাহায্য করতে পারি?`;
  if (/(ধন্যবাদ|thanks|thank)/.test(t)) return `আপনাকেও ধন্যবাদ! আর কিছু জানতে চাইলে বলুন।`;
  for (const f of db.prepare('SELECT * FROM faqs').all()) {
    if (t.includes(f.question.toLowerCase().slice(0, 12))) return f.answer;
  }
  return `বুঝতে পেরেছি। দাম, সাইজ, ডেলিভারি বা অর্ডার সম্পর্কে জিজ্ঞেস করুন — সাহায্য করছি!`;
}

async function generateReply(conversation_id) {
  const history = require('./db').getHistory(conversation_id, 12);
  if (!history.length) return getSetting('greeting', 'আসসালামু আলাইকুম! স্বাগতম 😊');
  const lastCustomer = [...history].reverse().find(m => m.sender === 'customer');
  if (!lastCustomer) return null;
  // Don't reply twice to the same message
  const last = history[history.length - 1];
  if (last.sender !== 'customer') return null;
  const ai = await geminiReply(history);
  if (ai) return ai;
  return demoBrain(lastCustomer.text, history);
}

module.exports = { generateReply, businessContext };
