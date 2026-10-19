// Seed demo data: products, FAQs, settings, sample conversations + orders
const { db, setSetting, findOrCreateCustomer, findOrCreateConversation, addMessage, nextOrderNo } = require('./db');

db.prepare('DELETE FROM messages').run();
db.prepare('DELETE FROM conversations').run();
db.prepare('DELETE FROM orders').run();
db.prepare('DELETE FROM customers').run();
db.prepare('DELETE FROM products').run();
db.prepare('DELETE FROM faqs').run();

setSetting('business_name', 'Xavelle');
setSetting('greeting', 'আসসালামু আলাইকুম! Xavelle-এ স্বাগতম');
setSetting('delivery_charge', 'ঢাকার ভেতরে ৭০ টাকা, ঢাকার বাইরে ১২০ টাকা');
setSetting('return_policy', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে');
setSetting('payment', 'ক্যাশ অন ডেলিভারি (COD)');

const products = [
  ['ব্ল্যাক প্রিন্টেড কুর্তি', 4795, 'S,M,L,XL', 12, 'গলায় নিখুঁত মিরর ওয়ার্ক, প্রিমিয়াম প্রিন্ট'],
  ['পার্পল জর্জেট থ্রি-পিস', 3250, 'S,M,L', 8, 'সফট জর্জেট, এমব্রয়ডারি ওড়না'],
  ['সাদা কটন পাঞ্জাবি', 1890, 'M,L,XL', 20, 'প্রিমিয়াম কটন, ঈদ কালেকশন'],
];
for (const p of products) db.prepare('INSERT INTO products (name, price, sizes, stock, description) VALUES (?, ?, ?, ?, ?)').run(...p);

const faqs = [
  ['ডেলিভারি চার্জ কত?', 'ঢাকার ভেতরে ৭০ টাকা, ঢাকার বাইরে ১২০ টাকা।'],
  ['ক্যাশ অন ডেলিভারি আছে?', 'হ্যাঁ, সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।'],
  ['রিটার্ন পলিসি কী?', 'ডেলিভারির ৭ দিনের মধ্যে রিটার্ন/এক্সচেঞ্জ করা যাবে।'],
];
for (const f of faqs) db.prepare('INSERT INTO faqs (question, answer) VALUES (?, ?)').run(...f);

// Sample conversation 1: webchat, AI answered
const c1 = findOrCreateCustomer('webchat', 'demo-sess-1', 'Rahim Uddin', '01811111111');
const conv1 = findOrCreateConversation(c1);
addMessage(conv1.id, 'customer', 'আসসালামু আলাইকুম, ব্ল্যাক কুর্তিটার দাম কত?');
addMessage(conv1.id, 'ai', 'ওয়ালাইকুম আসসালাম! ব্ল্যাক প্রিন্টেড কুর্তির দাম ৳৪,৭৯৫। সাইজ: S,M,L,XL। অর্ডার করতে চাইলে নাম, ঠিকানা আর ফোন নম্বর দিন।');
addMessage(conv1.id, 'customer', 'L সাইজ নিবো। ঠিকানা: SB Plaza, Uttara, Dhaka। ফোন: 01811111111');
addMessage(conv1.id, 'ai', 'ধন্যবাদ! আপনার অর্ডার নেওয়া হয়েছে।');

// Sample conversation 2: messenger, unread
const c2 = findOrCreateCustomer('messenger', 'psid-demo-2', 'Nusrat Jahan');
const conv2 = findOrCreateConversation(c2);
addMessage(conv2.id, 'customer', 'Hi, purple dress ta ki available?');
addMessage(conv2.id, 'customer', 'Size M lagbe');

// Sample order from conversation 1
const ono = nextOrderNo();
db.prepare(`INSERT INTO orders (order_no, customer_id, conversation_id, items, total, status, address)
  VALUES (?, ?, ?, ?, ?, 'confirmed', ?)`).run(ono, c1.id, conv1.id,
  JSON.stringify([{ name: 'ব্ল্যাক প্রিন্টেড কুর্তি', size: 'L', qty: 1, price: 4795 }]),
  4795, 'SB Plaza, Azampur, Uttara Sector 3, Dhaka');

console.log('Seed done: 3 products, 3 FAQs, 2 conversations, 1 order');
