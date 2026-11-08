module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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

  try {
    const apiUrl = `https://api.jagoanproject.com/api/downloader/${endpoint}?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': 'Bearer jg_5aX1pnEz6zdGt2iCsliExJlX',
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
