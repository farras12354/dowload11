/* ============================================================
   Zhafdor — app.js (DITULIS ULANG / DIBERSIHKAN — legacy)
   ============================================================
   Lihat catatan di app-v2.js: video "hilang" karena (a) URL
   sumber asli ditawarkan sebagai unduhan, dan (b) URL media
   kadaluarsa. Di sini sama: validasi URL + re-fetch segar +
   log lengkap di console.
   ============================================================ */

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
const DEBUG = true;

function log(...args) { if (DEBUG) console.log('[Zhafdor]', ...args); }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function sanitizeName(name) {
  return String(name || 'video').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video';
}

function uniqueName(baseName, ext) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${sanitizeName(baseName)}_${ts}${rand}.${ext}`;
}

// Validasi URL sebelum ditawarkan sebagai unduhan.
// Mengembalikan { ok, reason }; alasan dicatat ke console (F12 ? Console).
function checkMediaUrl(url, sourceUrl = '') {
  if (typeof url !== 'string' || !url.startsWith('http')) {
    return { ok: false, reason: 'bukan URL http' };
  }
  let u;
  try { u = new URL(url); } catch { return { ok: false, reason: 'URL tidak dapat diurai' }; }

  let src = null;
  try { src = sourceUrl ? new URL(sourceUrl) : null; } catch {}

  // HINDARI: URL sumber asli (halaman sosial) disalahkan jadi file video.
  if (src && u.hostname === src.hostname && u.pathname === src.pathname) {
    return { ok: false, reason: 'URL sumber asli (halaman sosial), bukan file video langsung' };
  }

  // HINDARI: host halaman media sosial umum.
  const social = ['tiktok.com','vm.tiktok.com','vt.tiktok.com','instagram.com','facebook.com','fb.watch','twitter.com','x.com','youtube.com','youtu.be','threads.net','pinterest.com','pin.it'];
  if (social.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) {
    return { ok: false, reason: 'host halaman media sosial, bukan file media langsung' };
  }

  const path = u.pathname.toLowerCase();
  const hasMediaExt = /\.(mp4|mp3|m4a|aac|ogg|webm|mov|avi|jpg|jpeg|png|webp|gif)([?#]|$)/.test(path);
  const isMediaHost = /googlevideo|videoplayback|facebookcdn|cdninstagram|tiktokcdn|ttcdn|media\.|cdn\./.test(u.hostname) || /videoplayback|googlevideo/.test(u.pathname + u.search);

  if (!hasMediaExt && !isMediaHost) {
    return { ok: false, reason: 'tidak terdeteksi sebagai file media (tanpa ekstensi media/host CDN)' };
  }
  return { ok: true };
}

// -- Platform tab switching --
document.querySelectorAll('.platform-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePlatform = btn.dataset.platform;
    const hints = {
      tiktok: 'https://www.tiktok.com/@user/video/...',
      instagram: 'https://www.instagram.com/p/... atau /reel/...',
      youtube: 'https://www.youtube.com/watch?v=...',
      twitter: 'https://twitter.com/user/status/...',
      facebook: 'https://www.facebook.com/watch?v=...',
      threads: 'https://www.threads.net/@user/post/...',
      pinterest: 'https://www.pinterest.com/pin/...',
    };
    document.getElementById('urlInput').placeholder = hints[activePlatform] || 'Tempel tautan video...';
    hideResult();
    hideNotice();
  });
});

// -- Auto-detect platform saat paste --
document.getElementById('urlInput').addEventListener('paste', e => {
  setTimeout(() => {
    const val = e.target.value;
    const map = {
      'tiktok.com': 'tiktok', 'vm.tiktok.com': 'tiktok', 'vt.tiktok.com': 'tiktok',
      'instagram.com': 'instagram',
      'youtube.com': 'youtube', 'youtu.be': 'youtube',
      'twitter.com': 'twitter', 'x.com': 'twitter',
      'facebook.com': 'facebook', 'fb.watch': 'facebook',
      'threads.net': 'threads',
      'pinterest.com': 'pinterest', 'pin.it': 'pinterest',
    };
    for (const [host, platform] of Object.entries(map)) {
      if (val.includes(host)) {
        document.querySelectorAll('.platform-btn').forEach(b => b.classList.toggle('active', b.dataset.platform === platform));
        activePlatform = platform;
        break;
      }
    }
  }, 0);
});

// Enter key
document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchDownload();
});

async function fetchDownload() {
  const inputVal = document.getElementById('urlInput').value.trim();
  if (!inputVal) { showNotice('Masukkan tautan video terlebih dahulu.', 'error'); return; }

  const map = {
    'tiktok.com': 'tiktok', 'vm.tiktok.com': 'tiktok', 'vt.tiktok.com': 'tiktok',
    'instagram.com': 'instagram',
    'youtube.com': 'youtube', 'youtu.be': 'youtube',
    'twitter.com': 'twitter', 'x.com': 'twitter',
    'facebook.com': 'facebook', 'fb.watch': 'facebook',
    'threads.net': 'threads',
    'pinterest.com': 'pinterest', 'pin.it': 'pinterest',
  };
  try {
    const hostname = new URL(inputVal).hostname.replace('www.', '');
    for (const [host, platform] of Object.entries(map)) {
      if (hostname.includes(host)) {
        document.querySelectorAll('.platform-btn').forEach(b => b.classList.toggle('active', b.dataset.platform === platform));
        activePlatform = platform;
        break;
      }
    }
  } catch {}

  setLoading(true);
  hideResult();
  hideNotice();

  const { endpoint, label } = PLATFORM_MAP[activePlatform];
  _lastSourceUrl = inputVal;
  _lastEndpoint  = endpoint;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    log('=== fetchDownload ===');
    log('Endpoint:', endpoint, '| Platform:', label, '| URL:', inputVal);
    const res = await fetch(`${BASE}/${endpoint}?url=${encodeURIComponent(inputVal)}&_t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeoutId);
    const data = await res.json();
    log('Respon API mentah:', data);

    if (!data.status) {
      showNotice(data.message || 'Gagal memproses tautan. Pastikan link valid dan video bersifat publik.', 'error');
      return;
    }
    renderResult(data, label);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') showNotice('Permintaan melebihi batas waktu. Coba lagi.', 'error');
    else showNotice('Gagal terhubung ke server. Coba lagi.', 'error');
    console.error(err);
  } finally {
    setLoading(false);
  }
}
// -- Render hasil --
function renderResult(data, platformLabel) {
  const thumbWrap = document.getElementById('thumbWrap');
  const thumb = data.thumbnail || data.thumb || data.cover
    || data.data?.thumbnail || data.data?.thumb
    || data.data?.files?.[0]?.thumbnail
    || data.result?.media?.thumbnail
    || data.result?.media?.thumbnails?.[0]?.url;
  if (thumb) {
    thumbWrap.innerHTML = `<img class="result-thumb" src="${esc(thumb)}" alt="Thumbnail" onerror="this.style.display='none'">`;
  } else {
    thumbWrap.innerHTML = `<div class="result-thumb-placeholder">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7a879a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 10 6 4-6 4V10z"/></svg></div>`;
  }

  const title = data.title || data.data?.title || data.caption || data.data?.caption
    || data.result?.metadata?.caption || 'Video';
  let author = data.author || data.data?.author || data.uploader || data.data?.uploader
    || data.result?.author?.username || data.result?.author?.fullName || '';
  if (typeof author === 'object' && author !== null) {
    author = author.nickname || author.username || author.name || '';
  }
  document.getElementById('resultTitle').textContent   = title;
  document.getElementById('resultAuthor').textContent  = author ? `@${String(author).replace(/^@/, '')}` : platformLabel;
  document.getElementById('resultPlatform').textContent = platformLabel;

  const items = collectItems(data);
  log('Item unduhan valid:', items.map(i => ({ label: i.label, url: i.url })));

  const d = data.data || data;
  let previewUrl = Array.isArray(d.downloads) && d.downloads[0]?.sourceUrl
    ? d.downloads[0].sourceUrl
    : (d.play || d.video || d.videoUrl || d.video_url
        || d.result?.media?.videos?.[0]?.url || '');
  if (!previewUrl && items.length) {
    const fi = items.find(i => i.url.includes('.mp4') || i.label.toLowerCase().includes('video'));
    if (fi) previewUrl = fi.url;
  }

  const videoWrap = document.getElementById('videoWrap');
  if (previewUrl) {
    const vres = checkMediaUrl(previewUrl, _lastSourceUrl);
    if (vres.ok) {
      videoWrap.style.display = 'block';
      videoWrap.innerHTML = `<video class="video-preview" controls playsinline preload="metadata" referrerpolicy="no-referrer">
        <source src="${esc(previewUrl)}" type="video/mp4">
      </video>`;
    } else {
      log('Preview ditolak:', vres.reason);
      videoWrap.style.display = 'none';
      videoWrap.innerHTML = '';
    }
  } else {
    videoWrap.style.display = 'none';
    videoWrap.innerHTML = '';
  }

  const list = document.getElementById('downloadList');
  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML = `<p style="color:var(--text2);font-size:0.875rem;text-align:center;padding:20px 0">Tidak ada tautan unduhan yang ditemukan.</p>`;
  } else {
    items.forEach((item, idx) => list.appendChild(createItem(item, idx, title)));
  }

  document.getElementById('result').style.display = 'block';
  document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// -- Kumpulkan item download (dengan validasi checkMediaUrl) --
