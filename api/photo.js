import { getApp } from '../lib/instance.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  try {
    const { app, store } = getApp();
    const path = await app.photo(url.searchParams.get('p'), url.searchParams.get('s'));
    if (store.photoUrl) { res.setHeader('Cache-Control', 'private, max-age=3000'); res.writeHead(302, { Location: await store.photoUrl(path) }); return res.end(); }
    const ph = await store.getPhoto(path);
    res.writeHead(200, { 'Content-Type': ph.type, 'Cache-Control': 'private, max-age=86400' }); res.end(ph.buffer);
  } catch (e) {
    res.writeHead(e.status || 404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  }
}
