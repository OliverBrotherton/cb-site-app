// Every action the app can do, with the PIN / contractor-link checks in one place.
import crypto from 'node:crypto';
import { signSession, readSession, randomToken, safeEqual } from './auth.js';
import { emailContractor, emailPmClosedOut, emailReady } from './email.js';

const WORKS = ['kitchen', 'bathroom', 'windows', 'roofing', 'external', 'structural'];
const PSTATUS = ['To survey', 'Surveyed', 'In progress', 'Complete'];
const PRIORITY = ['Low', 'Medium', 'High'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_ATTEMPTS = 8, ATTEMPT_WINDOW = 15 * 60 * 1000;

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const strList = (v, max = 50) => (Array.isArray(v) ? v : []).map(x => str(x, 300)).filter(Boolean).slice(0, max);
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o[k]]));

export function makeApp(store, env) {
  if (!env.ADMIN_PIN || !/^\d{6,}$/.test(env.ADMIN_PIN)) console.warn('ADMIN_PIN must be set to 6+ digits');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) console.warn('SESSION_SECRET must be set to a long random string');

  // ---------- who is asking ----------
  async function context(headers) {
    const ctoken = headers['x-contractor'];
    if (ctoken) {
      const [c] = await store.select('contractors', { token: str(ctoken, 100) });
      if (!c) fail(401, 'This link no longer works. Ask the project manager for a new one.');
      return { role: 'contractor', contractor: c, name: c.name };
    }
    const auth = String(headers.authorization || '').replace(/^Bearer\s+/i, '');
    const s = readSession(auth, env.SESSION_SECRET);
    if (!s) fail(401, 'Enter your PIN again.');
    const name = str(headers['x-name'] && decodeURIComponent(headers['x-name']), 80);
    if (s.r === 'pm') {
      // A PM sees the projects they run, plus any site-team PINs they've also entered
      const [pm] = await store.select('pms', { id: s.m });
      if (!pm) fail(401, 'Your PM PIN has been removed. Ask the admin for a new one.');
      const own = (await store.select('projects', { pm_id: pm.id })).map(p => p.id);
      return { role: 'pm', pm, ownIds: own, projectIds: [...new Set([...own, ...(s.p || [])])], name };
    }
    return { role: s.r, projectIds: s.r === 'admin' ? null : s.p || [], name };
  }
  const inScope = (ctx, projectId) => ctx.role === 'admin' || ((ctx.role === 'staff' || ctx.role === 'pm') && projectId && ctx.projectIds.includes(projectId));
  const staffOnly = ctx => { if (!['admin', 'staff', 'pm'].includes(ctx.role)) fail(403, 'Not allowed'); };
  const adminOnly = ctx => { if (ctx.role !== 'admin') fail(403, 'Only the admin PIN can do this'); };
  const managerOnly = ctx => { if (ctx.role !== 'admin' && ctx.role !== 'pm') fail(403, 'Only a project manager PIN can do this'); };
  const ownsProject = (ctx, id) => ctx.role === 'admin' || (ctx.role === 'pm' && ctx.ownIds.includes(id));
  async function pinTaken(pin, self) {
    if (pin === env.ADMIN_PIN) return true;
    if ((await store.select('projects', { pin })).some(p => p.id !== self)) return true;
    return (await store.select('pms', { pin })).some(p => p.id !== self);
  }

  async function propertyFor(ctx, id) {
    const [p] = await store.select('properties', { id: str(id, 60) });
    if (!p || !inScope(ctx, p.project_id)) fail(404, 'That address isn\'t on your projects');
    return p;
  }
  async function snagFor(ctx, id) {
    const [s] = await store.select('snags', { id: str(id, 60) });
    if (!s) fail(404, 'Snag not found');
    if (ctx.role === 'contractor') { if (s.contractor_id !== ctx.contractor.id) fail(404, 'Snag not found'); return s; }
    await propertyFor(ctx, s.property_id); return s;
  }
  async function snagContext(s) {
    const [property] = await store.select('properties', { id: s.property_id });
    const [project] = property && property.project_id ? await store.select('projects', { id: property.project_id }) : [];
    const [contractor] = s.contractor_id ? await store.select('contractors', { id: s.contractor_id }) : [];
    return { property, project, contractor };
  }
  async function sendSnag(s, kind) {
    const { property, project, contractor } = await snagContext(s);
    if (!contractor) return s;
    try {
      await emailContractor(env, store, { snag: s, property, project, contractor, kind });
      return store.update('snags', s.id, { email_status: 'sent', emailed_at: Date.now(), emailed_to: contractor.email, email_error: '' });
    } catch (e) {
      console.error('email failed', e.message);
      return store.update('snags', s.id, { email_status: 'failed', email_error: emailReady(env) ? 'The email server refused it' : 'Email isn\'t set up yet' });
    }
  }

  const actions = {
    // ---------- unlock ----------
    async login({ pin, current }, _ctx, ip) {
      pin = str(pin, 20);
      if (await store.countSince('login_attempts', { ip }, 'at', Date.now() - ATTEMPT_WINDOW) >= MAX_ATTEMPTS) fail(429, 'Too many wrong PINs. Wait 15 minutes and try again.');
      const prev = readSession(current, env.SESSION_SECRET);
      if (env.ADMIN_PIN && safeEqual(pin, env.ADMIN_PIN)) return { token: signSession({ r: 'admin' }, env.SESSION_SECRET), role: 'admin' };
      const [pm] = /^\d{6}$/.test(pin) ? await store.select('pms', { pin }) : [];
      if (pm) {
        if (prev && prev.r === 'admin') return { token: current, role: 'admin' };
        return { token: signSession({ r: 'pm', m: pm.id, p: prev && prev.p || [] }, env.SESSION_SECRET), role: 'pm', project: pm.name };
      }
      const [project] = /^\d{6}$/.test(pin) ? await store.select('projects', { pin }) : [];
      if (!project) { await store.insert('login_attempts', [{ ip, at: Date.now() }]); fail(401, 'That PIN isn\'t right. Check it with your project manager.'); }
      if (prev && prev.r === 'admin') return { token: current, role: 'admin', project: project.name };
      const ids = [...new Set([...(prev && prev.p ? prev.p : []), project.id])];
      if (prev && prev.r === 'pm') return { token: signSession({ r: 'pm', m: prev.m, p: ids }, env.SESSION_SECRET), role: 'pm', project: project.name };
      return { token: signSession({ r: 'staff', p: ids }, env.SESSION_SECRET), role: 'staff', project: project.name };
    },

    // ---------- everything this person can see ----------
    async data(_, ctx) {
      if (ctx.role === 'contractor') {
        const c = ctx.contractor;
        const snags = await store.select('snags', { contractor_id: c.id });
        const props = snags.length ? await store.select('properties', { id: [...new Set(snags.map(s => s.property_id))] }) : [];
        const [project] = await store.select('projects', { id: c.project_id });
        return { role: 'contractor', me: { name: c.name, id: c.id }, projects: project ? [{ id: project.id, name: project.name }] : [], contractors: [{ id: c.id, name: c.name, project_id: c.project_id }],
          properties: props.map(p => pick(p, ['id', 'address', 'postcode', 'notes', 'project_id'])), surveys: [], snags: snags.map(s => ({ ...s, email_error: '' })), emailReady: false };
      }
      const where = ctx.role === 'admin' ? {} : { id: ctx.projectIds };
      const projects = await store.select('projects', where);
      const pids = projects.map(p => p.id);
      const contractors = ctx.role === 'admin' ? await store.select('contractors') : await store.select('contractors', { project_id: pids });
      const properties = ctx.role === 'admin' ? await store.select('properties') : await store.select('properties', { project_id: pids });
      const propIds = properties.map(p => p.id);
      const surveys = ctx.role === 'admin' ? await store.select('surveys') : await store.select('surveys', { property_id: propIds });
      const snags = ctx.role === 'admin' ? await store.select('snags') : await store.select('snags', { property_id: propIds });
      const manages = id => ownsProject(ctx, id);
      return {
        role: ctx.role,
        me: ctx.role === 'pm' ? { name: ctx.pm.name, email: ctx.pm.email } : null,
        pms: ctx.role === 'admin' ? await store.select('pms') : [],
        projects: projects.map(p => manages(p.id) ? { ...p, manages: true } : pick(p, ['id', 'name', 'pm_email', 'created_at'])),
        contractors: contractors.map(c => pick(c, ['id', 'project_id', 'name', 'email', 'trade', 'token'])),
        properties, surveys, snags, emailReady: emailReady(env),
      };
    },

    // ---------- photos ----------
    async uploadPhoto({ data, type }, ctx) {
      const ext = PHOTO_TYPES[type]; if (!ext) fail(400, 'Photos must be JPG, PNG or WebP');
      const buf = Buffer.from(String(data || ''), 'base64');
      if (!buf.length || buf.length > 6 * 1024 * 1024) fail(400, 'That photo is too big');
      const d = new Date(); const path = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
      await store.putPhoto(path, buf, type);
      return { path };
    },

    // ---------- project managers (admin) ----------
    async savePm({ id, name, email, pin }, ctx) {
      adminOnly(ctx);
      name = str(name, 120); email = str(email, 200); pin = str(pin, 6);
      if (!name) fail(400, 'Put their name in');
      if (email && !EMAIL_RE.test(email)) fail(400, 'Their email doesn\'t look right');
      if (!/^\d{6}$/.test(pin)) fail(400, 'The PIN must be 6 numbers');
      if (await pinTaken(pin, id)) fail(400, 'That PIN is already in use. Tap New PIN.');
      if (id) { const u = await store.update('pms', str(id, 60), { name, email, pin }); if (!u) fail(404, 'Not found'); return { id: u.id }; }
      const [pm] = await store.insert('pms', [{ name, email, pin }]); return { id: pm.id };
    },
    async deletePm({ id }, ctx) { adminOnly(ctx); await store.remove('pms', str(id, 60)); return {}; },

    // ---------- projects (admin and PMs) ----------
    async saveProject({ id, name, pm_email, pin, contractors, pm_id }, ctx) {
      managerOnly(ctx);
      if (id && !ownsProject(ctx, id)) fail(403, 'You can only change projects you run');
      name = str(name, 120); pm_email = str(pm_email, 200); pin = str(pin, 6);
      if (!name) fail(400, 'Give the project a name');
      if (pm_email && !EMAIL_RE.test(pm_email)) fail(400, 'The PM email doesn\'t look right');
      if (!/^\d{6}$/.test(pin)) fail(400, 'The PIN must be 6 numbers');
      if (await pinTaken(pin, id)) fail(400, 'That PIN is already in use. Tap New PIN.');
      let owner = ctx.role === 'pm' ? ctx.pm.id : (pm_id ? str(pm_id, 60) : null);
      if (ctx.role === 'admin' && owner && !(await store.select('pms', { id: owner })).length) fail(400, 'That project manager no longer exists');
      const cs = (Array.isArray(contractors) ? contractors : []).slice(0, 50).map(c => ({ id: c.id ? str(c.id, 60) : null, name: str(c.name, 120), email: str(c.email, 200), trade: str(c.trade, 60) })).filter(c => c.name || c.email);
      const bad = cs.find(c => !c.name || !EMAIL_RE.test(c.email)); if (bad) fail(400, bad.name ? `Check the email for ${bad.name}` : 'Every contractor needs a name');
      let project;
      if (id) { [project] = await store.select('projects', { id: str(id, 60) }); if (!project) fail(404, 'Project not found'); project = await store.update('projects', project.id, { name, pm_email, pin, ...(ctx.role === 'admin' ? { pm_id: owner } : {}) }); }
      else [project] = await store.insert('projects', [{ name, pm_email, pin, pm_id: owner }]);
      const existing = await store.select('contractors', { project_id: project.id });
      for (const old of existing) if (!cs.some(c => c.id === old.id)) await store.remove('contractors', old.id);
      for (const c of cs) {
        const old = existing.find(x => x.id === c.id);
        if (old) await store.update('contractors', old.id, { name: c.name, email: c.email, trade: c.trade });
        else await store.insert('contractors', [{ project_id: project.id, name: c.name, email: c.email, trade: c.trade, token: randomToken() }]);
      }
      return { id: project.id };
    },
    async deleteProject({ id }, ctx) { managerOnly(ctx); id = str(id, 60); if (!ownsProject(ctx, id)) fail(403, 'You can only delete projects you run'); await store.remove('projects', id); return {}; },
    async newContractorLink({ id }, ctx) {
      managerOnly(ctx); const [c] = await store.select('contractors', { id: str(id, 60) });
      if (!c || !ownsProject(ctx, c.project_id)) fail(404, 'Contractor not found');
      await store.update('contractors', c.id, { token: randomToken() }); return {};
    },

    // ---------- addresses ----------
    async addProperties({ project_id, rows, works }, ctx) {
      staffOnly(ctx);
      project_id = project_id ? str(project_id, 60) : null;
      if (project_id ? !inScope(ctx, project_id) : ctx.role !== 'admin') fail(403, 'Pick one of your projects');
      const defWorks = strList(works).filter(w => WORKS.includes(w));
      const key = (a, p) => (a + '|' + p).toLowerCase().replace(/[^a-z0-9|]/g, '');
      const have = new Set((await store.select('properties', project_id ? { project_id } : {})).map(p => key(p.address, p.postcode)));
      const out = [];
      for (const r of (Array.isArray(rows) ? rows : []).slice(0, 5000)) {
        const address = str(r.address, 300); if (!address) continue;
        const postcode = str(r.postcode, 10).toUpperCase(); const k = key(address, postcode);
        if (have.has(k)) continue; have.add(k);
        const w = strList(r.works).filter(x => WORKS.includes(x));
        out.push({ project_id, address, postcode, ref: str(r.ref, 60), works: w.length ? w : defWorks, notes: str(r.notes, 2000), status: 'To survey' });
      }
      await store.insert('properties', out);
      return { added: out.length };
    },
    async updateProperty({ id, patch }, ctx) {
      staffOnly(ctx); const p = await propertyFor(ctx, id); const up = {};
      if (patch.address !== undefined) up.address = str(patch.address, 300) || p.address;
      if (patch.postcode !== undefined) up.postcode = str(patch.postcode, 10).toUpperCase();
      if (patch.ref !== undefined) up.ref = str(patch.ref, 60);
      if (patch.notes !== undefined) up.notes = str(patch.notes, 2000);
      if (patch.works !== undefined) up.works = strList(patch.works).filter(w => WORKS.includes(w));
      if (patch.status !== undefined) { if (!PSTATUS.includes(patch.status)) fail(400, 'Unknown status'); up.status = patch.status; }
      if (patch.project_id !== undefined) { const np = patch.project_id ? str(patch.project_id, 60) : null; if (np ? !inScope(ctx, np) : ctx.role !== 'admin') fail(403, 'Pick one of your projects'); up.project_id = np; }
      return { property: await store.update('properties', p.id, up) };
    },
    async moveProperties({ ids, project_id }, ctx) {
      staffOnly(ctx); const np = project_id ? str(project_id, 60) : null;
      if (np ? !inScope(ctx, np) : ctx.role !== 'admin') fail(403, 'Pick one of your projects');
      let n = 0; for (const id of strList(ids, 2000)) { const p = await propertyFor(ctx, id); await store.update('properties', p.id, { project_id: np }); n++; }
      return { moved: n };
    },
    async deleteProperty({ id }, ctx) { staffOnly(ctx); const p = await propertyFor(ctx, id); await store.remove('properties', p.id); return {}; },

    // ---------- surveys ----------
    async saveSurvey({ id, property_id, type, answers, photos, submit }, ctx) {
      staffOnly(ctx);
      const p = await propertyFor(ctx, property_id);
      if (!WORKS.includes(type)) fail(400, 'Unknown survey type');
      const clean = {}; for (const [k, v] of Object.entries(answers || {}).slice(0, 300)) clean[str(k, 40)] = Array.isArray(v) ? strList(v) : str(v, 4000);
      const ph = {}; for (const [k, v] of Object.entries(photos || {}).slice(0, 40)) ph[str(k, 20)] = strList(v, 30);
      const now = Date.now();
      let sv;
      if (id) {
        const [old] = await store.select('surveys', { id: str(id, 60) }); if (!old || old.property_id !== p.id) fail(404, 'Survey not found');
        const status = submit || old.status === 'submitted' ? 'submitted' : 'draft';
        sv = await store.update('surveys', old.id, { answers: clean, photos: ph, status, updated_at: now, submitted_at: old.submitted_at || (submit ? now : null) });
      } else {
        [sv] = await store.insert('surveys', [{ property_id: p.id, type, answers: clean, photos: ph, status: submit ? 'submitted' : 'draft', by_name: ctx.name, updated_at: now, submitted_at: submit ? now : null }]);
      }
      if (sv.status === 'submitted' && p.status === 'To survey') await store.update('properties', p.id, { status: 'Surveyed' });
      return { survey: sv };
    },

    // ---------- snags ----------
    async createSnag(b, ctx) {
      staffOnly(ctx);
      const p = await propertyFor(ctx, b.property_id);
      const title = str(b.title, 200); if (!title) fail(400, 'Say what\'s wrong in a few words');
      let contractor_id = null;
      if (b.contractor_id) {
        const [c] = await store.select('contractors', { id: str(b.contractor_id, 60) });
        if (!c || c.project_id !== p.project_id) fail(400, 'That contractor isn\'t on this project');
        contractor_id = c.id;
      }
      const due = /^\d{4}-\d{2}-\d{2}$/.test(b.due || '') ? b.due : '';
      let [s] = await store.insert('snags', [{
        property_id: p.id, contractor_id, title, location: str(b.location, 100), trade: str(b.trade, 60),
        priority: PRIORITY.includes(b.priority) ? b.priority : 'Medium', due, notes: str(b.notes, 4000),
        photos: strList(b.photos, 20), raised_by: ctx.name, raised_at: Date.now(),
        email_status: contractor_id ? (b.sendEmail ? 'pending' : 'none') : 'none',
      }]);
      if (contractor_id && b.sendEmail) s = await sendSnag(s, 'new');
      return { snag: s };
    },
    async snagAction({ id, op, photos, note, reason }, ctx) {
      staffOnly(ctx); const s = await snagFor(ctx, id); const now = Date.now();
      if (op === 'fixed') return { snag: await store.update('snags', s.id, { status: 'fixed', fixed_at: now, fixed_by: ctx.name, fix_photos: [...s.fix_photos, ...strList(photos, 20)], fix_note: str(note, 2000) || s.fix_note, reopen_reason: '' }) };
      if (op === 'close') return { snag: await store.update('snags', s.id, { status: 'closed', closed_at: now, closed_by: ctx.name }) };
      if (op === 'reopen') {
        let u = await store.update('snags', s.id, { status: 'open', closed_at: null, closed_by: '', reopen_reason: str(reason, 1000), email_status: s.contractor_id ? 'pending' : 'none' });
        if (s.contractor_id) u = await sendSnag(u, 'reopen');
        return { snag: u };
      }
      fail(400, 'Unknown action');
    },
    async resendEmail({ id }, ctx) { staffOnly(ctx); const s = await snagFor(ctx, id); return { snag: await sendSnag(s, s.reopen_reason ? 'reopen' : 'new') }; },
    async deleteSnag({ id }, ctx) { staffOnly(ctx); const s = await snagFor(ctx, id); await store.remove('snags', s.id); return {}; },

    // ---------- contractor ----------
    async closeOut({ id, photos, note }, ctx) {
      if (ctx.role !== 'contractor') fail(403, 'Not allowed');
      const s = await snagFor(ctx, id);
      if (s.status !== 'open') fail(400, 'This snag is already closed out');
      const ph = strList(photos, 20); if (!ph.length) fail(400, 'Add a photo of the finished repair first');
      const u = await store.update('snags', s.id, { status: 'fixed', fixed_at: Date.now(), fixed_by: ctx.contractor.name, fix_photos: [...s.fix_photos, ...ph], fix_note: str(note, 2000), reopen_reason: '' });
      try { const sc = await snagContext(u); await emailPmClosedOut(env, store, { snag: u, ...sc }); } catch (e) { console.error('pm email failed', e.message); }
      return { snag: u };
    },
  };

  return {
    async rpc(body, headers, ip) {
      const action = body && body.action;
      if (!actions[action]) fail(400, 'Unknown action');
      const ctx = action === 'login' ? null : await context(headers);
      return actions[action](body.payload || {}, ctx, ip);
    },
    // Photos are served only to someone who can see them: a PIN session or a contractor link
    async photo(path, auth) {
      path = str(path, 200);
      if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)) fail(404, 'Not found');
      if (readSession(auth, env.SESSION_SECRET)) return path;
      const [c] = auth ? await store.select('contractors', { token: str(auth, 100) }) : [];
      if (!c) fail(401, 'Not allowed');
      const snags = await store.select('snags', { contractor_id: c.id });
      if (!snags.some(s => s.photos.includes(path) || s.fix_photos.includes(path))) fail(404, 'Not found');
      return path;
    },
  };
}
