// End-to-end check of the main flows in a real browser, against the local in-memory server.
// Run: npm test
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 3456, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || '';
const server = spawn('node', ['dev-server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.on('data', d => String(d).includes('running') && r()));

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const emails = async () => (await fetch(BASE + '/__emails')).json();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
const toastHas = async (page, txt) => { await page.waitForFunction(t => document.querySelector('#toast')?.textContent.includes(t), txt, { timeout: 8000 }); return true; };

const b = await chromium.launch();
try {
  // ---------- admin unlocks and sets up a project ----------
  const admin = await b.newPage(phone);
  const errors = []; admin.on('pageerror', e => errors.push(e.message));
  admin.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push('CSP: ' + m.text()); });
  await admin.goto(BASE);
  await shot(admin, '01-pin');
  await admin.fill('#g-name', 'Oliver');
  await admin.fill('#g-pin', '999999');
  await admin.click('#gate-form button[type=submit]');
  await admin.waitForSelector('#vbody .empty');
  ok(await admin.isVisible('text=No addresses yet'), 'admin unlocks with admin PIN and sees empty addresses');

  await admin.click('.nav [data-tab=projects]');
  await admin.click('[data-act=new-project] >> nth=0');
  await admin.fill('#pj-n', 'Leeds K&B Phase 2');
  await admin.fill('#pj-e', 'pm@chasberger.co.uk');
  const pin = await admin.inputValue('#pj-pin');
  await admin.click('[data-act=c-add]');
  await admin.fill('#cn0', 'Smith Plumbing Ltd');
  await admin.fill('#ce0', 'snags@smithplumbing.co.uk');
  await admin.selectOption('#ct0', 'Plumber');
  await shot(admin, '02-project');
  await admin.click('[data-act=pj-save]');
  await toastHas(admin, 'Project created');
  ok(await admin.isVisible(`text=PIN ${pin}`), `project saved with PIN ${pin}`);

  // ---------- bulk add addresses ----------
  await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=add-addresses] >> nth=0');
  await admin.fill('#imp-text', 'UPRN / Property ref\tAddress\tPostcode\tWork planned\tAccess notes\n100023456789\t12 Elm Grove, Leeds\tLS6 2AB\tKitchen; Bathroom\tCall after 12\n100023456790\t14 Elm Grove, Leeds\tls6 2ab\tKitchen\t\n\t3 Oak Road, Leeds\tLS7 1AA\tRoofing\t');
  await admin.dispatchEvent('#imp-text', 'input');
  ok((await admin.textContent('#imp-summary')).includes('3 addresses ready'), 'import preview reads template columns');
  await shot(admin, '03-import');
  await admin.click('#imp-go');
  await toastHas(admin, 'Added 3 addresses');
  ok((await admin.locator('[data-act=open-prop]').count()) === 3, '3 addresses listed');
  await shot(admin, '04-addresses');

  // re-import is de-duplicated on the server too
  const tok = await admin.evaluate(() => JSON.parse(localStorage.getItem('cbsa')).token);
  const api = async (action, payload, headers = {}) => (await fetch(BASE + '/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ action, payload }) })).json();
  const d0 = (await api('data', {}, { authorization: 'Bearer ' + tok })).data;
  const r = await api('addProperties', { project_id: d0.projects[0].id, rows: [{ address: '12 Elm Grove, Leeds', postcode: 'LS6 2AB' }] }, { authorization: 'Bearer ' + tok });
  ok(r.data.added === 0, 'server skips duplicate addresses');

  // ---------- raise a snag with a photo, emailed to the contractor ----------
  await admin.click('[data-act=open-prop] >> text=12 Elm Grove');
  ok(await admin.isVisible('text=Call after 12'), 'access notes imported');
  await admin.click('[data-act=new-snag][data-pid]');
  await admin.setInputFiles('[data-photo-input=snag]', 'public/icon-512.png');
  await admin.waitForSelector('[data-photos=snag] img[data-act=view-photo]');
  await admin.fill('#sn-t', 'Worktop joint not sealed by sink');
  await admin.fill('#sn-l', 'Kitchen');
  ok((await admin.inputValue('#sn-c')) !== '', 'only contractor pre-selected');
  ok((await admin.textContent('#sn-mail-to')).includes('copy to pm@chasberger.co.uk'), 'email shows PM copy');
  await shot(admin, '05-snag-form');
  await admin.click('[data-act=sn-save]');
  await toastHas(admin, 'emailed to Smith Plumbing');
  let em = await emails();
  ok(em.length === 1 && em[0].to === 'snags@smithplumbing.co.uk' && em[0].cc === 'pm@chasberger.co.uk' && em[0].attachments === 1, 'contractor email sent with photo, PM copied');
  const link = em[0].text.match(/http:\/\/\S+\?c=\w+/)[0];
  ok(!!link, 'email contains contractor link');

  // ---------- staff unlock with project PIN ----------
  const staff = await b.newPage(phone);
  await staff.goto(BASE);
  await staff.fill('#g-name', 'Dave');
  await staff.fill('#g-pin', '123456');
  await staff.click('#gate-form button[type=submit]');
  await staff.waitForFunction(() => document.querySelector('#g-err').textContent.length > 0);
  ok((await staff.textContent('#g-err')).includes('isn\'t right'), 'wrong PIN refused');
  await staff.fill('#g-pin', pin);
  await staff.click('#gate-form button[type=submit]');
  await staff.waitForSelector('[data-act=open-prop]');
  ok((await staff.locator('[data-act=open-prop]').count()) === 3, 'site team sees the project\'s addresses');
  await staff.click('.nav [data-tab=projects]');
  ok(!(await staff.isVisible(`text=PIN ${pin}`)), 'site team cannot see PINs');

  // survey
  await staff.click('.nav [data-tab=addresses]');
  await staff.click('[data-act=open-prop] >> text=14 Elm Grove');
  await staff.click('[data-act=new-survey]');
  await staff.click('[data-act=pick-type][data-v=kitchen]');
  await staff.click('label.opt:has(input[name=q_c_tenant][value=Yes])');
  await staff.click('label.opt:has(input[name=q_c_acm][value=Yes])');
  await shot(staff, '06-survey');
  await staff.click('[data-act=sv-submit]');
  await toastHas(staff, 'Survey submitted');
  ok(await staff.isVisible('text=1 to check'), 'submitted survey shows its red flag');
  ok(await staff.isVisible('.seg button[aria-pressed=true] >> text=Surveyed'), 'address moves to Surveyed');

  // ---------- contractor closes out with no login ----------
  const con = await b.newPage(phone);
  await con.goto(link);
  await con.waitForSelector('[data-act=open-snag]');
  ok(await con.isVisible('text=Your snags'), 'contractor link opens with no PIN');
  ok((await con.locator('.nav').isVisible()) === false, 'contractor has no main navigation');
  await shot(con, '07-contractor');
  await con.click('[data-act=open-snag]');
  await con.click('[data-act=fx-save]');
  await toastHas(con, 'Add a photo');
  await con.setInputFiles('[data-photo-input=fix]', 'public/icon-192.png');
  await con.waitForSelector('[data-photos=fix] img[data-act=view-photo]');
  await con.fill('#fx-n', 'Resealed with clear silicone');
  await shot(con, '08-closeout');
  await con.click('[data-act=fx-save]');
  await toastHas(con, 'Closed out');
  em = await emails();
  ok(em.length === 2 && em[1].to === 'pm@chasberger.co.uk' && em[1].subject.startsWith('Done - check it'), 'PM told when contractor closes out');
  // contractor cannot see anything else
  const cdata = (await api('data', {}, { 'x-contractor': link.split('c=')[1] })).data;
  ok(cdata.properties.length === 1 && cdata.surveys.length === 0 && !cdata.contractors[0].email, 'contractor only sees their own snag');
  const forbidden = await api('updateProperty', { id: cdata.properties[0].id, patch: { status: 'Complete' } }, { 'x-contractor': link.split('c=')[1] });
  ok(forbidden.ok === false, 'contractor cannot change addresses');

  // ---------- PM sends it back ----------
  await admin.reload();
  await admin.waitForSelector('#vbody .list');
  await admin.click('.nav [data-tab=snags]');
  await admin.click('[data-act=snag-f][data-v=fixed]');
  await admin.click('[data-act=open-snag]');
  ok(await admin.isVisible('text=Resealed with clear silicone'), 'PM sees contractor note and photos');
  await shot(admin, '09-check');
  await admin.fill('#ro-r', 'Still gappy behind the tap');
  await admin.click('[data-act=sn-reopen]');
  await toastHas(admin, 'Sent back to Smith Plumbing');
  em = await emails();
  ok(em.length === 3 && em[2].subject.startsWith('SENT BACK'), 'contractor emailed when sent back');

  // ---------- move addresses between projects ----------
  await admin.click('.nav [data-tab=projects]');
  await admin.click('[data-act=new-project] >> nth=0');
  await admin.fill('#pj-n', 'Bradford Roofing 2026');
  await admin.click('[data-act=pj-save]');
  await toastHas(admin, 'Project created');
  await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=sel-start]');
  await admin.check('label.row:has-text("3 Oak Road") input');
  await admin.selectOption('#move-to', { label: 'Bradford Roofing 2026' });
  await admin.click('[data-act=move-go]');
  await toastHas(admin, 'Moved 1');
  await staff.reload(); await staff.waitForSelector('[data-act=open-prop]');
  ok((await staff.locator('[data-act=open-prop]').count()) === 2, 'moved address leaves the old project\'s PIN');

  // ---------- another project manager runs their own projects ----------
  await admin.click('.nav [data-tab=projects]');
  await admin.click('[data-act=new-pm]');
  await admin.fill('#pm-n', 'Sarah Khan');
  await admin.fill('#pm-e', 's.khan@chasberger.co.uk');
  const pmPin = await admin.inputValue('#pm-pin');
  ok((await admin.inputValue('#pm-msg')).includes(pmPin), 'PM welcome message includes their PIN');
  await shot(admin, '11-pm');
  await admin.click('[data-act=pm-save]');
  await toastHas(admin, 'Project manager added');
  const pmPage = await b.newPage(phone);
  await pmPage.goto(BASE);
  await pmPage.fill('#g-name', 'Sarah');
  await pmPage.fill('#g-pin', pmPin);
  await pmPage.click('#gate-form button[type=submit]');
  await pmPage.waitForSelector('#vbody .empty');
  await pmPage.click('.nav [data-tab=projects]');
  await pmPage.waitForSelector('[data-act=new-project]');
  ok(!(await pmPage.isVisible('text=Leeds K&B Phase 2')), 'new PM cannot see other PMs\' projects');
  await pmPage.click('[data-act=new-project] >> nth=0');
  ok((await pmPage.inputValue('#pj-e')) === 's.khan@chasberger.co.uk', 'PM email pre-filled on their project');
  await pmPage.fill('#pj-n', 'Wakefield Windows');
  const pmProjPin = await pmPage.inputValue('#pj-pin');
  await pmPage.click('[data-act=pj-save]');
  await toastHas(pmPage, 'Project created');
  ok(await pmPage.isVisible(`text=PIN ${pmProjPin}`), 'PM creates their own project and sees its PIN');
  const pmTok = await pmPage.evaluate(() => JSON.parse(localStorage.getItem('cbsa')).token);
  const leedsId = d0.projects[0].id;
  const hijack = await api('saveProject', { id: leedsId, name: 'Hijacked', pin: '111111' }, { authorization: 'Bearer ' + pmTok });
  ok(hijack.ok === false, 'PM cannot change another PM\'s project');
  const pmData = (await api('data', {}, { authorization: 'Bearer ' + pmTok })).data;
  ok(pmData.projects.length === 1 && pmData.properties.length === 0 && pmData.pms.length === 0, 'PM data holds only their own project');
  await admin.reload(); await admin.waitForSelector('#vbody'); await admin.click('.nav [data-tab=projects]');
  await admin.waitForSelector('text=Wakefield Windows');
  ok(await admin.isVisible('text=Wakefield Windows'), 'admin sees the PM\'s project');
  const st2 = await b.newPage(phone);
  await st2.goto(BASE); await st2.fill('#g-name', 'Lee'); await st2.fill('#g-pin', pmProjPin); await st2.click('#gate-form button[type=submit]');
  await st2.waitForSelector('#vbody .empty');
  await st2.click('.nav [data-tab=projects]');
  ok(await st2.isVisible('text=Wakefield Windows') && !(await st2.isVisible('[data-act=new-project]')), 'site team on PM\'s project can\'t set up projects');

  // ---------- changing a PIN locks out phones that used the old one ----------
  const before = (await api('data', {}, { authorization: 'Bearer ' + (await staff.evaluate(() => JSON.parse(localStorage.getItem('cbsa')).token)) })).ok;
  await admin.click('.nav [data-tab=projects]');
  await admin.click('[data-act=open-project] >> text=Leeds K&B Phase 2');
  await admin.click('[data-act=pj-newpin]');
  const newPin = await admin.inputValue('#pj-pin');
  await admin.click('[data-act=pj-save]');
  await toastHas(admin, 'Project saved');
  await staff.reload();
  await staff.waitForSelector('#g-err');
  ok(before && (await staff.textContent('#g-err')).includes('PIN has changed'), 'changing a project PIN locks out phones using the old PIN');
  await staff.fill('#g-name', 'Dave'); await staff.fill('#g-pin', newPin); await staff.click('#gate-form button[type=submit]');
  await staff.waitForSelector('[data-act=open-prop]');
  ok(true, 'new PIN lets them back in');
  const sTok = await staff.evaluate(() => JSON.parse(localStorage.getItem('cbsa')).token);
  const forged = sTok.replace(/^.{5}/, 'AAAAA');
  ok((await api('data', {}, { authorization: 'Bearer ' + forged })).ok === false, 'tampered session tokens are rejected');
  ok((await api('saveProject', { name: 'X', pin: '123123' }, { authorization: 'Bearer ' + sTok })).ok === false, 'site team cannot create projects');
  ok((await api('savePm', { name: 'X', pin: '123124' }, { authorization: 'Bearer ' + pmTok })).ok === false, 'PM cannot create other PMs');

  // ---------- PIN brute force is blocked ----------
  let last;
  for (let i = 0; i < 9; i++) last = await api('login', { pin: String(100000 + i) });
  ok(last.ok === false && /Too many/.test(last.error), 'repeated wrong PINs get locked out');

  // ---------- photos need a PIN or link ----------
  const photoPath = d0 && (await api('data', {}, { authorization: 'Bearer ' + tok })).data.snags[0].photos[0];
  ok((await fetch(`${BASE}/api/photo?p=${encodeURIComponent(photoPath)}`)).status === 401, 'photos are not public');
  ok((await fetch(`${BASE}/api/photo?p=${encodeURIComponent(photoPath)}&s=${tok}`)).status === 200, 'photos load with a PIN session');

  // ---------- desktop + dark render check ----------
  const dark = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  await dark.goto(BASE); await dark.evaluate(t => localStorage.setItem('cbsa', JSON.stringify({ token: t, name: 'Oliver' })), tok);
  await dark.goto(BASE); await dark.waitForSelector('[data-act=open-prop]'); await shot(dark, '10-dark');
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok(!overflow, 'no sideways scrolling at phone width');
  ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} catch (e) {
  console.error(e); failed++;
} finally {
  await b.close(); server.kill();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
