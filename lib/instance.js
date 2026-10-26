// One app instance per server process, wired to Supabase (or to memory for local testing).
import { makeApp } from './app.js';
import { supabaseStore, memoryStore } from './store.js';

let app, store;
export function getApp() {
  if (!app) {
    const env = process.env;
    store = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY) : memoryStore();
    app = makeApp(store, env);
  }
  return { app, store };
}
export const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
