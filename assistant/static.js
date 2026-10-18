const fs = require('fs');
const path = require('path');

// Fixed whitelist: no user-controlled paths are ever read from disk.
const FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/chat-widget.js': { file: 'chat-widget.js', type: 'text/javascript; charset=utf-8' },
};

function serveStatic(req, res, pathname) {
  const entry = FILES[pathname];
  if (!entry || req.method !== 'GET') return false;
  const body = fs.readFileSync(path.join(__dirname, 'public', entry.file));
  res.writeHead(200, {
    'Content-Type': entry.type,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
  return true;
}

module.exports = { serveStatic };