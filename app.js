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

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Platform tab switching
document.querySelectorAll('.platform-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePlatform = btn.dataset.platform;
    const hints = {
      tiktok:    'https://www.tiktok.com/@user/video/...',
      instagram: 'https://www.instagram.com/p/... atau /reel/...',
      youtube:   'https://www.youtube.com/watch?v=...',
      twitter:   'https://twitter.com/user/status/...',
      facebook:  'https://www.facebook.com/watch?v=...',
      threads:   'https://www.threads.net/@user/post/...',
      pinterest: 'https://www.pinterest.com/pin/...',
    };
    document.getElementById('urlInput').placeholder = hints[activePlatform] || 'Tempel tautan video...';
    hideResult();
    hideNotice();
  });
});

// Auto-detect platform dari URL yang di-paste
document.getElementById('urlInput').addEventListener('paste', e => {
  setTimeout(() => {
    const val = e.target.value;
    const map = {
      'tiktok.com': 'tiktok', 'instagram.com': 'instagram',
      'youtube.com': 'youtube', 'youtu.be': 'youtube',
      'twitter.com': 'twitter', 'x.com': 'twitter',
      'facebook.com': 'facebook', 'fb.watch': 'facebook',
      'threads.net': 'threads',
      'pinterest.com': 'pinterest', 'pin.it': 'pinterest',
    };
    for (const [host, platform] of Object.entries(map)) {
      if (val.includes(host)) {
        document.querySelectorAll('.platform-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.platform === platform);
        });
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

  // Auto-detect platform dari URL
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
  } catch(e) {}

  setLoading(true, 'Memproses...');
  hideResult();
  hideNotice();

  const { endpoint, label } = PLATFORM_MAP[activePlatform];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${BASE}/${endpoint}?url=${encodeURIComponent(inputVal)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await res.json();

    if (!data.status) {
      showNotice(data.message || 'Gagal memproses tautan. Pastikan link valid dan video bersifat publik.', 'error');
      return;
    }

    renderResult(data, label, inputVal, endpoint);

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      showNotice('Permintaan melebihi batas waktu. Coba lagi.', 'error');
    } else {
      showNotice('Gagal terhubung ke server. Coba lagi.', 'error');
    }
    console.error(err);
  } finally {
    setLoading(false);
  }
}

function renderResult(data, platformLabel, sourceUrl, endpoint) {
  _lastSourceUrl = sourceUrl || '';
  _lastEndpoint  = endpoint  || '';

  // Thumbnail
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

  // Title & author
  const title = data.title || data.data?.title || data.caption || data.data?.caption
    || data.result?.metadata?.caption || 'Video';
  let author = data.author || data.data?.author || data.uploader || data.data?.uploader
    || data.result?.author?.username || data.result?.author?.fullName || '';
  if (typeof author === 'object' && author !== null) {
    author = author.nickname || author.username || author.name || '';
  }
  document.getElementById('resultTitle').textContent     = title;
  document.getElementById('resultAuthor').textContent    = author ? `@${String(author).replace(/^@/, '')}` : platformLabel;
  document.getElementById('resultPlatform').textContent  = platformLabel;

  const items = collectDownloadItems(data, title);

  // Video preview
  const d = data.data || data;
  let previewVideoUrl = '';
  if (Array.isArray(d.downloads) && d.downloads[0]?.sourceUrl) {
    previewVideoUrl = d.downloads[0].sourceUrl;
  }
  if (!previewVideoUrl) {
    previewVideoUrl = d.play || d.video || d.videoUrl || d.video_url || d.media?.videos?.[0]?.url || '';
  }
  if (!previewVideoUrl) {
    const fi = items.find(i => typeof i.url === 'string' && (i.url.includes('.mp4') || i.label.toLowerCase().includes('video')));
    if (fi) previewVideoUrl = fi.url;
  }

  const videoWrap = document.getElementById('videoWrap');
  if (previewVideoUrl) {
    videoWrap.style.display = 'block';
    videoWrap.innerHTML = `
      <video class="video-preview" controls playsinline preload="metadata" referrerpolicy="no-referrer">
        <source src="${esc(previewVideoUrl)}" type="video/mp4">
      </video>`;
  } else {
    videoWrap.style.display = 'none';
    videoWrap.innerHTML = '';
  }

  // Download list
  const list = document.getElementById('downloadList');
  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML = `<p style="color:var(--ink2);font-size:0.875rem;text-align:center;padding:20px 0">Tidak ada tautan unduhan yang ditemukan.</p>`;
  } else {
    items.forEach(item => list.appendChild(createDownloadItem(item)));
  }

  document.getElementById('result').style.display = 'block';
  document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function collectDownloadItems(data, videoTitle = '') {
  const items = [];
  const d = data.data || data;

  const sanitizeName = s => String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  const cleanTitle = sanitizeName(videoTitle || d.title || 'video');

  const push = (label, badge, desc, url, isPrimary = false, customFilename = '') => {
    if (typeof url === 'string' && url.startsWith('http')) {
      const cleanUrl = url.split('?')[0];
      const urlExt = cleanUrl.split('.').pop().toLowerCase();
      const isAudio = badge === 'MP3' || label.toLowerCase().includes('audio') || label.toLowerCase().includes('musik');
      const ext = ['mp4', 'mp3', 'm4a', 'jpg', 'jpeg', 'png', 'webp'].includes(urlExt)
        ? urlExt
        : (isAudio ? 'mp3' : 'mp4');

      const filename = customFilename || (cleanTitle ? `${cleanTitle} - ${label}.${ext}` : `video.${ext}`);
      items.push({ label, badge, desc, url, isPrimary, filename });
    }
  };

  // YouTube
  if (Array.isArray(d.files)) {
    d.files.forEach((f, i) => {
      const isAud = f.contentType?.includes('audio') || (f.quality && f.quality.toLowerCase().includes('audio'));
      const badge = isAud ? 'MP3' : 'MP4';
      const label = f.quality || `Video ${i+1}`;
      const ext = isAud ? 'mp3' : 'mp4';
      const filename = f.filename ? sanitizeName(f.filename) : `${cleanTitle} - ${label}.${ext}`;
      push(label, badge, f.filename || '', f.url, i === 0, filename);
    });
  }

  // TikTok — hanya pakai dl.url (signed download), jangan sourceUrl (CDN streaming)
  if (Array.isArray(d.downloads)) {
    const dl = d.downloads[0];
    if (dl) {
      const primaryUrl = dl.url;
      if (primaryUrl) push('Video HD', 'Tanpa watermark', 'Kualitas terbaik tanpa watermark', primaryUrl, true, `${cleanTitle}.mp4`);
    }
  }

  // Instagram
  const media = d.media || d.result?.media;
  if (media && Array.isArray(media.videos)) {
    media.videos.forEach((v, i) => {
      push(`Video ${media.videos.length > 1 ? i + 1 : ''}`.trim(), 'MP4', v.resolution || 'Kualitas asli', v.url, i === 0, `${cleanTitle}${media.videos.length > 1 ? '_' + (i+1) : ''}.mp4`);
    });
  }

  const meta = d.result?.metadata || d.metadata;
  if (meta && !media) {
    push('Video', 'MP4', 'Kualitas asli', meta.videoUrl || meta.video_url, true, `${cleanTitle}.mp4`);
  }

  push('Video HD',      'HD',     'Kualitas terbaik',   d.video_hd || d.videoHd || d.hd, items.length === 0, `${cleanTitle}_HD.mp4`);
  push('Video standar', 'MP4',    'Kualitas standar',   d.video || d.video_url || d.videoUrl || d.download || d.url, items.length === 0, `${cleanTitle}.mp4`);
  push('Video SD',      'SD',     'Ukuran lebih hemat', d.video_sd || d.videoSd || d.sd, false, `${cleanTitle}_SD.mp4`);
  push('Audio',         'MP3',    'Hanya suara',        d.audio || d.audio_url || d.musicUrl || d.mp3, false, `${cleanTitle}.mp3`);
  push('Foto',          'Gambar', 'Kualitas asli',      d.image || d.photo || d.img, false, `${cleanTitle}.jpg`);

  if (Array.isArray(d.qualities)) {
    d.qualities.forEach((q, i) => push(q.label || q.quality || 'Video', 'MP4', q.size || '', q.url || q.link, i === 0));
  }
  if (Array.isArray(d.formats)) {
    d.formats.forEach((f, i) => push(f.label || f.format || f.quality || 'Video', 'MP4', f.size || '', f.url || f.link, i === 0));
  }
  if (Array.isArray(d.links)) {
    d.links.forEach((l, i) => push(l.label || l.type || 'Unduhan', 'Tautan', l.quality || '', l.url || l.link, i === 0));
  }
  if (Array.isArray(d.images)) {
    d.images.forEach((img, i) => {
      const u = typeof img === 'string' ? img : (img?.url || img?.src);
      push(`Gambar ${i + 1}`, 'JPG', 'Resolusi penuh', u, false, `${cleanTitle}_${i + 1}.jpg`);
    });
  }

  // Fallback
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

function createDownloadItem({ label, badge, desc, url, isPrimary, filename }) {
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
    <button class="btn-dl ${isPrimary ? 'primary-btn' : ''}" onclick="startDownload(event, '${esc(url)}', '${esc(chosenFilename)}')">
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

function startDownload(e, url, filename) {
  if (e && e.preventDefault) e.preventDefault();

  if (!url || !url.startsWith('http')) {
    showNotice('Tautan unduhan tidak valid.', 'error');
    return;
  }

  let safeName = String(filename || 'video.mp4').trim();
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(safeName)) {
    safeName += '.mp4';
  }

  showNotice('Memulai unduhan...', 'info');

  try {
    // 1. Jika URL berasal dari savetube (YouTube) atau CDN yang sudah memiliki header attachment:
    // Browser langsung men-download dari CDN tanpa lewat serverless Vercel.
    // Ini krusial untuk file video besar (100MB - 1GB+) agar tidak terkena timeout 10-15s Vercel.
    if (url.includes('savetube.vip') || url.includes('savetube.me')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(hideNotice, 2500);
      return;
    }

    // 2. Untuk URL lain gunakan streaming proxy /api/download
    const dlUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}`;
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error(err);
    showNotice('Gagal memulai unduhan.', 'error');
  }

  setTimeout(hideNotice, 2500);
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
