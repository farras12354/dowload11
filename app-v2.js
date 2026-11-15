/* ============================================================
   Zhafdor — app-v2.js (DITULIS ULANG / DIBERSIHKAN)
   ============================================================
   MASALAH UTAMA (video tiba-tiba "hilang" saat URL sama):
   1. collectItems sebelumnya menerima d.url / d.download,
      yang justru bisa berisi URL halaman ASLI (misal
      tiktok.com/...), bukan file video. Saat diklik, proxy
      /api/download mengambil HTML halaman sosial bukan video.
   2. URL media dari API kadaluarsa cepat. Kalau tombol
      unduhan diklik beberapa saat setelah hasil muncul, link
      sudah mati ? video "ilang"/unduhan gagal.
   3. Tidak ada debug, jadi susah diketahui penyebabnya.

   PERBAIKAN DI VERSI INI:
   - checkMediaUrl() memvalidasi SETIAP URL sebelum ditawarkan
     sebagai unduhan, dan mencatat alasan terima/tolak ke console.
   - URL sumber asli & halaman media sosial DITOLAK sebagai file unduhan.
   - Sebelum unduh, selalu diambil URL SEGAR dari API
     (cache-busting _t + cache: 'no-store') untuk SEMUA platform.
   - DEBUG = true ? lihat langkah demi langkah di F12 ? Console.
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
let _lastItems     = [];
const _downloadHistory = new Set();
let _repeatCount = 0;
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

  setLoading(true, 'Memproses...');
  hideResult();
  hideNotice();

  const { endpoint, label } = PLATFORM_MAP[activePlatform];
  _lastSourceUrl = inputVal;
  _lastEndpoint  = endpoint;
  _lastItems     = [];

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
    renderResult(data, label, inputVal, endpoint);
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
function renderResult(data, platformLabel, sourceUrl, endpoint) {
  _lastSourceUrl = sourceUrl || '';
  _lastEndpoint  = endpoint  || '';

  const thumbWrap = document.getElementById('thumbWrap');
  const thumb = data.thumbnail || data.thumb || data.cover
    || data.data?.thumbnail || data.data?.thumb || data.data?.cover
    || data.data?.files?.[0]?.thumbnail
    || data.result?.media?.thumbnail
    || data.result?.media?.thumbnails?.[0]?.url;

  if (thumb) {
    thumbWrap.innerHTML = `<img class="result-thumb" src="${esc(thumb)}" alt="Thumbnail" onerror="this.style.display='none'" />`;
  } else {
    thumbWrap.innerHTML = `
      <div class="result-thumb-placeholder">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7a879a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 10 6 4-6 4V10z"/>
        </svg>
      </div>`;
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

  const items = collectDownloadItems(data, title);
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
    items.forEach((item, idx) => list.appendChild(createDownloadItem(item, idx)));
  }

  document.getElementById('result').style.display = 'block';
  document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// -- Kumpulkan item download (dengan validasi checkMediaUrl) --
function collectDownloadItems(data, videoTitle) {
  const items = [];
  const d     = data.data || data;
  const cleanTitle = sanitizeName(videoTitle || 'video');

  const push = (label, badge, desc, url, isPrimary = false, filename = null) => {
    if (typeof url !== 'string' || !url.startsWith('http')) return;
    const v = checkMediaUrl(url, _lastSourceUrl);
    if (!v.ok) {
      log('Ditolak [' + label + ']:', v.reason, '->', url);
      return;
    }
    items.push({ label, badge, desc, url, isPrimary, filename: filename || uniqueName(cleanTitle, 'mp4') });
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

  push('Video HD',      'HD',     'Kualitas terbaik',   d.video_hd || d.videoHd || d.hd,                      items.length === 0, `${cleanTitle}_HD.mp4`);
  push('Video standar', 'MP4',    'Kualitas standar',   d.video || d.video_url || d.videoUrl || d.download, items.length === 0, `${cleanTitle}.mp4`);
  push('Video SD',      'SD',     'Ukuran lebih hemat', d.video_sd || d.videoSd || d.sd, false, `${cleanTitle}_SD.mp4`);
  push('Audio',         'MP3',    'Hanya suara',        d.audio || d.audio_url || d.musicUrl || d.mp3, false, `${cleanTitle}.mp3`);
  push('Foto',          'Gambar', 'Kualitas asli',      d.image || d.photo || d.img, false, `${cleanTitle}.jpg`);

  if (Array.isArray(d.qualities))  d.qualities.forEach((q, i) => push(q.label || q.quality || 'Video', 'MP4', q.size || '', q.url || q.link, i === 0));
  if (Array.isArray(d.formats))    d.formats.forEach((f, i) => push(f.label || f.format || f.quality || 'Video', 'MP4', f.size || '', f.url || f.link, i === 0));
  if (Array.isArray(d.links))      d.links.forEach((l, i) => push(l.label || l.type || 'Unduhan', 'Tautan', l.quality || '', l.url || l.link, i === 0));
  if (Array.isArray(d.images))     d.images.forEach((img, i) => {
    const u = typeof img === 'string' ? img : (img?.url || img?.src);
    push(`Gambar ${i + 1}`, 'JPG', 'Resolusi penuh', u, false, `${cleanTitle}_${i + 1}.jpg`);
  });

  if (items.length === 0) {
    Object.entries(d).forEach(([k, v]) => {
      if (typeof v === 'string' && v.startsWith('http') &&
        (v.includes('.mp4') || v.includes('.mp3') || v.includes('.jpg') || v.includes('.jpeg') || v.includes('.png') || v.includes('.webm'))) {
        push('File unduhan', 'Langsung', '', v, false);
      }
    });
  }

  return items;
}

// -- Buat elemen item download --
function createDownloadItem({ label, badge, desc, url, isPrimary, filename }, itemIdx) {
  if (typeof url !== 'string') return document.createElement('div');
  const cleanUrl = url.split('?')[0];
  const ext = cleanUrl.split('.').pop().toLowerCase();
  const lower = label.toLowerCase();
  const isAudio = ['mp3', 'aac', 'ogg', 'm4a'].includes(ext) || lower.includes('audio') || lower.includes('musik');
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) || lower.includes('gambar') || lower.includes('foto');

  const iconSvg = isAudio
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    : isImage
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

  const dlSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 20h14"/></svg>';

  const chosenFilename = filename || (label ? `${label}.mp4` : 'video.mp4');

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
    <button class="btn-dl ${isPrimary ? 'primary-btn' : ''}" onclick="startDownload(event, ${itemIdx}, '${esc(chosenFilename)}')">
      ${dlSvg}
      Unduh
    </button>
  `;
  return el;
}
function setLoading(on, customText = 'Memproses...') {
  const btn     = document.getElementById('fetchBtn');
  const spinner = document.getElementById('spinner');
  const icon    = document.getElementById('btnIcon');
  const text    = document.getElementById('btnText');
  btn.disabled          = on;
  spinner.style.display = on ? 'block' : 'none';
  icon.style.display    = on ? 'none'  : 'block';
  text.textContent      = on ? customText : 'Cari';
}

function showNotice(msg, type = 'info') {
  const el = document.getElementById('notice');
  el.textContent   = msg;
  el.className     = `notice ${type}`;
  el.style.display = 'block';
}
function hideNotice() { document.getElementById('notice').style.display = 'none'; }
function hideResult()  { document.getElementById('result').style.display  = 'none'; }

function triggerDownload(targetUrl, filename) {
  try {
    let iframe = document.getElementById('dlFrame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'dlFrame';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
    }
    iframe.src = targetUrl;
  } catch (err) {
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = filename || 'video.mp4';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); } catch (e) {} }, 2000);
  }
}

// Modal konfirmasi unduh ulang
function showDownloadAgainModal(videoTitle, onConfirm) {
  const existingModal = document.getElementById('dlConfirmModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'dlConfirmModal';
  modal.style.cssText = `position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: dlModalFadeIn 0.2s ease-out;`;

  const safeTitle = (videoTitle || 'Video ini').length > 40 ? (videoTitle || 'Video ini').slice(0, 40) + '...' : (videoTitle || 'Video ini');

  modal.innerHTML = `
    <div style="background: #111827; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; max-width: 400px; width: 100%; padding: 26px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); text-align: center; color: #fff; font-family: inherit;">
      <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: #818cf8; display: grid; place-items: center; margin: 0 auto 16px;">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 20h14"/></svg>
      </div>
      <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; color: #f3f4f6;">Unduh Video Lagi?</h3>
      <p style="font-size: 0.9rem; color: #9ca3af; line-height: 1.5; margin-bottom: 22px;">
        <strong>"${esc(safeTitle)}"</strong> sudah pernah Anda unduh. Apakah Anda ingin mengunduhnya lagi?
      </p>
      <div style="display: flex; gap: 10px;">
        <button id="dlModalCancelBtn" style="flex: 1; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.05); color: #d1d5db; font-size: 0.9rem; font-weight: 600; cursor: pointer;">Batal</button>
        <button id="dlModalConfirmBtn" style="flex: 1; padding: 12px 16px; border-radius: 12px; border: none; background: #4f46e5; color: #fff; font-size: 0.9rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">Unduh Lagi</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.15s ease-out';
    setTimeout(() => modal.remove(), 150);
  };

  modal.querySelector('#dlModalCancelBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modal.querySelector('#dlModalConfirmBtn').addEventListener('click', () => { closeModal(); if (typeof onConfirm === 'function') onConfirm(); });
}

async function startDownload(e, itemIdx, filename) {
  if (e && e.preventDefault) e.preventDefault();

  const itemKey = `${_lastSourceUrl || ''}_${itemIdx}`;

  if (_downloadHistory.has(itemKey)) {
    const videoTitle = document.getElementById('resultTitle')?.textContent || filename || '';
    showDownloadAgainModal(videoTitle, () => {
      _repeatCount++;
      executeDownload(e, itemIdx, filename, true);
    });
    return;
  }

  _downloadHistory.add(itemKey);
  executeDownload(e, itemIdx, filename, false);
}

async function executeDownload(e, itemIdx, filename, isRepeat = false) {
  const btn = e ? (e.currentTarget || (e.target && e.target.closest('button'))) : null;
  let originalHtml = '';
  if (btn) {
    originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '0.9';
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite; display: inline-block;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg> Mengunduh...`;
  }

  // AMBIL URL SEGAR dari API (semua platform) supaya link tidak expired.
  let url = (_lastItems[itemIdx] || {}).url || '';
  if (_lastSourceUrl && _lastEndpoint) {
    try {
      showNotice('Menyiapkan tautan segar...', 'info');
      const res = await fetch(`${BASE}/${_lastEndpoint}?url=${encodeURIComponent(_lastSourceUrl)}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.status) {
        const currentTitle = document.getElementById('resultTitle')?.textContent || '';
        const freshItems = collectDownloadItems(data, currentTitle);
        if (freshItems[itemIdx] && freshItems[itemIdx].url) {
          url = freshItems[itemIdx].url;
          _lastItems = freshItems;
        }
      }
    } catch (err) {
      console.warn('Re-fetch gagal, pakai URL lama:', err);
    }
  }

  if (!url || !url.startsWith('http')) {
    showNotice('Tautan unduhan tidak valid.', 'error');
    if (btn && originalHtml) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = originalHtml; }
    return;
  }

  // Validasi akhir sebelum unduh
  const cek = checkMediaUrl(url, _lastSourceUrl);
  if (!cek.ok) {
    log('Unduhan dibatalkan:', cek.reason, '->', url);
    showNotice('Tautan tidak aman untuk diunduh (bukan file video langsung).', 'error');
    if (btn && originalHtml) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = originalHtml; }
    return;
  }

  let safeName = String(filename || 'video.mp4').trim();
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(safeName)) safeName += '.mp4';
  const extMatch = safeName.match(/(\.[a-zA-Z0-9]{2,5})$/);
  if (extMatch) {
    const ext = extMatch[1];
    if (isRepeat) {
      safeName = safeName.replace(ext, `_salinan(${_repeatCount})${ext}`);
    } else {
      const ts = Date.now().toString().slice(-4);
      safeName = safeName.replace(ext, `_${ts}${ext}`);
    }
  }

  showNotice(isRepeat ? 'Mengunduh salinan video ke HP...' : 'Mengunduh video ke HP...', 'info');

  const dlUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}&download_id=${Date.now()}`;
  triggerDownload(dlUrl, safeName);
  showNotice('Unduhan dimulai! File otomatis tersimpan di galeri HP.', 'info');

  setTimeout(() => {
    if (btn && originalHtml) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = originalHtml;
    }
    hideNotice();
  }, 4000);
}

const forceDownload = (url, label) => startDownload(null, url, label);
// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');
if (navToggle && navLinks) {
  const iconMenu  = navToggle.querySelector('.icon-menu');
  const iconClose = navToggle.querySelector('.icon-close');

  const toggleMenu = (open) => {
    const isOpen = open !== undefined ? open : !navLinks.classList.contains('open');
    navLinks.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
    if (iconMenu && iconClose) {
      iconMenu.style.display  = isOpen ? 'none'  : 'block';
      iconClose.style.display = isOpen ? 'block' : 'none';
    }
  };

  navToggle.addEventListener('click', () => toggleMenu());
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => toggleMenu(false));
  });
  document.addEventListener('click', e => {
    if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) {
      toggleMenu(false);
    }
  });
}
