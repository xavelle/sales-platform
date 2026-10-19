// Embeddable website chat widget. Add to any site:
// <script src="https://YOUR-SERVER/widget.js" data-api="https://YOUR-SERVER"></script>
(function () {
  const script = document.currentScript;
  const API = (script && script.dataset.api) || window.location.origin;
  const session = localStorage.getItem('sp_session') || ('s' + Date.now() + Math.random().toString(16).slice(2));
  localStorage.setItem('sp_session', session);

  const css = `#spb{position:fixed;bottom:22px;right:22px;width:60px;height:60px;border-radius:50%;background:#3b5bfd;color:#fff;border:0;font-size:26px;cursor:pointer;box-shadow:0 4px 16px #0004;z-index:99999}
#spw{position:fixed;bottom:96px;right:22px;width:340px;max-width:calc(100vw - 44px);height:440px;background:#fff;border-radius:16px;box-shadow:0 8px 32px #0003;display:none;flex-direction:column;overflow:hidden;z-index:99999;font-family:system-ui}
#spw.open{display:flex}#sph{background:#141a2e;color:#fff;padding:13px 16px;font-weight:700}
#spm{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px}
.spmsg{max-width:80%;padding:9px 13px;border-radius:13px;font-size:14px}
.spmsg.c{background:#eef0f6;align-self:flex-start}.spmsg.a{background:#e7f6ec;align-self:flex-end}
#spf{display:flex;border-top:1px solid #eee}#sfi{flex:1;border:0;padding:12px;outline:0}#sfb{background:#3b5bfd;color:#fff;border:0;padding:0 18px;cursor:pointer}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const btn = document.createElement('button'); btn.id = 'spb'; btn.textContent = '💬';
  const win = document.createElement('div'); win.id = 'spw';
  win.innerHTML = `<div id="sph">💬 Chat with us</div><div id="spm"></div>
    <div id="spf"><input id="sfi" placeholder="লিখুন..."><button id="sfb">➤</button></div>`;
  document.body.append(btn, win);
  btn.onclick = () => win.classList.toggle('open');

  const box = win.querySelector('#spm');
  function addMsg(text, cls) {
    const d = document.createElement('div'); d.className = 'spmsg ' + cls; d.textContent = text;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }
  async function send() {
    const inp = win.querySelector('#sfi'), text = inp.value.trim();
    if (!text) return; inp.value = '';
    addMsg(text, 'c');
    try {
      const r = await fetch(API + '/api/webchat/message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session, text })
      }).then(r => r.json());
      if (r.reply) addMsg(r.reply, 'a');
    } catch { addMsg('দুঃখিত, সমস্যা হয়েছে। পরে চেষ্টা করুন।', 'a'); }
  }
  win.querySelector('#sfb').onclick = send;
  win.querySelector('#sfi').onkeydown = e => { if (e.key === 'Enter') send(); };
})();
