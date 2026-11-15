// Messenger Profile সেটআপ — Get Started বোতাম, স্বাগতম লেখা, রেডি প্রশ্ন (ice breakers),
// স্থায়ী মেনু। সার্ভার চালু হলেই Page-এ বসিয়ে দেয় (পেজ টোকেন থাকলে)।
// ফলাফল settings-এ জমা থাকে — GET /api/messenger-profile দিয়ে দেখা যায়।
const { setSetting } = require('./db');

async function setupProfile() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) { console.log('[profile] no FB_PAGE_ACCESS_TOKEN — skipped'); return; }
  try {
    let pageId = process.env.FB_PAGE_ID;
    if (!pageId) {
      const me = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`).then(r => r.json());
      pageId = me && me.id;
    }
    if (!pageId) throw new Error('page id not found');
    const body = {
      get_started: { payload: 'GET_STARTED' },
      greeting: [{ locale: 'default', text: 'আসসালামু আলাইকুম! Xavelle-এ স্বাগতম 😊 পণ্য, দাম, ডেলিভারি বা অর্ডার নিয়ে যেকোনো প্রশ্ন লিখুন।' }],
      ice_breakers: [
        { question: 'কীভাবে অর্ডার করব?', payload: 'ICE_ORDER' },
        { question: 'ডেলিভারি চার্জ কত?', payload: 'ICE_DELIVERY' },
        { question: 'ক্যাশ অন ডেলিভারি আছে?', payload: 'ICE_COD' },
        { question: 'মানুষের সাথে কথা বলতে চাই', payload: 'ICE_HUMAN' },
      ],
      persistent_menu: [{
        locale: 'default', composer_input_disabled: false,
        call_to_actions: [
          { type: 'postback', title: 'প্রোডাক্ট দেখুন', payload: 'MENU_PRODUCTS' },
          { type: 'web_url', title: 'ওয়েবসাইট', url: 'https://xavelle.github.io/xavelle/' },
          { type: 'postback', title: 'মানুষের সাথে কথা', payload: 'MENU_HUMAN' },
        ],
      }],
      whitelisted_domains: ['https://xavelle.github.io'],
    };
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messenger_profile?access_token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    const ok = res.ok && data && data.result === 'success';
    setSetting('profile_setup_result', JSON.stringify({ ok, at: new Date().toISOString(), response: data }));
    console.log('[profile] setup', ok ? 'OK' : 'FAILED', JSON.stringify(data).slice(0, 200));
  } catch (e) {
    try { setSetting('profile_setup_result', JSON.stringify({ ok: false, at: new Date().toISOString(), error: e.message })); } catch {}
    console.error('[profile] setup error', e.message);
  }
}

module.exports = { setupProfile };
