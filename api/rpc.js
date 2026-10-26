import { getApp, clientIp } from '../lib/instance.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const data = await getApp().app.rpc(body, req.headers, clientIp(req));
    res.status(200).json({ ok: true, data });
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Something went wrong on the server. Try again.' });
  }
}
