// Startup seed — ফ্রি সার্ভার রিস্টার্ট হলে SQLite ডাটা মুছে যায়।
// ডাটাবেস একদম ফাঁকা (fresh) থাকলে দোকানের আসল তথ্য নিজে নিজে বসিয়ে দেয়,
// যাতে AI কখনো খালি ডাটা দেখে ভুল/বানানো উত্তর না দেয়।
// শুধু fresh DB-তেই চলে — অ্যাডমিনের বদলানো ডাটা কখনো ওভাররাইট করে না।
const { db, setSetting } = require('./db');

function seedIfFresh() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM settings').get();
  if (row && row.n > 0) return; // ডাটা আছে — কিছু করার নেই

  setSetting('business_name', 'Xavelle');
  setSetting('greeting', 'আসসালামু আলাইকুম! Xavelle-এ স্বাগতম');
  setSetting('website', 'https://xavelle.github.io/xavelle/');
  setSetting('phone', '01887099973');
  setSetting('location', 'অনলাইন শপ — উত্তরা সেক্টর ৩, ঢাকা থেকে সারা বাংলাদেশে হোম ডেলিভারি');
  setSetting('delivery_charge', 'ঢাকার ভেতরে ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা');
  setSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে');
  setSetting('payment', 'ক্যাশ অন ডেলিভারি (COD), বিকাশ ও নগদ');

  const products = [
    ['Jamdani Saree (জামদানি শাড়ি)', 3490, '', 10, 'হাতে বোনা ঐতিহ্যবাহী জামদানি শাড়ি'],
    ['Cotton Kurti (কটন কুর্তি)', 1250, 'S,M,L,XL', 10, 'আরামদায়ক কটন কুর্তি'],
    ['Premium Three-Piece (প্রিমিয়াম থ্রি-পিস)', 2190, 'S,M,L,XL', 10, 'প্রিমিয়াম থ্রি-পিস সেট'],
    ['Premium Hijab (প্রিমিয়াম হিজাব)', 550, '', 10, 'সফট প্রিমিয়াম হিজাব'],
    ["Women's Block Heel (ব্লক হিল জুতা)", 1650, '', 10, 'মহিলাদের ব্লক হিল জুতা'],
  ];
  const ins = db.prepare('INSERT INTO products (name, price, sizes, stock, description) VALUES (?, ?, ?, ?, ?)');
  for (const p of products) ins.run(...p);

  const faqs = [
    ['ডেলিভারি চার্জ কত?', 'ঢাকার ভেতরে ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা।'],
    ['ক্যাশ অন ডেলিভারি আছে?', 'হ্যাঁ, সারা বাংলাদেশে ক্যাশ অন ডেলিভারি আছে। এছাড়া বিকাশ ও নগদেও পেমেন্ট করা যায়।'],
    ['রিটার্ন পলিসি কী?', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে।'],
    ['ওয়েবসাইট কোনটা?', 'আমাদের ওয়েবসাইট: https://xavelle.github.io/xavelle/ — সব প্রোডাক্ট ওখানে দেখে সরাসরি অর্ডার করা যায়।'],
    ['কীভাবে অর্ডার করব?', 'পছন্দের প্রোডাক্টের নাম, সাইজ, আপনার নাম, মোবাইল নম্বর আর সম্পূর্ণ ঠিকানা পাঠালেই অর্ডার নেওয়া হবে।'],
    ['ডেলিভারি পেতে কতদিন লাগবে?', 'ঢাকার ভেতরে ১-২ দিন, ঢাকার বাইরে ২-৩ দিন।'],
  ];
  const insF = db.prepare('INSERT INTO faqs (question, answer) VALUES (?, ?)');
  for (const f of faqs) insF.run(...f);

  console.log('[seed] Fresh DB — shop info, 5 products, 6 FAQs seeded');
}

module.exports = { seedIfFresh };
