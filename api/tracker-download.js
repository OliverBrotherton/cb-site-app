// A project's works tracker spreadsheet, filled in with live data from the app.
import { getApp } from '../lib/instance.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { app } = getApp();
    const { buffer, filename } = await app.trackerFile(String(body.project_id || ''), req.headers);
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename.replace(/[^\w .&()-]+/g, '')}"`, 'Cache-Control': 'no-store' });
    res.end(buffer);
  } catch (e) {
    if (!e.status) console.error(e);
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.status ? e.message : 'The tracker couldn\'t be made. Try again.' }));
  }
}