function collectItems(data) {
  const items = [];
  const d     = data.data || data;

  const push = (label, badge, desc, url, isPrimary = false) => {
    if (typeof url !== 'string' || !url.startsWith('http')) return;
    const v = checkMediaUrl(url, _lastSourceUrl);
    if (!v.ok) {
      log('Ditolak [' + label + ']:', v.reason, '->', url);
      return;
    }
    items.push({ label, badge, desc, url, isPrimary });
  };

  if (Array.isArray(d.files)) {
    d.files.forEach((f, i) =>
      push(f.quality || `Video ${i+1}`, f.contentType?.includes('audio') ? 'MP3' : 'MP4',
        f.filename || '', f.url, i === 0));
  }

  if (Array.isArray(d.downloads)) {
    const dl = d.downloads[0];
    if (dl) {
      const u = dl.url || dl.sourceUrl;
      if (u) push('Video HD', 'Tanpa watermark', 'Kualitas terbaik', u, true);
    }
  }

  const media = d.media || d.result?.media;
  if (media?.videos?.length) {
    media.videos.forEach((v, i) =>
      push(`Video${media.videos.length > 1 ? ` ${i+1}` : ''}`, 'MP4',
        v.resolution || 'Kualitas asli', v.url, i === 0));
  }

  const meta = d.result?.metadata || d.metadata;
  if (meta && !media) push('Video', 'MP4', 'Kualitas asli', meta.videoUrl || meta.video_url, true);

  push('Video HD',      'HD',     'Kualitas terbaik',   d.video_hd || d.videoHd || d.hd,                      items.length === 0);
  push('Video',         'MP4',    'Kualitas standar',   d.video || d.video_url || d.videoUrl || d.download || d.url, items.length === 0);
  push('Video SD',      'SD',     'Ukuran lebih hemat', d.video_sd || d.videoSd || d.sd,                      false);
  push('Audio',         'MP3',    'Hanya suara',        d.audio || d.audio_url || d.musicUrl || d.mp3,         false);
  push('Foto',          'Gambar', 'Kualitas asli',      d.image || d.photo || d.img,                           false);

  if (d.qualities?.length)  d.qualities.forEach((q,i)  => push(q.label || q.quality || 'Video', 'MP4', q.size  || '', q.url  || q.link,  i===0));
  if (d.formats?.length)    d.formats.forEach((f,i)    => push(f.label || f.format  || 'Video', 'MP4', f.size  || '', f.url  || f.link,  i===0));
  if (d.links?.length)      d.links.forEach((l,i)      => push(l.label || l.type    || 'Unduhan','Tautan',l.quality||'',l.url||l.link, i===0));
  if (d.images?.length)     d.images.forEach((img,i)   => {
    const u = typeof img === 'string' ? img : (img?.url || img?.src);
    push(`Gambar ${i+1}`, 'JPG', 'Resolusi penuh', u, false);
  });

  if (items.length === 0) {
    Object.values(d).forEach(v => {
      if (typeof v === 'string' && v.startsWith('http') &&
          /\.(mp4|mp3|jpg|jpeg|png|webm|webp)/.test(v))
        push('File', 'Langsudh', '', v, false);
    });
  }

  return items;
}

