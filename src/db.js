// Database layer - Node built-in SQLite (no native build needed)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '..', 'data.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  sizes TEXT DEFAULT '',
  stock INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  channel TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel, channel_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  ai_enabled INTEGER DEFAULT 1,
  unread INTEGER DEFAULT 0,
  last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  conversation_id INTEGER,
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  address TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);
`);

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function findOrCreateCustomer(channel, channel_id, name = '', phone = '') {
  let c = db.prepare('SELECT * FROM customers WHERE channel = ? AND channel_id = ?').get(channel, channel_id);
  if (!c) {
    const r = db.prepare('INSERT INTO customers (channel, channel_id, name, phone) VALUES (?, ?, ?, ?)').run(channel, channel_id, name, phone);
    c = db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(r.lastInsertRowid));
  }
  return c;
}

function findOrCreateConversation(customer) {
  let conv = db.prepare('SELECT * FROM conversations WHERE customer_id = ? AND channel = ? ORDER BY id DESC LIMIT 1').get(customer.id, customer.channel);
  if (!conv) {
    const r = db.prepare('INSERT INTO conversations (customer_id, channel) VALUES (?, ?)').run(customer.id, customer.channel);
    conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(Number(r.lastInsertRowid));
  }
  return conv;
}

function addMessage(conversation_id, sender, text) {
  db.prepare('INSERT INTO messages (conversation_id, sender, text) VALUES (?, ?, ?)').run(conversation_id, sender, text);
  const unread = sender === 'customer' ? 1 : 0;
  db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, unread = ? WHERE id = ?').run(unread, conversation_id);
  return true;
}

function getHistory(conversation_id, limit = 12) {
  return db.prepare('SELECT sender, text FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?').all(conversation_id, limit).reverse();
}

function nextOrderNo() {
  const row = db.prepare("SELECT order_no FROM orders ORDER BY id DESC LIMIT 1").get();
  const n = row ? parseInt(row.order_no.replace(/\D/g, ''), 10) + 1 : 1001;
  return 'XV-' + n;
}

module.exports = { db, getSetting, setSetting, findOrCreateCustomer, findOrCreateConversation, addMessage, getHistory, nextOrderNo };
