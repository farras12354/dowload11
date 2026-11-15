/* Zhafdor app-v3.js — tulis ulang bersih */

const BASE = '/api/downloader';

const PLATFORM_MAP = {
  tiktok:    { endpoint: 'tiktok',           label: 'TikTok' },
  instagram: { endpoint: 'instagram',        label: 'Instagram' },
  youtube:   { endpoint: 'youtube-download', label: 'YouTube' },
  twitter:   { endpoint: 'twitter',          label: 'Twitter / X' },
  facebook:  { endpoint: 'facebook',         label: 'Facebook' },
  threads:   { endpoint: 'threads',          label: 'Threads' },
  pinterest: { endpoint: 'pinterest',        label: 'Pinterest' },
};

let activePlatform = 'tiktok';
let _lastSourceUrl = '';
let _lastEndpoint  = '';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function sanitizeName(s) {
  return String(s || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'video';
}

// ── Platform tabs ──────────────────────────────────────────────
document.querySelectorAll('.platform-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePlatform = btn.dataset.platform;
    const hints = {
      tiktok:'https://www.tiktok.com/@user/video/...',
      instagram:'https://www.instagram.com/p/...',
      youtube:'https://www.youtube.com/watch?v=...',
      twitter:'https://twitter.com/user/status/...',
      facebook:'https://www.facebook.com/watch?v=...',
      threads:'https://www.threads.net/@user/post/...',
      pinterest:'https://www.pinterest.com/pin/...',
    };
    document.getElementById('urlInput').placeholder = hints[activePlatform] || 'Tempel tautan video...';
    hideResult(); hideNotice();
  });
});

// Auto-detect platform
document.getElementById('urlInput').addEventListener('paste', e => {
  setTimeout(() => {
    const v = e.target.value;
    const map = {
      'tiktok.com':'tiktok','vm.tiktok.com':'tiktok','vt.tiktok.com':'tiktok',
      'instagram.com':'instagram','youtube.com':'youtube','youtu.be':'youtube',
      'twitter.com':'twitter','x.com':'twitter','facebook.com':'facebook',
      'fb.watch':'facebook','threads.net':'threads','pinterest.com':'pinterest','pin.it':'pinterest',
    };
    for (const [h, p] of Object.entries(map)) {
      if (v.includes(h)) {
        document.querySelectorAll('.platform-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.platform === p));
        activePlatform = p;
        break;
      }
    }
  }, 0);
});

document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchDownload();
});

// ── Fetch video ────────────────────────────────────────────────
async function fetchDownload() {
  const inputVal = document.getElementById('urlInput').value.trim();
  if (!inputVal) { showNotice('Masukkan tautan video.', 'error'); return; }

  // Auto-detect
  const map2 = {
    'tiktok.com':'tiktok','vm.tiktok.com':'tiktok','instagram.com':'instagram',
    'youtube.com':'youtube','youtu.be':'youtube','twitter.com':'twitter',
    'x.com':'twitter','facebook.com':'facebook','fb.watch':'facebook',
    'threads.net':'threads','pinterest.com':'pinterest',
  };
  try {
    const hn = new URL(inputVal).hostname.replace('www.','');
    for (const [h,p] of Object.entries(map2)) {
      if (hn.includes(h)) {
        document.querySelectorAll('.platform-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.platform === p));
        activePlatform = p;
        break;
      }
    }
  } catch {}

  setLoading(true); hideResult(); hideNotice();

  const { endpoint, label } = PLATFORM_MAP[activePlatform];
  _lastSourceUrl = inputVal;
  _lastEndpoint  = endpoint;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 25000);

  try {
    const res  = await fetch(`${BASE}/${endpoint}?url=${encodeURIComponent(inputVal)}`, { signal: ctrl.signal });
    clearTimeout(tid);
    const data = await res.json();
    if (!data.status) { showNotice(data.message || 'Gagal. Pastikan link valid dan publik.', 'error'); return; }
    renderResult(data, label);
  } catch (err) {
    clearTimeout(tid);
    showNotice(err.name === 'AbortError' ? 'Timeout. Coba lagi.' : 'Gagal terhubung. Coba lagi.', 'error');
  } finally {
    setLoading(false);
  }
}

