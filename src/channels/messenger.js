// Facebook Messenger channel.
// Needs: FB_VERIFY_TOKEN, FB_PAGE_ACCESS_TOKEN in .env + webhook URL set in Meta app.
const { findOrCreateCustomer, findOrCreateConversation, addMessage } = require('../db');
const { generateReply } = require('../ai');

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

async function receive(req, res) {
  res.status(200).send('EVENT_RECEIVED');
  try {
    const body = req.body;
    if (body.object !== 'page') return;
    for (const entry of body.entry || []) {
      for (const ev of entry.messaging || []) {
        if (!ev.message || ev.message.is_echo) continue;
        const psid = ev.sender.id, text = ev.message.text;
        if (!text) continue;
        const customer = findOrCreateCustomer('messenger', String(psid));
        const conv = findOrCreateConversation(customer);
        addMessage(conv.id, 'customer', text);
        if (conv.ai_enabled) {
          const reply = await generateReply(conv.id);
          if (reply) { addMessage(conv.id, 'ai', reply); await sendMessage(psid, reply); }
        }
      }
    }
  } catch (e) { console.error('[messenger] receive error', e.message); }
}

module.exports = { verify, receive, sendMessage };
