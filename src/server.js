// Sales Platform server - unified inbox, orders, AI chatbot
require('dotenv').config();
const express = require('express');
const path = require('path');
const { db, getSetting, setSetting, addMessage, nextOrderNo, adjustStockForItems } = require('./db');
const { handleWebchat } = require('./channels/webchat');
const messenger = require('./channels/messenger');
const whatsapp = require('./channels/whatsapp');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Webhooks ----------
app.get('/webhook/messenger', messenger.verify);
app.post('/webhook/messenger', messenger.receive);
app.get('/webhook/whatsapp', whatsapp.verify);
app.post('/webhook/whatsapp', whatsapp.receive);

// ---------- Website chat ----------
app.post('/api/webchat/message', async (req, res) => {
  try {
    const out = await handleWebchat(req.body);
    res.json({ ok: true, ...out });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

// ---------- Conversations / Inbox ----------
app.get('/api/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, cu.name, cu.phone,
      (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_text
    FROM conversations c JOIN customers cu ON cu.id = c.customer_id
    ORDER BY c.last_message_at DESC`).all();
  res.json(rows);
});
app.get('/api/conversations/:id/messages', (req, res) => {
  const rows = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json(rows);
});
app.post('/api/conversations/:id/reply', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ ok: false });
  addMessage(req.params.id, 'human', text);
  const conv = db.prepare('SELECT c.*, cu.channel_id, cu.channel FROM conversations c JOIN customers cu ON cu.id = c.customer_id WHERE c.id = ?').get(req.params.id);
  if (conv.channel === 'messenger') await messenger.sendMessage(conv.channel_id, text);
  res.json({ ok: true });
});
app.post('/api/conversations/:id/ai-toggle', (req, res) => {
  const conv = db.prepare('SELECT ai_enabled FROM conversations WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE conversations SET ai_enabled = ? WHERE id = ?').run(conv.ai_enabled ? 0 : 1, req.params.id);
  res.json({ ok: true, ai_enabled: conv.ai_enabled ? 0 : 1 });
});
app.post('/api/conversations/:id/read', (req, res) => {
  db.prepare('UPDATE conversations SET unread = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Products ----------
app.get('/api/products', (req, res) => res.json(db.prepare('SELECT * FROM products').all()));
app.post('/api/products', (req, res) => {
  const { name, price, sizes, stock, description } = req.body;
  const r = db.prepare('INSERT INTO products (name, price, sizes, stock, description) VALUES (?, ?, ?, ?, ?)').run(name, price, sizes || '', stock || 0, description || '');
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- FAQs ----------
app.get('/api/faqs', (req, res) => res.json(db.prepare('SELECT * FROM faqs').all()));
app.post('/api/faqs', (req, res) => {
  const r = db.prepare('INSERT INTO faqs (question, answer) VALUES (?, ?)').run(req.body.question, req.body.answer);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.delete('/api/faqs/:id', (req, res) => {
  db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Settings (AI Setup) ----------
app.get('/api/settings', (req, res) => {
  const keys = ['business_name', 'greeting', 'delivery_charge', 'return_policy', 'payment'];
  const out = {}; keys.forEach(k => out[k] = getSetting(k));
  res.json(out);
});
app.post('/api/settings', (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => setSetting(k, String(v)));
  res.json({ ok: true });
});

// ---------- Orders ----------
app.get('/api/orders', (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, cu.name AS customer_name, cu.phone AS customer_phone
    FROM orders o LEFT JOIN customers cu ON cu.id = o.customer_id
    ORDER BY o.id DESC`).all();
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
});
app.post('/api/orders', (req, res) => {
  const { customer_id, conversation_id, items, total, address } = req.body;
  const order_no = nextOrderNo();
  const r = db.prepare('INSERT INTO orders (order_no, customer_id, conversation_id, items, total, address) VALUES (?, ?, ?, ?, ?, ?)')
    .run(order_no, customer_id || null, conversation_id || null, JSON.stringify(items), total, address || '');
  adjustStockForItems(items, -1); // sell হলে stock কমবে
  res.json({ ok: true, id: Number(r.lastInsertRowid), order_no });
});
app.patch('/api/orders/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not found' });
  if (req.body.status === 'cancelled' && o.status !== 'cancelled') {
    adjustStockForItems(JSON.parse(o.items || '[]'), +1); // cancel হলে stock ফিরবে
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

// ---------- Broadcast (simple: webchat + messenger customers) ----------
app.post('/api/broadcast', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ ok: false });
  const customers = db.prepare('SELECT * FROM customers').all();
  let sent = 0;
  for (const c of customers) {
    if (c.channel === 'messenger') { if (await messenger.sendMessage(c.channel_id, text)) sent++; }
    else sent++; // webchat demo counts as queued
  }
  res.json({ ok: true, queued: customers.length, sent });
});

// ---------- Analytics ----------
app.get('/api/analytics', (req, res) => {
  const msgByDay = db.prepare(`SELECT date(created_at) d, COUNT(*) n FROM messages GROUP BY d ORDER BY d DESC LIMIT 7`).all();
  const ordersByStatus = db.prepare(`SELECT status, COUNT(*) n, SUM(total) t FROM orders GROUP BY status`).all();
  const unread = db.prepare(`SELECT COUNT(*) n FROM conversations WHERE unread = 1`).get().n;
  const totalOrders = db.prepare(`SELECT COUNT(*) n FROM orders`).get().n;
  res.json({ msgByDay, ordersByStatus, unread, totalOrders, whatsapp: whatsapp.ENABLED });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sales Platform running on http://localhost:${PORT}`));
