// Daily chase: overdue snags and missed scaffold strikes get an email the first working day after
// they're missed, then every 5 working days until they're closed out.
import { workingDaysBetween, isWorkingDay, ukToday } from './workdays.js';
import { emailChaseSnag, emailChaseScaffold } from './email.js';

export const CHASE_EVERY = 5;
// Due for a chase today? `due` is the missed date, `last` the date of the last chase ('' if none)
export function chaseDue(due, last, today) {
  if (!due || due >= today) return false;
  if (last === today) return false;
  return last ? workingDaysBetween(last, today) >= CHASE_EVERY : workingDaysBetween(due, today) >= 1;
}

export async function runChase(store, env, { today = ukToday(), limit = 60 } = {}) {
  const out = { today, snags: 0, scaffolds: 0, failed: 0, skipped: '' };
  if (!isWorkingDay(today)) { out.skipped = 'Not a working day'; return out; }
  // Without somewhere to record each chase, the same email would go out every day, so stop instead
  try { await store.checkColumns('snags', ['chase_count', 'last_chased']); await store.checkColumns('scaffolds', ['chase_count', 'last_chased']); }
  catch (e) { out.skipped = 'Database needs updating: run supabase/schema.sql'; return out; }
  const load = async (t, where) => { try { return await store.select(t, where); } catch (e) { return []; } };
  const props = new Map(), projects = new Map(), contractors = new Map();
  const ctx = async (pid, cid) => {
    if (!props.has(pid)) props.set(pid, (await load('properties', { id: pid }))[0]);
    const p = props.get(pid);
    if (p && p.project_id && !projects.has(p.project_id)) projects.set(p.project_id, (await load('projects', { id: p.project_id }))[0]);
    if (!contractors.has(cid)) contractors.set(cid, (await load('contractors', { id: cid }))[0]);
    return { property: p, project: p && projects.get(p.project_id), contractor: contractors.get(cid) };
  };
  let sent = 0;
  for (const s of await load('snags', { status: 'open' })) {
    if (sent >= limit) break;
    if (!s.contractor_id || !chaseDue(s.due, s.last_chased || '', today)) continue;
    const c = await ctx(s.property_id, s.contractor_id);
    if (!c.property || !c.contractor) continue;
    const n = (s.chase_count || 0) + 1;
    try { await emailChaseSnag(env, store, { snag: s, ...c, n, daysLate: workingDaysBetween(s.due, today) }); await store.update('snags', s.id, { chase_count: n, last_chased: today }); out.snags++; sent++; }
    catch (e) { console.error('chase snag failed', s.id, e.message); out.failed++; }
  }
  for (const x of await load('scaffolds', { status: ['requested', 'confirmed'] })) {
    if (sent >= limit) break;
    const due = x.confirmed_date || x.strike_date;
    if (!chaseDue(due, x.last_chased || '', today)) continue;
    const c = await ctx(x.property_id, x.contractor_id);
    if (!c.property || !c.contractor) continue;
    const n = (x.chase_count || 0) + 1;
    try { await emailChaseScaffold(env, store, { scaffold: x, ...c, n, due, daysLate: workingDaysBetween(due, today) }); await store.update('scaffolds', x.id, { chase_count: n, last_chased: today }); out.scaffolds++; sent++; }
    catch (e) { console.error('chase scaffold failed', x.id, e.message); out.failed++; }
  }
  return out;
}
