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
    const setup = !e.status && /Invalid API key|JWT|apikey|does not exist|schema cache|bucket/i.test(e.message || '');
    res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : setup ? 'The app\'s database isn\'t set up right. Open cb-site-app.vercel.app/api/health to see what to fix.' : 'Something went wrong on the server. Try again.' });
  }
}
