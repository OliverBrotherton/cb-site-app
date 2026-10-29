// One app instance per server process, wired to Supabase (or to memory for local testing).
import { makeApp } from './app.js';
import { supabaseStore, memoryStore } from './store.js';

// Accepts the Project URL however it was pasted: with /rest/v1 on the end, or the dashboard address
export function cleanSupabaseUrl(u) {
  u = String(u || '').trim();
  const dash = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  const m = u.match(/([a-z0-9]+)\.supabase\.co/i);
  return m ? `https://${m[1].toLowerCase()}.supabase.co` : u;
}

let app, store;
export function getApp() {
  if (!app) {
    const env = process.env;
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) store = supabaseStore(cleanSupabaseUrl(env.SUPABASE_URL), env.SUPABASE_SERVICE_KEY.trim());
    else if (env.VERCEL) throw Object.assign(new Error('The app isn\'t connected to its database yet. Open /api/health to see which setting is missing.'), { status: 503 });
    else store = memoryStore();
    app = makeApp(store, env);
  }
  return { app, store };
}
// On Vercel, x-real-ip is set by Vercel itself and can't be faked by the caller
export const clientIp = req => String(req.headers['x-real-ip'] || req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
