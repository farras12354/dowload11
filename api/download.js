const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  const fileUrl = req.query.url;
  let rawFilename = req.query.filename || 'video.mp4';

  if (!fileUrl) {
    return res.status(400).send('Parameter url wajib diisi.');
  }

  // Jika tidak ada ekstensi file, tambahkan .mp4 sebagai default
  if (!/\.[a-zA-Z0-9]{2,5}$/.test(rawFilename)) {
    rawFilename += '.mp4';
  }
  const safeAscii = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Jika URL berasal dari savetube / CDN yang sudah memiliki header attachment:
  // Redirect 302 langsung ke CDN agar di-download langsung oleh browser pengguna
  // tanpa melalui batasan waktu dan bandwidth serverless Vercel (krusial untuk video YouTube besar)
  try {
    const parsedTest = new URL(fileUrl);
    if (parsedTest.hostname.includes('savetube.vip') || parsedTest.hostname.includes('savetube.me')) {
      return res.redirect(302, fileUrl);
    }
  } catch (err) {
    return res.status(400).send('URL tidak valid.');
  }

  function fetchStream(url, depth = 0) {
    if (depth > 5) {
      return res.status(500).send('Too many redirects.');
    }

    try {
      const client = url.startsWith('https') ? https : http;
      const parsed = new URL(url);

      const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity'
      };

      if (req.headers.range) {
        requestHeaders['Range'] = req.headers.range;
      }

      const options = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: requestHeaders
      };

      const upstreamReq = client.get(options, (upstreamRes) => {
        if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
          const nextUrl = new URL(upstreamRes.headers.location, url).href;
          return fetchStream(nextUrl, depth + 1);
        }

        const contentType = upstreamRes.headers['content-type'] || 'application/octet-stream';
        const headers = {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(rawFilename)}`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        };

        if (upstreamRes.headers['content-length']) {
          headers['Content-Length'] = upstreamRes.headers['content-length'];
        }
        if (upstreamRes.headers['accept-ranges']) {
          headers['Accept-Ranges'] = upstreamRes.headers['accept-ranges'];
        }
        if (upstreamRes.headers['content-range']) {
          headers['Content-Range'] = upstreamRes.headers['content-range'];
        }

        res.writeHead(upstreamRes.statusCode === 206 ? 206 : 200, headers);
        upstreamRes.pipe(res);
      });

      upstreamReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).send('Gagal mengunduh file: ' + err.message);
        }
      });
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).send('Error: ' + e.message);
      }
    }
  }

  fetchStream(fileUrl);
};
