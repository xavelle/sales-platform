// Website chat channel - embeddable widget posts here.
const { findOrCreateCustomer, findOrCreateConversation, addMessage } = require('../db');
const { generateReply } = require('../ai');

async function handleWebchat({ session_id, name, text }) {
  if (!session_id || !text) throw new Error('session_id and text required');
  const customer = findOrCreateCustomer('webchat', String(session_id), name || 'Website Visitor');
  const conv = findOrCreateConversation(customer);
  addMessage(conv.id, 'customer', text);
  let reply = null;
  if (conv.ai_enabled) {
    reply = await generateReply(conv.id);
    if (reply) addMessage(conv.id, 'ai', reply);
  }
  return { reply, conversation_id: conv.id };
}

module.exports = { handleWebchat };
