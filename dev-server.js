// Local test server: serves public/ and the two API functions, with data kept in memory.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import rpc from './api/rpc.js';
import photo from './api/photo.js';

process.env.ADMIN_PIN ||= '999999';
process.env.SESSION_SECRET ||= 'local-dev-secret-local-dev-secret-0123';
process.env.EMAIL_MODE ||= 'log';
const PORT = Number(process.env.PORT || 3000);
process.env.APP_URL ||= `http://localhost:${PORT}`;
const HEADERS = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers[0].headers;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function wrap(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  return res;
}
http.createServer(async (req, res) => {
  for (const h of HEADERS) res.setHeader(h.key, h.value.replace('https://*.supabase.co', "https://*.supabase.co 'self'"));
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/rpc') {
    let raw = ''; for await (const ch of req) raw += ch;
    try { req.body = JSON.parse(raw || '{}'); } catch { req.body = {}; }
    return rpc(req, wrap(res));
  }
  if (url.pathname === '/api/photo') return photo(req, wrap(res));
  if (url.pathname === '/__emails') { const { sentLog } = await import('./lib/email.js'); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(sentLog.map(m => ({ to: m.to, cc: m.cc, subject: m.subject, attachments: (m.attachments || []).length, text: m.text })))); }
  const file = path.join('public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(buf);
  });
}).listen(PORT, () => console.log(`Site App running at http://localhost:${PORT}  (admin PIN ${process.env.ADMIN_PIN})`));
