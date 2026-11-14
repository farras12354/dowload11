const { Readable } = require('stream');

module.exports = async (req, res) => {
  const fileUrl = req.query.url;
  let rawFilename = req.query.filename || 'video.mp4';

  if (!fileUrl) {
    return res.status(400).send('Parameter url wajib diisi.');
  }

  // Pastikan memiliki ekstensi file yang valid
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(rawFilename)) {
    rawFilename += '.mp4';
  }
  const safeAscii = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  try {
    const parsed = new URL(fileUrl);
    // Jangan redirect - tetap stream agar nama file terjaga
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
      // Jika upstream menolak request serverless (contoh: 403), fallback redirect ke URL
      return res.redirect(302, fileUrl);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const responseHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(rawFilename)}`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
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
      try {
        return res.redirect(302, fileUrl);
      } catch (e) {
        return res.status(500).send('Gagal mengunduh: ' + err.message);
      }
    }
  }
};
