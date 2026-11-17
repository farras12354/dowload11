const ALLOWED_ORIGINS = [
  'https://zhaffdownloader.web.id',
  'https://www.zhaffdownloader.web.id'
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Permintaan langsung dari browser (same-origin / direct address bar)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true; // Preview Vercel
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  return false;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';

  // Validasi dan set CORS
  if (isOriginAllowed(origin)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'https://zhaffdownloader.web.id');
    }
  } else {
    // Blokir jika domain luar mencoba menyedot API Anda
    return res.status(403).json({
      status: false,
      message: 'Akses ditolak: Permintaan lintas domain (CORS) tidak diizinkan.'
    });
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const endpoint = req.query.endpoint || req.query.slug;
  const targetUrl = req.query.url;

  if (!endpoint || !targetUrl) {
    return res.status(400).json({ status: false, message: 'Parameter endpoint dan url wajib diisi.' });
  }

  // Baca API Key rahasia secara aman dari Environment Variables Vercel
  const apiKey = process.env.JAGOAN_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      status: false,
      message: 'Konfigurasi server belum lengkap: JAGOAN_API_KEY belum disetel di Vercel Environment Variables.'
    });
  }

  try {
    const apiUrl = `https://api.jagoanproject.com/api/downloader/${endpoint}?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message || 'Gagal menghubungi server API Jagoan Project.'
    });
  }
};