// ── Render hasil ───────────────────────────────────────────────
function renderResult(data, platformLabel) {
  const tw = document.getElementById('thumbWrap');
  const thumb = data.thumbnail || data.thumb || data.cover
    || data.data?.thumbnail || data.data?.thumb
    || data.result?.media?.thumbnail || data.result?.media?.thumbnails?.[0]?.url;
  tw.innerHTML = thumb
    ? `<img class="result-thumb" src="${esc(thumb)}" alt="thumb" onerror="this.style.display='none'">`
    : `<div class="result-thumb-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7a879a" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 10 6 4-6 4V10z"/></svg></div>`;

  const title = data.title || data.data?.title || data.caption || data.data?.caption
    || data.result?.metadata?.caption || 'Video';
  let author = data.author || data.data?.author || data.uploader
    || data.result?.author?.username || data.result?.author?.fullName || '';
  if (typeof author === 'object') author = author.nickname || author.username || author.name || '';

  document.getElementById('resultTitle').textContent   = title;
  document.getElementById('resultAuthor').textContent  = author ? `@${String(author).replace(/^@/,'')}` : platformLabel;
  document.getElementById('resultPlatform').textContent = platformLabel;

  const items = collectItems(data, title);

  // Preview video — hanya MP4, bukan gambar
  const d = data.data || data;
  let previewUrl = Array.isArray(d.downloads) && d.downloads[0]?.sourceUrl
    ? d.downloads[0].sourceUrl
    : (d.play || d.video || d.videoUrl || d.video_url
        || d.result?.media?.videos?.[0]?.url || '');
  if (!previewUrl) {
    const fi = items.find(i => i.kind === 'video');
    if (fi) previewUrl = fi.url;
  }

  const vw = document.getElementById('videoWrap');
  if (previewUrl) {
    vw.style.display = 'block';
    vw.innerHTML = `<video class="video-preview" controls playsinline preload="metadata" referrerpolicy="no-referrer">
      <source src="${esc(previewUrl)}" type="video/mp4"></video>`;
  } else {
    vw.style.display = 'none'; vw.innerHTML = '';
  }

  const list = document.getElementById('downloadList');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = `<p style="color:var(--text2);text-align:center;padding:20px 0">Tidak ada unduhan ditemukan.</p>`;
  } else {
    items.forEach(item => list.appendChild(createItem(item)));
  }

  document.getElementById('result').style.display = 'block';
  document.getElementById('result').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// ── Kumpulkan item ─────────────────────────────────────────────
function collectItems(data, videoTitle) {
  const items = [];
  const d     = data.data || data;
  const title = sanitizeName(videoTitle || d.title || 'video');

  const push = (label, badge, desc, url, isPrimary, kind) => {
    if (typeof url === 'string' && url.startsWith('http'))
      items.push({ label, badge, desc, url, isPrimary, kind: kind || 'video', title });
  };

  // YouTube files[]
  if (Array.isArray(d.files)) {
    d.files.forEach((f, i) => {
      const isAud = f.contentType?.includes('audio') || f.quality?.toLowerCase().includes('audio');
      push(f.quality || `Video ${i+1}`, isAud ? 'MP3' : 'MP4', '', f.url, i === 0, isAud ? 'audio' : 'video');
    });
  }

  // TikTok downloads[]
  if (Array.isArray(d.downloads) && d.downloads[0]) {
    const dl = d.downloads[0];
    const u = dl.url || dl.sourceUrl;
    if (u) push('Video HD', 'Tanpa watermark', 'Kualitas terbaik', u, true, 'video');
  }

  // Instagram media.videos[]
  const media = d.media || d.result?.media;
  if (media?.videos?.length) {
    media.videos.forEach((v, i) =>
      push(`Video${media.videos.length > 1 ? ` ${i+1}` : ''}`, 'MP4', v.resolution || '', v.url, i === 0, 'video'));
  }

  const meta = d.result?.metadata || d.metadata;
  if (meta && !media) push('Video', 'MP4', '', meta.videoUrl || meta.video_url, true, 'video');

  push('Video HD', 'HD', '', d.video_hd || d.videoHd || d.hd, items.length === 0, 'video');
  push('Video',    'MP4','', d.video || d.video_url || d.videoUrl || d.download || d.url, items.length === 0, 'video');
  push('Video SD', 'SD', '', d.video_sd || d.videoSd || d.sd, false, 'video');
  push('Audio',    'MP3','', d.audio || d.audio_url || d.musicUrl || d.mp3, false, 'audio');

  // Jangan push gambar sebagai item utama kecuali memang platform gambar
  const thumb = d.image || d.photo || d.img;
  if (thumb) push('Foto', 'JPG', '', thumb, false, 'image');

  if (d.qualities?.length)  d.qualities.forEach((q,i)  => push(q.label || q.quality || 'Video','MP4','',q.url||q.link,i===0,'video'));
  if (d.formats?.length)    d.formats.forEach((f,i)    => push(f.label || f.format  || 'Video','MP4','',f.url||f.link,i===0,'video'));
  if (d.links?.length)      d.links.forEach((l,i)      => push(l.label || l.type    || 'Unduhan','Tautan','',l.url||l.link,i===0,'video'));
  if (d.images?.length)     d.images.forEach((img,i)   => {
    const u = typeof img === 'string' ? img : (img?.url || img?.src);
    push(`Gambar ${i+1}`, 'JPG', '', u, false, 'image');
  });

  // Fallback scan
  if (!items.length) {
    Object.values(d).forEach(v => {
      if (typeof v === 'string' && v.startsWith('http') && /\.(mp4|mp3|webm)/.test(v))
        push('Video', 'MP4', '', v, true, 'video');
    });
  }

  return items;
}

