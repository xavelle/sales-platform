// প্রোডাক্ট কার্ড — বড় পেজগুলোর মতো: ছবি + দাম + "অর্ডার করুন" বোতাম + ওয়েবসাইট লিংক।
// ডাটা আসে ওয়েবসাইটের লাইভ ক্যাটালগ থেকে — কাস্টমার অনলাইনে যা দেখে, হুবহু তাই।
const { getWebsiteProducts } = require('./website');
const { getSetting } = require('./db');

function bnNum(n) {
  return String(Math.round(n).toLocaleString('en-IN')).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}
const CAT_LABELS = { men: 'পুরুষদের', women: 'মেয়েদের', kids: 'বাচ্চাদের', cosmetics: 'কসমেটিকস', islamic: 'ইসলামিক', food: 'খাবার', electronics: 'ইলেকট্রনিকস', accessories: 'অ্যাক্সেসরিজ', home: 'ঘরের জিনিস', footwear: 'জুতা' };

function productUrl(p) {
  return `${getSetting('website', 'https://xavelle.github.io/xavelle/')}#product/${p.id}`;
}

function cardElement(p) {
  const el = { title: String(p.nameBn || p.nameEn || 'প্রোডাক্ট').slice(0, 80) };
  let sub = `৳${bnNum(p.price)}`;
  if (p.oldPrice && p.oldPrice > p.price) sub += ` (আগের দাম ৳${bnNum(p.oldPrice)})`;
  sub += p.inStock ? ' • স্টক সীমিত' : ' • স্টক শেষ';
  el.subtitle = sub.slice(0, 80);
  if (p.img && /^https?:\/\//.test(p.img)) el.image_url = p.img;
  el.default_action = { type: 'web_url', url: productUrl(p) };
  el.buttons = [
    { type: 'postback', title: '🛒 অর্ডার করুন', payload: 'ORDER_' + p.id },
    { type: 'web_url', title: 'ওয়েবসাইটে দেখুন', url: productUrl(p) },
  ];
  return el;
}

async function catalog() {
  const site = await getWebsiteProducts();
  return site || [];
}

async function categoryList() {
  const ps = await catalog();
  const mains = [...new Set(ps.map(p => p.category).filter(Boolean))];
  return mains.map(m => ({ main: m, label: CAT_LABELS[m] || m, count: ps.filter(p => p.category === m).length }));
}

async function productsOfCategory(main) {
  const ps = await catalog();
  return ps.filter(p => p.category === main);
}

async function findProduct(id) {
  const ps = await catalog();
  return ps.find(p => p.id === id) || null;
}

function haystack(p) {
  return `${p.category || ''} ${p.nameEn || ''} ${p.nameBn || ''}`.toLowerCase();
}
const CAT_WORDS = [
  { keys: ['জুতা', 'স্নিকার্স', 'স্যান্ডেল', 'লোফার', 'shoe', 'sneaker', 'sandal', 'loafer'], re: /shoe|sneaker|sandal|loafer|জুতা|স্নিকার্স|স্যান্ডেল|লোফার/ },
  { keys: ['শাড়ি', 'saree', 'sari'], re: /saree|শাড়ি/ },
  { keys: ['পাঞ্জাবি', 'panjabi', 'punjabi'], re: /panjabi|punjabi|পাঞ্জাবি/ },
  { keys: ['কুর্তি', 'kurti'], re: /kurti|কুর্তি/ },
  { keys: ['হিজাব', 'hijab'], re: /hijab|হিজাব/ },
  { keys: ['আতর', 'পারফিউম', 'attar', 'perfume'], re: /attar|perfume|আতর|পারফিউম/ },
  { keys: ['ঘড়ি', 'watch'], re: /watch|ঘড়ি/ },
  { keys: ['খেজুর', 'dates'], re: /dates|খেজুর/ },
  { keys: ['থ্রি-পিস', 'থ্রি পিস', 'three piece', 'three-piece'], re: /three|থ্রি/ },
  { keys: ['শার্ট', 'shirt'], re: /shirt|শার্ট/ },
  { keys: ['জ্যাকেট', 'jacket'], re: /jacket|জ্যাকেট/ },
  { keys: ['ব্যাগ', 'bag'], re: /\bbag\b|ব্যাগ/ },
  { keys: ['শ্যাম্পু', 'shampoo'], re: /shampoo|শ্যাম্পু/ },
  { keys: ['লোশন', 'lotion'], re: /lotion|লোশন/ },
];

// কাস্টমারের লেখা থেকে কার্ড বাছাই: ক্যাটাগরির শব্দ মিললে ওই ক্যাটাগরির কার্ড (সর্বোচ্চ ৫),
// নির্দিষ্ট একটা প্রোডাক্ট মিললে শুধু ওই কার্ড। কিছু না মিললে null — কার্ড যাবে না।
async function matchCardsForText(rawText) {
  const text = String(rawText || '').toLowerCase();
  if (text.length < 2) return null;
  const ps = await catalog();
  if (!ps.length) return null;
  let categoryHit = false;
  for (const cw of CAT_WORDS) {
    if (cw.keys.some(k => text.includes(k))) {
      categoryHit = true;
      const items = ps.filter(p => cw.re.test(haystack(p))).slice(0, 5);
      if (items.length) return items;
    }
  }
  // চাওয়া ক্যাটাগরি সাইটে নেই (লুকানো) — অন্য প্রোডাক্টের কার্ড চাপিয়ে দেওয়া হবে না
  if (categoryHit) return null;
  // নির্দিষ্ট প্রোডাক্ট: পুরো নাম, অথবা একমাত্র-মালিকের আলাদা শব্দ (বাংলা/English দুটোই)
  const STOPW = ['premium', 'classic', 'the', 'for', 'with'];
  const wordsOf = p => {
    const en = (p.nameEn || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOPW.includes(w));
    const bn = (p.nameBn || '').split(/[\s()]+/).filter(w => w.length > 1 && !STOPW.includes(w));
    return [...new Set([...en, ...bn])];
  };
  const owners = new Map();
  for (const p of ps) for (const w of wordsOf(p)) { if (!owners.has(w)) owners.set(w, []); owners.get(w).push(p.id); }
  const inText = w => /^[a-z0-9]+$/.test(w) ? new RegExp(`\\b${w}\\b`).test(text) : text.includes(w);
  const matched = [];
  for (const p of ps) {
    const en = (p.nameEn || '').toLowerCase(), bn = p.nameBn || '';
    if ((en && text.includes(en)) || (bn && text.includes(bn))) { matched.push(p); continue; }
    if (wordsOf(p).some(w => (owners.get(w) || []).length === 1 && inText(w))) matched.push(p);
  }
  if (matched.length === 1) return matched;
  // "কী কী প্রোডাক্ট আছে / সবগুলো দেখাও" — সাইটে যা আছে সবগুলোর কার্ড (সর্বোচ্চ ১০)
  if (/(কী কী|কি কি|সব প্রোডাক্ট|সবগুলো|সব গুলো|sob gulo|all product|প্রোডাক্ট আছে|product ase|product ache)/.test(text)) return ps.slice(0, 10);
  return null;
}

module.exports = { cardElement, categoryList, productsOfCategory, findProduct, matchCardsForText, CAT_LABELS, bnNum };
