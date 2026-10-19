// Dashboard app logic
const api = (m, u, b) => fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
let activeConv = null, activePhone = '';

document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('tab-' + b.dataset.tab).classList.add('active');
  ({ inbox: loadInbox, orders: loadOrders, products: loadProducts, aisetu: loadSettings, analytics: loadAnalytics }[b.dataset.tab] || (() => {}))();
});

// ---------- Inbox ----------
async function loadInbox() {
  const convs = await api('GET', '/api/conversations');
  const unread = convs.filter(c => c.unread).length;
  const badge = document.getElementById('unreadBadge');
  badge.textContent = unread; badge.classList.toggle('hidden', !unread);
  document.getElementById('convList').innerHTML = convs.map(c => `
    <div class="conv ${c.unread ? 'unread' : ''} ${activeConv === c.id ? 'active' : ''}" onclick="openConv(${c.id})">
      <div class="ch">${c.channel}${c.ai_enabled ? ' 🤖' : ''}</div>
      <div class="nm">${esc(c.name || 'Customer')} ${c.phone ? '· ' + esc(c.phone) : ''}</div>
      <div class="lt">${esc(c.last_text || '')}</div>
    </div>`).join('') || '<p class="muted" style="padding:16px">No conversations yet</p>';
}
async function openConv(id) {
  activeConv = id;
  const convs = await api('GET', '/api/conversations');
  const c = convs.find(x => x.id === id);
  activePhone = c.phone || '';
  document.getElementById('chatHeader').textContent = `${c.name || 'Customer'} (${c.channel}) ${c.phone || ''}`;
  document.getElementById('chatInput').classList.remove('hidden');
  document.getElementById('aiToggle').checked = !!c.ai_enabled;
  await api('POST', `/api/conversations/${id}/read`);
  renderMsgs(); loadInbox();
}
async function renderMsgs() {
  if (!activeConv) return;
  const msgs = await api('GET', `/api/conversations/${activeConv}/messages`);
  document.getElementById('chatMsgs').innerHTML = msgs.map(m => `
    <div class="msg ${m.sender}"><span class="who">${m.sender === 'customer' ? 'Customer' : m.sender === 'ai' ? '🤖 AI' : 'You'} · ${m.created_at}</span>${esc(m.text)}</div>`).join('');
  const box = document.getElementById('chatMsgs'); box.scrollTop = box.scrollHeight;
}
async function sendReply() {
  const t = document.getElementById('replyText').value.trim();
  if (!t || !activeConv) return;
  document.getElementById('replyText').value = '';
  await api('POST', `/api/conversations/${activeConv}/reply`, { text: t });
  renderMsgs();
}
document.getElementById('aiToggle').onchange = async e => {
  if (!activeConv) return;
  await api('POST', `/api/conversations/${activeConv}/ai-toggle`);
  loadInbox();
};
function tapToCall() {
  if (!activePhone) return alert('No phone number for this customer');
  window.location.href = 'tel:' + activePhone; // tap-to-call (mobile) / prompt on desktop
}
setInterval(() => { if (document.getElementById('tab-inbox').classList.contains('active')) { loadInbox(); if (activeConv) renderMsgs(); } }, 5000);

// ---------- Orders ----------
async function loadOrders() {
  const orders = await api('GET', '/api/orders');
  document.getElementById('orderRows').innerHTML = orders.map(o => `
    <tr><td><b>${o.order_no}</b><br><span class="muted">${o.created_at}</span></td>
    <td>${esc(o.customer_name || '-')}</td>
    <td>${o.items.map(i => `${esc(i.name)}${i.size ? ' (' + i.size + ')' : ''} ×${i.qty}`).join('<br>')}</td>
    <td>৳${o.total}</td><td>${o.status}</td>
    <td><select onchange="setStatus(${o.id}, this.value)">
      ${['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
    </select></td></tr>`).join('');
}
async function setStatus(id, status) { await api('PATCH', `/api/orders/${id}`, { status }); loadOrders(); }