// ── Buat elemen item ───────────────────────────────────────────
function createItem({ label, badge, desc, url, isPrimary, kind, title }) {
  if (typeof url !== 'string') return document.createElement('div');

  const isAudio = kind === 'audio';
  const isImage = kind === 'image';

  // Ekstensi file yang benar sesuai jenis
  const fileExt = isAudio ? 'mp3' : isImage ? 'jpg' : 'mp4';

  const iconSvg = isAudio
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    : isImage
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

  const dlSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 20h14"/></svg>';

  const el = document.createElement('div');
  el.className = `download-item ${isPrimary ? 'is-primary' : ''}`;
  el.innerHTML = `
    <div class="dl-icon">${iconSvg}</div>
    <div class="dl-info">
      <div class="dl-title-row">
        <span class="dl-label">${esc(label)}</span>
        ${badge ? `<span class="dl-badge">${esc(badge)}</span>` : ''}
      </div>
      ${desc ? `<div class="dl-desc">${esc(desc)}</div>` : ''}
    </div>
    <button class="btn-dl ${isPrimary ? 'primary-btn' : ''}"
      data-url="${esc(url)}"
      data-title="${esc(title)}"
      data-ext="${esc(fileExt)}"
      onclick="startDownload(event)">
      ${dlSvg} Unduh
    </button>`;
  return el;
}

// ── Download — nama selalu UNIK ────────────────────────────────
async function startDownload(e) {
  e.preventDefault();
  const btn   = e.currentTarget;
  const url   = btn.dataset.url;
  const title = btn.dataset.title || 'video';
  const ext   = btn.dataset.ext   || 'mp4';

  if (!url) return;

  // Nama unik: judul + timestamp (base36) + random 4 char
  const uid      = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const filename = `${sanitizeName(title)}_${uid}.${ext}`;

  // Visual feedback
  const orig = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin .7s linear infinite;display:inline-block"><path d="M12 2a10 10 0 0 1 10 10"/></svg> Unduh...`;

  // SELALU re-fetch URL segar — semua URL Jagoan Project expire cepat
  let finalUrl = url;
  if (_lastSourceUrl && _lastEndpoint) {
    try {
      showNotice('Menyiapkan unduhan...', 'info');
      const res  = await fetch(`${BASE}/${_lastEndpoint}?url=${encodeURIComponent(_lastSourceUrl)}`);
      const data = await res.json();
      if (data.status) {
        const fresh  = collectItems(data, title);
        const isAud  = ext === 'mp3';
        const isImg  = ext === 'jpg';
        const target = fresh.find(i => i.kind === (isAud ? 'audio' : isImg ? 'image' : 'video'));
        if (target?.url) finalUrl = target.url;
        else if (fresh[0]?.url) finalUrl = fresh[0].url;
      }
      hideNotice();
    } catch { hideNotice(); }
  }

  // Download langsung dari URL sumber — paling cepat
  const a = document.createElement('a');
  a.href = finalUrl;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 2000);
  hideNotice();

  // Reset tombol
  setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 3500);
}

// Inject keyframe spin
(function() {
  if (document.getElementById('_spin')) return;
  const s = document.createElement('style');
  s.id = '_spin';
  s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
})();

// ── UI helpers ─────────────────────────────────────────────────
function setLoading(on) {
  const btn = document.getElementById('fetchBtn');
  const sp  = document.getElementById('spinner');
  const ic  = document.getElementById('btnIcon');
  const tx  = document.getElementById('btnText');
  btn.disabled = on;
  sp.style.display = on ? 'block' : 'none';
  ic.style.display = on ? 'none'  : 'block';
  tx.textContent   = on ? 'Memproses...' : 'Cari';
}

function showNotice(msg, type='info') {
  const el = document.getElementById('notice');
  el.textContent = msg; el.className = `notice ${type}`; el.style.display = 'block';
}

function hideNotice() { document.getElementById('notice').style.display = 'none'; }
function hideResult()  { document.getElementById('result').style.display  = 'none'; }

// ── Mobile nav ─────────────────────────────────────────────────
const _nt = document.getElementById('navToggle');
const _nl = document.getElementById('navLinks');
if (_nt && _nl) {
  const im = _nt.querySelector('.icon-menu');
  const ic = _nt.querySelector('.icon-close');
  const tg = open => {
    const o = open !== undefined ? open : !_nl.classList.contains('open');
    _nl.classList.toggle('open', o);
    _nt.setAttribute('aria-expanded', String(o));
    if (im && ic) { im.style.display = o ? 'none' : 'block'; ic.style.display = o ? 'block' : 'none'; }
  };
  _nt.addEventListener('click', () => tg());
  document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => tg(false)));
  document.addEventListener('click', e => {
    if (!_nt.contains(e.target) && !_nl.contains(e.target)) tg(false);
  });
}

function selectPlatformQuick(platform) {
  const btn = document.querySelector(`.platform-btn[data-platform="${platform}"]`);
  if (btn) btn.click();
  document.getElementById('urlInput')?.focus();
  document.getElementById('toolWrapper')?.scrollIntoView({ behavior:'smooth', block:'center' });
}
