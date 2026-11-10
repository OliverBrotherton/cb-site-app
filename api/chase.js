// Called by Vercel's scheduler every weekday morning (see "crons" in vercel.json).
import { getApp } from '../lib/instance.js';
import { runChase } from '../lib/chase.js';
import { safeEqual } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  if (!secret || !safeEqual(auth, 'Bearer ' + secret)) return res.status(401).json({ ok: false, error: 'Not allowed' });
  try { res.status(200).json({ ok: true, ...(await runChase(getApp().store, process.env)) }); }
  catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Chase run failed' }); }
}
