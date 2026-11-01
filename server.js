const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname);
const PORT = 3000;
const REMOTE_HOST = 'studio.viding.co';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.webp': 'image/webp',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

function serveFile(filePath, res) {
  return new Promise((resolve) => {
    fs.readFile(filePath, (err, data) => {
      if (err) return resolve(false);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const isHtml = ext === '.html';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600',
        'Pragma': isHtml ? 'no-cache' : 'public',
        'Expires': isHtml ? '0' : '3600',
      });
      res.end(data);
      resolve(true);
    });
  });
}

function proxyToRemote(req, res, targetHost) {
  const host = targetHost || REMOTE_HOST;
  console.log(`[PROXY -> ${host}] ${req.url}`);

  const headers = {
    ...req.headers,
    host: host,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const options = {
    hostname: host,
    port: 443,
    path: req.url,
    method: req.method,
    headers: headers,
    timeout: 15000,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const resHeaders = {
      ...proxyRes.headers,
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    };
    delete resHeaders['content-security-policy'];
    delete resHeaders['content-security-policy-report-only'];

    res.writeHead(proxyRes.statusCode, resHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[PROXY ERROR] ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('502 Bad Gateway: ' + err.message);
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('504 Gateway Timeout');
    }
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

  // Intercept Next.js images for custom wedding photos
  if (pathname.startsWith('/_next/image')) {
    const parsedQuery = url.parse(req.url, true).query;
    const imgUrl = decodeURIComponent(parsedQuery.url || '');
    
    // Groom photo
    if (imgUrl.includes('Soft-Pink-1') || imgUrl.includes('112816') || imgUrl.includes('112812')) {
      console.log('[CUSTOM IMAGE SERVED] foto_lakilaki.jpg');
      return await serveFile(path.join(ROOT, 'foto_lakilaki.jpg'), res);
    }
    // Bride photo
    if (imgUrl.includes('Soft-Pink-2') || imgUrl.includes('112819') || imgUrl.includes('112813')) {
      console.log('[CUSTOM IMAGE SERVED] foto_perempuan.jpg');
      return await serveFile(path.join(ROOT, 'foto_perempuan.jpg'), res);
    }
    // Couple / Thank You photo
    if (imgUrl.includes('Soft-Pink-3') || imgUrl.includes('112823') || imgUrl.includes('112814')) {
      console.log('[CUSTOM IMAGE SERVED] foto1.jpg (Thank You photo)');
      return await serveFile(path.join(ROOT, 'foto1.jpg'), res);
    }
    // Gallery photo 1
    if (imgUrl.includes('a2221239') || imgUrl.includes('4044ab39') || imgUrl.includes('image_621549')) {
      console.log('[CUSTOM IMAGE SERVED] foto1.jpg (Gallery 1)');
      return await serveFile(path.join(ROOT, 'foto1.jpg'), res);
    }
    // Gallery photo 2
    if (imgUrl.includes('a2221236') || imgUrl.includes('image_7a96f8')) {
      console.log('[CUSTOM IMAGE SERVED] foto2.jpg (Gallery 2)');
      return await serveFile(path.join(ROOT, 'foto2.jpg'), res);
    }
    // Gallery photo 3
    if (imgUrl.includes('a2221233') || imgUrl.includes('image_2247dd')) {
      console.log('[CUSTOM IMAGE SERVED] foto3.jpg (Gallery 3)');
      return await serveFile(path.join(ROOT, 'foto3.jpg'), res);
    }
  }

  // Force proxy for dynamic endpoints
  if (pathname.startsWith('/api/') || pathname.startsWith('/build/')) {
    return proxyToRemote(req, res);
  }

  // Check local file
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (_) {}

  // Root path -> index.html
  if (decodedPath === '/' || decodedPath === '') {
    const indexPath = path.join(ROOT, 'index.html');
    console.log(`[LOCAL] /index.html`);
    return await serveFile(indexPath, res);
  }

  // Look for file directly or in assets
  const candidatePaths = [
    path.join(ROOT, decodedPath),
    path.join(ROOT, 'assets', decodedPath),
    path.join(ROOT, 'assets/other', decodedPath),
    path.join(ROOT, 'assets/js', decodedPath),
    path.join(ROOT, 'assets/css', decodedPath),
  ];

  for (const p of candidatePaths) {
    if (p.startsWith(ROOT) && fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        if (stat.isFile()) {
          console.log(`[LOCAL] ${decodedPath}`);
          const served = await serveFile(p, res);
          if (served) return;
        }
      } catch (_) {}
    }
  }

  // Fallback: proxy to remote
  proxyToRemote(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
