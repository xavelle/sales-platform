// Voice বোঝা — কাস্টমারের ভয়েস মেসেজ লেখায় বদলানো।
// Groq-এর ফ্রি Whisper API ব্যবহার করে (GROQ_API_KEY, OpenAI-compatible endpoint)।
async function fetchWithTimeout(url, options, ms = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

// audioUrl (Messenger-এর attachment লিংক) → লেখা (বাংলা/ইংরেজি)। ব্যর্থ হলে null।
async function transcribeAudio(audioUrl) {
  const key = process.env.GROQ_API_KEY;
  if (!key || !audioUrl) return null;
  try {
    const audioRes = await fetchWithTimeout(audioUrl, {}, 20000);
    if (!audioRes.ok) { console.error('[media] audio download HTTP', audioRes.status); return null; }
    const contentType = (audioRes.headers.get('content-type') || 'audio/mp4').split(';')[0].trim();
    const buffer = Buffer.from(await audioRes.arrayBuffer());
    if (!buffer.length) return null;
    const ext = /mpeg/.test(contentType) ? 'mp3' : /ogg/.test(contentType) ? 'ogg' : /wav/.test(contentType) ? 'wav' : /aac/.test(contentType) ? 'aac' : 'm4a';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: contentType }), 'voice.' + ext);
    form.append('model', 'whisper-large-v3-turbo');
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    }, 45000);
    if (!res.ok) { console.error('[media] whisper HTTP', res.status); return null; }
    const data = await res.json();
    const text = data && data.text ? data.text.trim() : null;
    return text || null;
  } catch (e) { console.error('[media] whisper error', e.message); return null; }
}

module.exports = { transcribeAudio };
