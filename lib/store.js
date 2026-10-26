// Data + photo storage. The live site uses Supabase; local testing uses an in-memory copy with the same interface.
import crypto from 'node:crypto';

export function supabaseStore(url, key) {
  let sb;
  const client = async () => {
    if (!sb) {
      const { createClient } = await import('@supabase/supabase-js');
      sb = createClient(url, key, { auth: { persistSession: false } });
    }
    return sb;
  };
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const filter = (q, where) => {
    for (const [k, v] of Object.entries(where || {})) q = Array.isArray(v) ? q.in(k, v.length ? v : ['00000000-0000-0000-0000-000000000000']) : q.eq(k, v);
    return q;
  };
  return {
    async select(table, where) {
      const s = await client(); const out = [];
      for (let from = 0; ; from += 1000) {
        const rows = chk(await filter(s.from(table).select('*'), where).range(from, from + 999));
        out.push(...rows); if (rows.length < 1000) return out;
      }
    },
    async insert(table, rows) {
      const s = await client(); const out = [];
      for (let i = 0; i < rows.length; i += 500) out.push(...chk(await s.from(table).insert(rows.slice(i, i + 500)).select()));
      return out;
    },
    async update(table, id, patch) { const s = await client(); return chk(await s.from(table).update(patch).eq('id', id).select())[0]; },
    async remove(table, id) { const s = await client(); chk(await s.from(table).delete().eq('id', id)); },
    async countSince(table, where, field, since) {
      const s = await client();
      const { count, error } = await filter(s.from(table).select('id', { count: 'exact', head: true }), where).gte(field, since);
      if (error) throw new Error(error.message); return count || 0;
    },
    async putPhoto(path, buffer, type) { const s = await client(); chk(await s.storage.from('photos').upload(path, buffer, { contentType: type })); },
    async getPhoto(path) {
      const s = await client(); const { data, error } = await s.storage.from('photos').download(path);
      if (error) throw new Error(error.message); return { buffer: Buffer.from(await data.arrayBuffer()), type: data.type || 'image/jpeg' };
    },
    async photoUrl(path) { const s = await client(); return chk(await s.storage.from('photos').createSignedUrl(path, 3600)).signedUrl; },
  };
}

export function memoryStore() {
  const T = { projects: [], contractors: [], properties: [], surveys: [], snags: [], login_attempts: [] };
  const photos = new Map(); let refNo = 0;
  const DEFAULTS = {
    projects: { pm_email: '' },
    contractors: { trade: '' },
    properties: { project_id: null, ref: '', postcode: '', works: [], status: 'To survey', notes: '' },
    surveys: { answers: {}, photos: {}, status: 'draft', by_name: '', submitted_at: null },
    snags: { contractor_id: null, location: '', trade: '', priority: 'Medium', due: '', notes: '', photos: [], fix_photos: [], fix_note: '', status: 'open', reopen_reason: '', raised_by: '', fixed_at: null, fixed_by: '', closed_at: null, closed_by: '', email_status: 'none', email_error: '', emailed_at: null, emailed_to: '' },
    login_attempts: {},
  };
  const match = (r, where) => Object.entries(where || {}).every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v);
  const clone = x => JSON.parse(JSON.stringify(x));
  return {
    async select(t, where) { return clone(T[t].filter(r => match(r, where))); },
    async insert(t, rows) {
      const out = rows.map(r => {
        const row = { ...clone(DEFAULTS[t]), id: crypto.randomUUID(), created_at: Date.now(), ...clone(r) };
        if (t === 'snags') { row.ref_no = ++refNo; row.raised_at ??= Date.now(); }
        if (t === 'surveys') row.updated_at ??= Date.now();
        if (t === 'projects' && T.projects.some(p => p.pin === row.pin)) throw new Error('duplicate key value violates unique constraint "projects_pin_key"');
        T[t].push(row); return row;
      });
      return clone(out);
    },
    async update(t, id, patch) { const r = T[t].find(x => x.id === id); if (!r) return undefined; Object.assign(r, clone(patch)); return clone(r); },
    async remove(t, id) {
      T[t] = T[t].filter(x => x.id !== id);
      if (t === 'projects') { T.contractors = T.contractors.filter(c => c.project_id !== id); T.properties.forEach(p => { if (p.project_id === id) p.project_id = null; }); }
      if (t === 'contractors') T.snags.forEach(s => { if (s.contractor_id === id) s.contractor_id = null; });
      if (t === 'properties') { T.snags = T.snags.filter(s => s.property_id !== id); T.surveys = T.surveys.filter(s => s.property_id !== id); }
    },
    async countSince(t, where, field, since) { return T[t].filter(r => match(r, where) && r[field] >= since).length; },
    async putPhoto(path, buffer, type) { photos.set(path, { buffer, type }); },
    async getPhoto(path) { const p = photos.get(path); if (!p) throw new Error('not found'); return p; },
    photoUrl: null,
  };
}
