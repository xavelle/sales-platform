// Embeddable website chat widget. Add to any site:
// <script src="https://YOUR-SERVER/widget.js" data-api="https://YOUR-SERVER" defer></script>
(function () {
  var script = document.currentScript;
  var API = (script && script.dataset.api) || window.location.origin;
  var session = localStorage.getItem('sp_session') || ('s' + Date.now() + Math.random().toString(16).slice(2));
  localStorage.setItem('sp_session', session);

  var css = '#spb{position:fixed;bottom:22px;right:22px;width:60px;height:60px;border-radius:50%;background:#3b5bfd;color:#fff;border:0;font-size:26px;cursor:pointer;box-shadow:0 4px 16px #0004;z-index:99999;display:flex;align-items:center;justify-content:center}'
    + '.sp-chat-btn{width:52px!important;height:52px!important;border-radius:50%!important;background:#3b5bfd!important;color:#fff!important;border:0!important;font-size:24px!important;cursor:pointer!important;box-shadow:0 4px 14px rgba(0,0,0,.25)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:0!important}'
    + '#spw{position:fixed;bottom:96px;right:22px;width:340px;max-width:calc(100vw - 44px);height:440px;background:#fff;border-radius:16px;box-shadow:0 8px 32px #0003;display:none;flex-direction:column;overflow:hidden;z-index:99999;font-family:system-ui}'
    + '#spw.open{display:flex}#sph{background:#141a2e;color:#fff;padding:13px 16px;font-weight:700}'
    + '#spm{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px}'
    + '.spmsg{max-width:80%;padding:9px 13px;border-radius:13px;font-size:14px;color:#1e2430}'
    + '.spmsg.c{background:#eef0f6;align-self:flex-start}.spmsg.a{background:#e7f6ec;align-self:flex-end}'
    + '#spf{display:flex;border-top:1px solid #eee}#sfi{flex:1;border:0;padding:12px;outline:0;font-size:14px}#sfb{background:#3b5bfd;color:#fff;border:0;padding:0 18px;cursor:pointer;font-size:16px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // Chat window
  var win = document.createElement('div'); win.id = 'spw';
  win.innerHTML = '<div id="sph">🤖 AI Chat</div><div id="spm"></div>'
    + '<div id="spf"><input id="sfi" placeholder="লিখুন..."><button id="sfb">➤</button></div>';
  document.body.appendChild(win);
  var box = win.querySelector('#spm');
  function toggle() { win.classList.toggle('open'); }
  function addMsg(text, cls) {
    var d = document.createElement('div'); d.className = 'spmsg ' + cls; d.textContent = text;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }
  function send() {
    var inp = win.querySelector('#sfi'), text = inp.value.trim();
    if (!text) return; inp.value = '';
    addMsg(text, 'c');
    fetch(API + '/api/webchat/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session, text: text })
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (r.reply) addMsg(r.reply, 'a');
    }).catch(function () { addMsg('দুঃখিত, সমস্যা হয়েছে। পরে চেষ্টা করুন।', 'a'); });
  }
  win.querySelector('#sfb').onclick = send;
  win.querySelector('#sfi').onkeydown = function (e) { if (e.key === 'Enter') send(); };

  // Chat button: integrate into site's floating button column if present, else standalone
  function makeBtn(integrated) {
    var btn = document.createElement('button');
    btn.setAttribute('aria-label', 'AI Chat');
    btn.textContent = '🤖';
    if (integrated) { btn.className = 'sp-chat-btn'; }
    else { btn.id = 'spb'; }
    btn.onclick = toggle;
    return btn;
  }
  function integrate(attempts) {
    var wrap = document.getElementById('floatBtns');
    if (wrap) {
      var main = document.getElementById('fabMain');
      var btn = makeBtn(true);
      if (main) wrap.insertBefore(btn, main); else wrap.appendChild(btn);
      return true;
    }
    if (attempts < 25) { setTimeout(function () { integrate(attempts + 1); }, 200); return false; }
    document.body.appendChild(makeBtn(false));
    return true;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { integrate(0); });
  } else { integrate(0); }
})();