// ---------- Products ----------
async function loadProducts() {
  const ps = await api('GET', '/api/products');
  document.getElementById('prodRows').innerHTML = ps.map(p => `
    <tr><td>${esc(p.name)}</td><td>৳${p.price}</td><td>${esc(p.sizes)}</td><td>${p.stock}</td>
    <td><button onclick="delProduct(${p.id})" style="background:#ff4d6d">Delete</button></td></tr>`).join('');
}
async function addProduct() {
  const b = id => document.getElementById(id).value;
  if (!b('pName').value || !b('pPrice').value) return alert('Name + price required');
  await api('POST', '/api/products', { name: b('pName').value, price: +b('pPrice').value, sizes: b('pSizes').value, stock: +b('pStock').value || 0, description: b('pDesc').value });
  ['pName', 'pPrice', 'pSizes', 'pStock', 'pDesc'].forEach(i => document.getElementById(i).value = '');
  loadProducts();
}
async function delProduct(id) { await api('DELETE', `/api/products/${id}`); loadProducts(); }

// ---------- Broadcast ----------
async function sendBroadcast() {
  const text = document.getElementById('bcText').value.trim();
  if (!text) return;
  const r = await api('POST', '/api/broadcast', { text });
  document.getElementById('bcResult').textContent = `Queued to ${r.queued} customers`;
}

// ---------- AI Setup ----------
async function loadSettings() {
  const s = await api('GET', '/api/settings');
  document.getElementById('sName').value = s.business_name || '';
  document.getElementById('sGreet').value = s.greeting || '';
  document.getElementById('sDel').value = s.delivery_charge || '';
  document.getElementById('sRet').value = s.return_policy || '';
  document.getElementById('sPay').value = s.payment || '';
  const faqs = await api('GET', '/api/faqs');
  document.getElementById('faqList').innerHTML = faqs.map(f => `
    <div class="faq"><div><b>${esc(f.question)}</b><br><span class="muted">${esc(f.answer)}</span></div>
    <button onclick="delFaq(${f.id})">Delete</button></div>`).join('');
}
async function saveSettings() {
  const v = id => document.getElementById(id).value;
  await api('POST', '/api/settings', { business_name: v('sName'), greeting: v('sGreet'), delivery_charge: v('sDel'), return_policy: v('sRet'), payment: v('sPay') });
  document.getElementById('setMsg').textContent = 'Saved ✓';
  setTimeout(() => document.getElementById('setMsg').textContent = '', 2000);
}
async function addFaq() {
  const q = document.getElementById('fQ').value, a = document.getElementById('fA').value;
  if (!q || !a) return;
  await api('POST', '/api/faqs', { question: q, answer: a });
  document.getElementById('fQ').value = document.getElementById('fA').value = '';
  loadSettings();
}
async function delFaq(id) { await api('DELETE', `/api/faqs/${id}`); loadSettings(); }

// ---------- Analytics ----------
async function loadAnalytics() {
  const a = await api('GET', '/api/analytics');
  document.getElementById('anaCards').innerHTML = `
    <div class="card"><div class="v">${a.totalOrders}</div><div class="l">Total orders</div></div>
    <div class="card"><div class="v">${a.unread}</div><div class="l">Unread chats</div></div>
    <div class="card"><div class="v">${a.whatsapp ? 'ON' : 'OFF'}</div><div class="l">WhatsApp</div></div>`;
  const max = Math.max(1, ...a.msgByDay.map(x => x.n));
  document.getElementById('msgChart').innerHTML = a.msgByDay.map(x =>
    `<div class="bar"><span style="width:90px">${x.d}</span><div class="fill" style="width:${x.n / max * 200}px"></div><span>${x.n}</span></div>`).join('');
  document.getElementById('ordChart').innerHTML = a.ordersByStatus.map(x =>
    `<div class="bar"><span style="width:90px">${x.status}</span><div class="fill" style="width:${x.n * 40}px"></div><span>${x.n} · ৳${x.t || 0}</span></div>`).join('');
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

loadInbox();
