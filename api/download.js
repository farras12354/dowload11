const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  const fileUrl = req.query.url;
  const rawFilename = req.query.filename || 'video.mp4';
  const safeAscii = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!fileUrl) {
    return res.status(400).send('Parameter url wajib diisi.');
  }

  function fetchStream(url, depth = 0) {
    if (depth > 5) {
      return res.status(500).send('Too many redirects.');
    }

    try {
      const client = url.startsWith('https') ? https : http;
      const parsed = new URL(url);

      const options = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'identity'
        }
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
          'Access-Control-Allow-Origin': '*'
        };

        if (upstreamRes.headers['content-length']) {
          headers['Content-Length'] = upstreamRes.headers['content-length'];
        }

        res.writeHead(200, headers);
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
