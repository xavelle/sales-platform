// WhatsApp channel - OFF by default (pluggable).
//
// When Sayed provides the WhatsApp Cloud API credentials, set in .env:
//   WHATSAPP_ENABLED=true
//   WHATSAPP_TOKEN=<token>
//   WHATSAPP_PHONE_NUMBER_ID=<phone number id>
// Then implement verify/receive/sendMessage below following the same
// pattern as channels/messenger.js, using:
//   POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
// with body { messaging_product: 'whatsapp', to, type: 'text', text: { body } }
// and webhook verification with the same VERIFY_TOKEN flow.
//
// Until then every function below is a safe no-op and the dashboard
// shows WhatsApp as "Coming soon".

const ENABLED = process.env.WHATSAPP_ENABLED === 'true';

function verify(req, res) {
  if (!ENABLED) return res.sendStatus(404);
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

async function receive(req, res) {
  if (!ENABLED) return res.sendStatus(404);
  res.status(200).send('EVENT_RECEIVED');
  // TODO: parse entry[].changes[].value.messages[] -> save + AI reply (see messenger.js)
}

async function sendMessage(to, text) {
  if (!ENABLED) { console.log(`[whatsapp:OFF] would send to ${to}: ${text}`); return false; }
  // TODO: POST to graph.facebook.com/{PHONE_NUMBER_ID}/messages
  return false;
}

module.exports = { verify, receive, sendMessage, ENABLED };
