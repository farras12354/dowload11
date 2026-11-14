const { Readable } = require('stream');

module.exports = async (req, res) => {
  let fileUrl = req.query.url;
  let rawFilename = req.query.filename || 'video.mp4';

  if (!fileUrl) {
    return res.status(400).send('Parameter url wajib diisi.');
  }

  // Jika URL dari Jagoan Project dl-..., ekstrak URL target aslinya dari base64 token
  // agar tidak terkena 502 Bad Gateway dari server Jagoan
  if (fileUrl.includes('api.jagoanproject.com/api/dl-')) {
    try {
      const match = fileUrl.match(/\/api\/dl-(?:I)?([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        let b64 = match[1];
        if (b64.length > 32) b64 = b64.slice(0, -32);
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const parsedJson = JSON.parse(decoded);
        if (parsedJson && parsedJson.u) {
          fileUrl = parsedJson.u;
        }
      }
    } catch (e) {
      // Jika decode gagal, lanjutkan dengan fileUrl yang ada
    }
  }

  // Pastikan memiliki ekstensi file yang valid
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(rawFilename)) {
    rawFilename += '.mp4';
  }
  const safeAscii = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  try {
    new URL(fileUrl);
  } catch (err) {
    return res.status(400).send('URL tidak valid.');
  }

  try {
    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const upstreamRes = await fetch(fileUrl, {
      headers: requestHeaders,
      redirect: 'follow'
    });

    if (!upstreamRes.ok && upstreamRes.status >= 400) {
      return res.status(upstreamRes.status).send('Server asal menolak unduhan atau tautan kadaluarsa.');
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const responseHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(rawFilename)}`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };

    if (upstreamRes.headers.has('content-length')) {
      responseHeaders['Content-Length'] = upstreamRes.headers.get('content-length');
    }
    if (upstreamRes.headers.has('accept-ranges')) {
      responseHeaders['Accept-Ranges'] = upstreamRes.headers.get('accept-ranges');
    }
    if (upstreamRes.headers.has('content-range')) {
      responseHeaders['Content-Range'] = upstreamRes.headers.get('content-range');
    }

    res.writeHead(upstreamRes.status === 206 ? 206 : 200, responseHeaders);
    Readable.fromWeb(upstreamRes.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).send('Gagal mengunduh file: ' + err.message);
    }
  }
};
