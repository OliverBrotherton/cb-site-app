// Setup check: open /api/health to see which settings are missing. Shows yes/no only, never the secret values.
import { getApp, cleanSupabaseUrl } from '../lib/instance.js';
import { emailMethod } from '../lib/email.js';

function keyType(k) {
  if (!k) return 'missing';
  if (k.startsWith('sb_secret_')) return 'secret key (correct)';
  if (k.startsWith('sb_publishable_')) return 'WRONG: this is the publishable key, use the secret / service_role key';
  try {
    const role = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role;
    return role === 'service_role' ? 'service_role key (correct)' : `WRONG: this is the "${role}" key, use the service_role key`;
  } catch { return 'WRONG: not a Supabase key (check for spaces or a partial copy)'; }
}

export default async function handler(req, res) {
  const env = process.env;
  const out = {
    ADMIN_PIN: /^\d{6,}$/.test(env.ADMIN_PIN || '') ? 'set' : env.ADMIN_PIN ? 'WRONG: must be 6 or more numbers only' : 'missing',
    SESSION_SECRET: (env.SESSION_SECRET || '').length >= 32 ? 'set' : env.SESSION_SECRET ? 'WRONG: too short' : 'missing',
    APP_URL: env.APP_URL ? (/^https:\/\//.test(env.APP_URL) ? env.APP_URL : 'WRONG: must start with https://') : 'missing',
    SUPABASE_URL: env.SUPABASE_URL ? (/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cleanSupabaseUrl(env.SUPABASE_URL)) ? 'set' : 'WRONG: should look like https://abcdefgh.supabase.co (Supabase > Project Settings > Data API > Project URL)') : 'missing',
    SUPABASE_SERVICE_KEY: keyType((env.SUPABASE_SERVICE_KEY || '').trim()),
    database: 'not checked', photo_storage: 'not checked',
    email: emailMethod(env) ? `set up (${emailMethod(env)})` : 'not set up yet (snags show "Not emailed" until it is)',
  };
  // Which Microsoft 365 email settings this deployment can see (yes/no only)
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const seen = k => (env[k] || '').trim();
  const similar = Object.keys(env).filter(k => /^(MS|MAIL|SMTP)_/i.test(k) && !['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].includes(k));
  if (!emailMethod(env)) out.email_settings = {
    MS_TENANT_ID: !seen('MS_TENANT_ID') ? 'missing' : guid.test(seen('MS_TENANT_ID')) ? 'set' : 'WRONG: should look like bd262d4b-b8cd-...',
    MS_CLIENT_ID: !seen('MS_CLIENT_ID') ? 'missing' : guid.test(seen('MS_CLIENT_ID')) ? 'set' : 'WRONG: should look like c5447c8b-51f2-...',
    MS_CLIENT_SECRET: !seen('MS_CLIENT_SECRET') ? 'missing' : guid.test(seen('MS_CLIENT_SECRET')) ? 'WRONG: this looks like the Secret ID, use the secret Value' : 'set',
    MAIL_FROM: !seen('MAIL_FROM') ? 'missing' : /@/.test(seen('MAIL_FROM')) ? 'set' : 'WRONG: should be Chas Berger Snags <snags@chasberger.co.uk>',
    ...(similar.length ? { misspelt_names_found: similar.join(', ') } : {}),
    deployment: env.VERCEL_ENV || 'unknown',
  };
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const { store } = getApp();
    try {
      await store.select('projects', { id: '00000000-0000-0000-0000-000000000000' });
      try { await store.select('pms', { id: '00000000-0000-0000-0000-000000000000' }); await store.select('projects', { pm_id: '00000000-0000-0000-0000-000000000000' }); out.database = 'OK'; }
      catch { out.database = 'WRONG: database needs updating for project manager PINs. Run supabase/schema.sql again in the Supabase SQL Editor'; }
    }
    catch (e) { out.database = /does not exist|schema cache/i.test(e.message) ? 'WRONG: tables missing, run supabase/schema.sql in the Supabase SQL Editor' : /Invalid API key|JWT|apikey/i.test(e.message) ? 'WRONG: Supabase rejected the key' : 'ERROR: ' + e.message; }
    try { await store.photoUrl('health-check/none.jpg'); out.photo_storage = 'OK'; }
    catch (e) { out.photo_storage = /bucket/i.test(e.message) ? 'WRONG: photos bucket missing, run supabase/schema.sql again' : /not found|Object not found/i.test(e.message) ? 'OK' : 'ERROR: ' + e.message; }
  } else out.database = 'WRONG: running without a database. Nothing is being saved. Add SUPABASE_URL and SUPABASE_SERVICE_KEY, then redeploy';
  out.all_good = Object.values(out).every(v => typeof v !== 'string' || !/^(WRONG|ERROR|missing)/.test(v));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
}
