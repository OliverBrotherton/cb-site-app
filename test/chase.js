// Runs the daily chase over pretend dates and checks who gets chased, and when.
import { memoryStore } from '../lib/store.js';
import { runChase, chaseDue } from '../lib/chase.js';
import { sentLog } from '../lib/email.js';

const env = { EMAIL_MODE: 'log', APP_URL: 'https://app.test' };
const store = memoryStore();
let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };

const [pr] = await store.insert('projects', [{ name: 'PA Year 3', pm_email: 'pm@chasberger.co.uk', pin: '123456' }]);
const [c] = await store.insert('contractors', [{ project_id: pr.id, name: 'Smith Plumbing', email: 'snags@smith.co.uk', token: 'tok' }]);
const [p] = await store.insert('properties', [{ project_id: pr.id, address: '172 Green Lane Road', postcode: 'LS1 1AA' }]);
const [s1] = await store.insert('snags', [{ property_id: p.id, contractor_id: c.id, title: 'Leaking trap', due: '2026-11-13', raised_by_email: 'tom@chasberger.co.uk' }]);
await store.insert('snags', [{ property_id: p.id, contractor_id: c.id, title: 'No fix-by date', due: '' }]);
await store.insert('snags', [{ property_id: p.id, contractor_id: null, title: 'Own team', due: '2026-11-01' }]);
const [sc] = await store.insert('scaffolds', [{ property_id: p.id, contractor_id: c.id, strike_date: '2026-11-16', status: 'requested' }]);

const run = async today => { const before = sentLog.length; const r = await runChase(store, env, { today }); return { r, mails: sentLog.slice(before) }; };

let x = await run('2026-11-13');
ok(x.mails.length === 0, 'nothing chased on the fix-by date itself');
x = await run('2026-11-14');
ok(x.r.skipped === 'Not a working day' && x.mails.length === 0, 'no chases at weekends');
x = await run('2026-11-16');
ok(x.mails.length === 1 && x.mails[0].subject.startsWith('OVERDUE: Snag SN-0001') && x.mails[0].to === 'snags@smith.co.uk', 'first chase the next working day after the fix-by date');
ok(JSON.stringify(x.mails[0].cc) === JSON.stringify(['pm@chasberger.co.uk', 'tom@chasberger.co.uk']), 'chase copies in the PM and site manager');
x = await run('2026-11-16');
ok(x.mails.length === 0, 'never chased twice in one day');
x = await run('2026-11-17');
ok(x.mails.length === 1 && x.mails[0].subject.startsWith('OVERDUE: Scaffold strike SC-0001'), 'missed strike chased the next working day');
for (const d of ['2026-11-18', '2026-11-19', '2026-11-20']) { x = await run(d); ok(x.mails.length === 0, `no chase on ${d}`); }
x = await run('2026-11-23');
ok(x.mails.length === 1 && x.mails[0].subject.startsWith('CHASE 2: Snag'), 'second snag chase 5 working days later');
x = await run('2026-11-24');
ok(x.mails.length === 1 && x.mails[0].subject.startsWith('CHASE 2: Scaffold'), 'second scaffold chase 5 working days later');
await store.update('scaffolds', sc.id, { status: 'confirmed', confirmed_date: '2026-11-27', last_chased: '', chase_count: 0 });
await store.update('snags', s1.id, { status: 'fixed' });
x = await run('2026-11-30');
ok(x.mails.length === 1 && x.mails[0].subject.startsWith('OVERDUE: Scaffold') && x.mails[0].text.includes('You confirmed'), 'closed-out snag stops; a missed confirmed date starts a fresh chase');
ok(sentLog.every(m => !m.subject.includes('No fix-by date') && !m.subject.includes('Own team')), 'snags with no fix-by date or no contractor are never chased');
ok(chaseDue('2026-12-23', '', '2026-12-29') && !chaseDue('2026-12-24', '', '2026-12-28'), 'bank holidays don\'t count');
await store.insert('scaffolds', [{ property_id: p.id, contractor_id: c.id, strike_date: '2026-12-01', status: 'requested', kind: 'erect' }]);
x = await run('2026-12-02');
ok(x.mails.some(m => m.subject.startsWith('OVERDUE: Scaffold erection') && m.text.includes('due to be put up')), 'a missed erection is chased with the right wording');
const noCols = memoryStore(); noCols.checkColumns = async () => { throw new Error('column snags.chase_count does not exist'); };
ok((await runChase(noCols, env, { today: '2026-11-16' })).skipped.startsWith('Database needs updating'), 'no chases are sent until the database is updated');
console.log(bad ? `\n${bad} check(s) failed` : '\nAll chase checks passed');
process.exit(bad ? 1 : 0);
