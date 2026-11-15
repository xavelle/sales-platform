// হিসাব — টাকার হিসাব কখনো AI-এর আন্দাজে নয়, সবসময় কোডে হয়, তাই টোটাল একদম সঠিক।
// কাস্টমার প্রোডাক্ট যোগ করলে / বাদ দিলে / পরিমাণ বদলালে / মোট চাইলে এই মডিউল
// ওয়েবসাইটের লাইভ ক্যাটালগের আসল দাম দিয়ে আইটেম-ভিত্তিক বিল বানিয়ে দেয়।
const { db } = require('./db');
const { getWebsiteProducts } = require('./website');

const carts = new Map(); // conversationId -> Map(productKey -> {name, price, qty})

const BN_DIGIT_MAP = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
function normalize(text) {
  return String(text || '').replace(/[০-৯]/g, d => BN_DIGIT_MAP[d]).toLowerCase();
}
function bnNum(n) {
  return String(Math.round(n).toLocaleString('en-IN')).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

async function getCatalog() {
  const site = await getWebsiteProducts();
  if (site && site.length) {
    return site.map(p => ({ key: 'W' + p.id, name: p.nameBn || p.nameEn, nameEn: p.nameEn, nameBn: p.nameBn, price: p.price, inStock: p.inStock }));
  }
  return db.prepare('SELECT id, name, price, stock FROM products ORDER BY id').all()
    .map(p => ({ key: 'L' + p.id, name: p.name, nameEn: p.name, nameBn: '', price: p.price, inStock: p.stock > 0 }));
}

const STOP = new Set(['premium', 'classic', 'প্রিমিয়াম', 'ক্লাসিক', 'set', 'সেট', 'pack', 'প্যাক', 'of', 'the', 'for', 'with']);
function wordsOf(p) {
  const en = (p.nameEn || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
  const bn = (p.nameBn || '').split(/[\s()]+/).filter(w => w.length > 1 && !STOP.has(w));
  return [...new Set([...en, ...bn])];
}
function wordInText(word, text) {
  if (/^[a-z0-9]+$/.test(word)) return new RegExp(`\\b${word}\\b`).test(text);
  return text.includes(word);
}

// মেসেজের অংশ ধরে প্রোডাক্ট মেলানো — শুধু সেই প্রোডাক্টই মিলবে যার আলাদা চেনার শব্দ আছে।
// একই শব্দ একাধিক প্রোডাক্টে থাকলে (যেমন "আতর") আন্দাজে বাছাই হয় না — নিরাপদে বাদ।
function matchSegment(segText, catalog, wordOwners) {
  const matched = [];
  for (const p of catalog) {
    const fullEn = (p.nameEn || '').toLowerCase();
    const fullBn = p.nameBn || '';
    if ((fullEn && segText.includes(fullEn)) || (fullBn && segText.includes(fullBn))) { matched.push(p); continue; }
    const distinct = wordsOf(p).filter(w => (wordOwners.get(w) || []).length === 1);
    if (distinct.some(w => wordInText(w, segText))) matched.push(p);
  }
  return matched;
}

function extractQty(segText) {
  const m = segText.match(/(\d{1,2})\s*(টা|টি|পিস|খানা|pcs|pc|piece)/);
  if (m) { const q = Number(m[1]); if (q >= 1 && q <= 50) return q; }
  return null;
}

function billText(cart, delivery) {
  const lines = ['আপনার হিসাবটা দিলাম:'];
  let total = 0;
  for (const item of cart.values()) {
    const line = item.price * item.qty;
    total += line;
    lines.push(`• ${item.name} ×${bnNum(item.qty)} = ৳${bnNum(line)}`);
  }
  if (delivery) {
    lines.push(`ডেলিভারি চার্জ = ৳${bnNum(delivery)}`);
    lines.push(`সর্বমোট = ৳${bnNum(total + delivery)}`);
  } else {
    lines.push(`মোট = ৳${bnNum(total)}`);
    lines.push('(ডেলিভারি চার্জ আলাদা — ঢাকায় ৳৬০, ঢাকার বাইরে ৳১২০। ঠিকানা দিলে ডেলিভারিসহ সর্বমোট জানিয়ে দেব।)');
  }
  lines.push('অর্ডার কনফার্ম করতে নাম, মোবাইল নম্বর আর ঠিকানা দিন।');
  return lines.join('\n');
}

// কাস্টমারের লেখা দেখে কার্ট আপডেট; বিল/বাদ/পরিমাণের ক্ষেত্রে তৈরি উত্তর ফেরত দেয়, নইলে null।
async function handleCartMessage(convId, rawText) {
  const text = normalize(rawText);
  const billIntent = /(মোট|টোটাল|total|হিসাব|কত আসে|কত হবে|সব মিল|bill)/.test(text);
  const removeIntent = /(বাদ|রিমুভ|remove|লাগবে না|চাই না)/.test(text);
  const addIntent = /(নিব|নেব|কিন|অর্ডার|চাই|দাও|দিন|add|buy|order)/.test(text);
  if (!billIntent && !removeIntent && !addIntent) return null;

  const catalog = await getCatalog();
  if (!catalog.length) return null;
  const wordOwners = new Map();
  for (const p of catalog) for (const w of wordsOf(p)) {
    if (!wordOwners.has(w)) wordOwners.set(w, []);
    wordOwners.get(w).push(p.key);
  }
  const segments = text.split(/আর(?=\s)|,|এবং/).map(s => s.trim()).filter(Boolean);
  const found = [];
  for (const seg of segments) {
    const qty = extractQty(seg);
    for (const p of matchSegment(seg, catalog, wordOwners)) found.push({ product: p, qty });
  }
  if (!found.length && !billIntent) return null;

  let cart = carts.get(convId);
  if (!cart) { cart = new Map(); carts.set(convId, cart); }
  let changed = false, qtyTouched = false;
  if (removeIntent) {
    for (const f of found) if (cart.delete(f.product.key)) changed = true;
  } else if (billIntent || addIntent || found.some(f => f.qty)) {
    for (const f of found) {
      const existing = cart.get(f.product.key);
      if (f.qty) { cart.set(f.product.key, { name: f.product.name, price: f.product.price, qty: f.qty }); qtyTouched = true; changed = true; }
      else if (!existing) { cart.set(f.product.key, { name: f.product.name, price: f.product.price, qty: 1 }); changed = true; }
    }
  }

  if (!billIntent && !changed) return null;
  if (billIntent && !cart.size && !changed) return null;
  if (!cart.size) return 'এখন আপনার লিস্টে কোনো প্রোডাক্ট নেই। কোনটা নিতে চান বলুন — হিসাব করে দিচ্ছি।';
  if (!billIntent && !qtyTouched && !removeIntent) return null; // শুধু যোগ হয়েছে — সেলসম্যানই কথা চালাক

  const delivery = /(ঢাকার বাইরে|ঢাকার বাহিরে)/.test(text) ? 120 : /(ঢাকায়|ঢাকাতে|ঢাকার ভিতরে|ঢাকার ভেতরে)/.test(text) ? 60 : null;
  return billText(cart, delivery);
}

module.exports = { handleCartMessage };
