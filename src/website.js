// ওয়েবসাইটের লাইভ ক্যাটালগ — বটের সব প্রোডাক্ট-উত্তর এখন ওয়েবসাইট (Firestore) দেখে আসে।
// কন্ট্রোল প্যানেল (ওয়েবসাইট অ্যাডমিন)-এ প্রোডাক্ট/দাম বদলালেই বটের উত্তর বদলে যায় (সর্বোচ্চ ~১ মিনিট ক্যাশ)।
// নিয়ম (মালিকের নির্দেশ): স্টকের আসল সংখ্যা কাস্টমারকে কখনো বলা যাবে না — শুধু "সীমিত" বা "শেষ"।
const BASE = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0710305331/databases/(default)/documents';
const CACHE_MS = 60 * 1000;
let cache = { at: 0, products: null };

function fv(f) {
  if (!f) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.arrayValue) return (f.arrayValue.values || []).map(v => fv(v));
  return null;
}

async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

// ওয়েবসাইটের প্রোডাক্ট তালিকা — হুবহু দোকানে যা দেখা যায়: visible প্রোডাক্ট, তবে
// settings-এ লুকানো (hiddenCategories) ক্যাটাগরি বাদে। সাইটের নিজের নিয়মই (catVisible) এখানে মিরর করা,
// যাতে বট এমন প্রোডাক্টের কথা না বলে যা কাস্টমার সাইটে দেখতেই পায় না। পাওয়া না গেলে null (লোকাল ব্যাকআপ চলবে)।
let hiddenCache = [];
async function getWebsiteProducts() {
  if (cache.products && Date.now() - cache.at < CACHE_MS) return cache.products;
  try {
    const sres = await fetchWithTimeout(`${BASE}/settings/main`);
    if (sres.ok) {
      const sdata = await sres.json();
      const hv = fv((sdata.fields || {}).hiddenCategories);
      if (Array.isArray(hv)) hiddenCache = hv.map(String);
    }
    const res = await fetchWithTimeout(`${BASE}/products?pageSize=100`);
    if (!res.ok) return cache.products;
    const data = await res.json();
    const docs = data.documents || [];
    const products = [];
    for (const doc of docs) {
      const f = doc.fields || {};
      if (fv(f.visible) === false) continue;
      if (hiddenCache.includes(fv(f.main) || '')) continue;
      const stock = Number(fv(f.stock) || 0);
      products.push({
        id: fv(f.id) || doc.name.split('/').pop(),
        nameEn: fv(f.nameEn) || '',
        nameBn: fv(f.nameBn) || '',
        price: Number(fv(f.price) || 0),
        oldPrice: Number(fv(f.oldPrice) || 0),
        inStock: stock > 0,
        sizes: Array.isArray(fv(f.sizes)) ? fv(f.sizes) : [],
        category: fv(f.main) || '',
        descBn: fv(f.descBn) || '',
        img: fv(f.img) || '',
      });
    }
    if (products.length) cache = { at: Date.now(), products };
    return products.length ? products : cache.products;
  } catch (e) {
    console.error('[website] catalog fetch error', e.message);
    return cache.products;
  }
}

module.exports = { getWebsiteProducts };