// -- Buat elemen item download --
function createItem({ label, badge, desc, url, isPrimary }, idx, videoTitle) {
  if (typeof url !== 'string') return document.createElement('div');

  const cleanUrl = url.split('?')[0];
  const ext      = cleanUrl.split('.').pop().toLowerCase();
  const lower    = label.toLowerCase();
  const isAudio  = ['mp3','aac','ogg','m4a'].includes(ext) || lower.includes('audio');
  const isImage  = ['jpg','jpeg','png','webp','gif'].includes(ext) || lower.includes('gambar') || lower.includes('foto');

  const iconSvg = isAudio
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    : isImage
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

  const dlSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 20h14"/></svg>';

  const fileExt  = isAudio ? 'mp3' : isImage ? (ext || 'jpg') : 'mp4';
  const baseName = sanitizeName(videoTitle || label);
  const uid      = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const filename = `${sanitizeName(baseName)}_${uid}.${fileExt}`;

  const urlEsc   = esc(url);
  const baseEsc  = esc(baseName);
  const extEsc   = esc(fileExt);

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
      data-url="${urlEsc}"
      data-base="${baseEsc}"
      data-ext="${extEsc}"
      onclick="startDownload(event)">
      ${dlSvg}
      Unduh
    </button>
  `;
  return el;
}
// -- Download --
async function startDownload(e) {
  e.preventDefault();
  const btn      = e.currentTarget;
  const url      = btn.dataset.url;
  const baseName = btn.dataset.base || 'video';
  const fileExt  = btn.dataset.ext  || 'mp4';

  if (!url) return;

  const uid      = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const filename = `${sanitizeName(baseName)}_${uid}.${fileExt}`;

  const origHTML = btn.innerHTML;
  btn.disabled   = true;
  btn.innerHTML  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin .7s linear infinite"><path d="M12 2a10 10 0 0 1 10 10"/></svg> Unduh...`;

  // Re-fetch URL segar (semua platform) supaya link tidak expired.
  let finalUrl = url;
  if (_lastSourceUrl && _lastEndpoint) {
    try {
      const res  = await fetch(`${BASE}/${_lastEndpoint}?url=${encodeURIComponent(_lastSourceUrl)}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.status) {
        const fresh = collectItems(data);
        const match = fresh.find(i => i.url && i.url.includes(fileExt === 'mp3' ? 'audio' : 'video'));
        if (match?.url) finalUrl = match.url;
        else if (fresh[0]?.url) finalUrl = fresh[0].url;
      }
    } catch {}
  }

  const cek = checkMediaUrl(finalUrl, _lastSourceUrl);
  if (!cek.ok) {
    log('Unduhan dibatalkan:', cek.reason, '->', finalUrl);
    showNotice('Tautan tidak aman untuk diunduh (bukan file video langsung).', 'error');
    btn.disabled  = false;
    btn.innerHTML = origHTML;
    return;
  }

  const proxyUrl = `/api/download?url=${encodeURIComponent(finalUrl)}&filename=${encodeURIComponent(filename)}&_t=${Date.now()}`;
  const a        = document.createElement('a');
  a.href         = proxyUrl;
  a.download     = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 2000);

  setTimeout(() => {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }, 3000);
}

const forceDownload = (url, label) => {
  const e = { preventDefault: ()=>{}, currentTarget: { dataset: { url, base: label, ext: 'mp4' }, disabled: false, innerHTML: '' } };
  startDownload(e);
};

// -- UI helpers --
function setLoading(on) {
  const btn     = document.getElementById('fetchBtn');
  const spinner = document.getElementById('spinner');
  const icon    = document.getElementById('btnIcon');
  const text    = document.getElementById('btnText');
  btn.disabled          = on;
  spinner.style.display = on ? 'block' : 'none';
  icon.style.display    = on ? 'none'  : 'block';
  text.textContent      = on ? 'Memproses...' : 'Cari';
}

function showNotice(msg, type = 'info') {
  const el = document.getElementById('notice');
  el.textContent   = msg;
  el.className     = `notice ${type}`;
  el.style.display = 'block';
}
function hideNotice() { document.getElementById('notice').style.display = 'none'; }
function hideResult()  { document.getElementById('result').style.display  = 'none'; }

// -- Mobile nav --
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');
if (navToggle && navLinks) {
  const iconMenu  = navToggle.querySelector('.icon-menu');
  const iconClose = navToggle.querySelector('.icon-close');
  const toggleMenu = open => {
    const isOpen = open !== undefined ? open : !navLinks.classList.contains('open');
    navLinks.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
    if (iconMenu && iconClose) {
      iconMenu.style.display  = isOpen ? 'none'  : 'block';
      iconClose.style.display = isOpen ? 'block' : 'none';
    }
  };
  navToggle.addEventListener('click', () => toggleMenu());
  document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => toggleMenu(false)));
  document.addEventListener('click', e => {
    if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) toggleMenu(false);
  });
}

// Quick platform selector dari halaman platform
function selectPlatformQuick(platform) {
  const btn = document.querySelector(`.platform-btn[data-platform="${platform}"]`);
  if (btn) btn.click();
  const input = document.getElementById('urlInput');
  if (input) {
    input.focus();
    document.getElementById('toolWrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
