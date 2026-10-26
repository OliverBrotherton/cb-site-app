// One app instance per server process, wired to Supabase (or to memory for local testing).
import { makeApp } from './app.js';
import { supabaseStore, memoryStore } from './store.js';

let app, store;
export function getApp() {
  if (!app) {
    const env = process.env;
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) store = supabaseStore(env.SUPABASE_URL.trim(), env.SUPABASE_SERVICE_KEY.trim());
    else if (env.VERCEL) throw Object.assign(new Error('The app isn\'t connected to its database yet. Open /api/health to see which setting is missing.'), { status: 503 });
    else store = memoryStore();
    app = makeApp(store, env);
  }
  return { app, store };
}
export const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
