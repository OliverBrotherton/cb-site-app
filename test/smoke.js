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
// The live site loads jsPDF from cdnjs; tests serve the same version locally
const route = async ctx => {
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', r => r.fulfill({ path: 'node_modules/jspdf/dist/jspdf.umd.min.js', contentType: 'text/javascript' }));
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', r => r.fulfill({ path: 'node_modules/xlsx/dist/xlsx.full.min.js', contentType: 'text/javascript' }));
};
const _newPage = b.newPage.bind(b);
b.newPage = async opts => { const pg = await _newPage({ acceptDownloads: true, ...opts }); await route(pg); return pg; };
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
  ok(await admin.isVisible('#sn-cc-email'), 'Copy me in box shows for contractor snags');
  await admin.check('#sn-cc'); await admin.fill('#sn-cc-email', 'tom@gmail.com');
  await admin.click('[data-act=sn-save]');
  await toastHas(admin, 'chasberger.co.uk email');
  await admin.fill('#sn-cc-email', 'tom.site@chasberger.co.uk');
  await admin.click('[data-act=sn-save]');
  await toastHas(admin, 'emailed to Smith Plumbing');
  let em = await emails();
  ok(em.length === 1 && em[0].to === 'snags@smithplumbing.co.uk' && JSON.stringify(em[0].cc) === JSON.stringify(['pm@chasberger.co.uk', 'tom.site@chasberger.co.uk']) && em[0].attachments === 1, 'contractor email sent with photo, PM and site manager copied');
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
  ok(em.length === 2 && em[1].to === 'pm@chasberger.co.uk' && JSON.stringify(em[1].cc) === JSON.stringify(['tom.site@chasberger.co.uk']) && em[1].subject.startsWith('Done - check it'), 'PM told when contractor closes out, site manager copied');
  // contractor cannot see anything else
  const cdata = (await api('data', {}, { 'x-contractor': link.split('c=')[1] })).data;
  ok(cdata.properties.length === 1 && cdata.surveys.length === 0 && !cdata.contractors[0].email, 'contractor only sees their own snag');
  const forbidden = await api('updateProperty', { id: cdata.properties[0].id, patch: { status: 'Complete' } }, { 'x-contractor': link.split('c=')[1] });
  ok(forbidden.ok === false, 'contractor cannot change addresses');

  // ---------- asbestos check ----------
  await admin.reload(); await admin.waitForSelector('#vbody .list');
  await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=asb-f][data-v="Not checked"]');
  ok((await admin.locator('[data-act=open-prop]').count()) === 3, 'all addresses start as asbestos not checked');
  await admin.click('[data-act=asb-f][data-v=all]');
  await admin.click('[data-act=open-prop] >> text=12 Elm Grove');
  await admin.click('[data-act=asb-edit]');
  await admin.click('label.opt:has(input[name=asb-s][value="Asbestos present"])');
  await admin.click('[data-act=asb-save]');
  await toastHas(admin, 'Say where the asbestos is');
  await admin.fill('#asb-n', 'Artex ceiling in kitchen');
  await admin.click('label.opt:has(input[name=asb-i][value="Work around it (no disturbance)"])');
  await admin.selectOption('#asb-t', 'Refurbishment & demolition (R&D)');
  await admin.fill('#asb-r', 'ACM-2291');
  fs.writeFileSync('/tmp/cb-test.pdf', '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  await admin.setInputFiles('[data-photo-input=asb]', '/tmp/cb-test.pdf');
  await admin.waitForFunction(() => S.photos.asb && S.photos.asb.length === 1 && !S.photos.asb[0].pending);
  await shot(admin, '12-asbestos');
  await admin.click('[data-act=asb-save]');
  await toastHas(admin, 'Asbestos check saved');
  ok(await admin.isVisible('text=Asbestos present.') && await admin.isVisible('a.thumb >> text=PDF'), 'asbestos warning and survey PDF show on the address');
  const pdfHref = await admin.getAttribute('a.thumb', 'href');
  ok((await fetch(BASE + pdfHref)).status === 200, 'survey PDF opens');
  await admin.click('.nav [data-tab=addresses]');
  ok(await admin.isVisible('label.row, [data-act=open-prop] >> .pill.p-bad >> text=Asbestos'), 'address list shows the asbestos badge');
  const bad = await api('uploadPhoto', { data: Buffer.from('not a pdf').toString('base64'), type: 'application/pdf' }, { authorization: 'Bearer ' + tok });
  ok(bad.ok === false, 'fake PDFs are refused');
  await con.reload(); await con.waitForSelector('[data-act=c-f][data-v=fixed]');
  await con.click('[data-act=c-f][data-v=fixed]'); await con.click('[data-act=open-snag]');
  ok(await con.isVisible('text=Asbestos present.'), 'contractor sees the asbestos warning');
  await con.click('[data-act=close-sheet]');

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

  ok(em[2].text.includes('ASBESTOS: PRESENT: Artex ceiling in kitchen'), 'snag email warns about asbestos');

  // ---------- scaffold strike call-off ----------
  await admin.click('[data-act=close-sheet]').catch(() => {});
  await admin.click('.nav [data-tab=projects]');
  await admin.click('[data-act=open-project] >> text=Leeds K&B Phase 2');
  await admin.click('[data-act=c-add]');
  await admin.fill('#cn1', 'Acme Scaffolding'); await admin.fill('#ce1', 'jobs@acmescaff.co.uk'); await admin.selectOption('#ct1', 'Scaffolder');
  await admin.click('[data-act=pj-save]'); await toastHas(admin, 'Project saved');
  await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=open-prop] >> text=12 Elm Grove');
  await admin.click('[data-act=new-scaffold]');
  ok((await admin.locator('#sf-c option').count()) === 1, 'only scaffolders offered');
  await admin.click('label.check:has(input[value="All work at height finished"])');
  await shot(admin, '13-scaffold');
  ok((await admin.inputValue('#sf-cc-email')) === 'tom.site@chasberger.co.uk' && await admin.isChecked('#sf-cc'), 'phone remembers the email for next time');
  await admin.click('[data-act=sf-save]');
  ok((await admin.textContent('[data-act=sf-save]')).includes('not ticked'), 'warns when pre-strike checks are missing');
  await admin.click('[data-act=sf-save]');
  await toastHas(admin, 'Scaffold called off and emailed');
  em = await emails();
  const sEmail = em[em.length - 1];
  ok(sEmail.to === 'jobs@acmescaff.co.uk' && JSON.stringify(sEmail.cc) === JSON.stringify(['pm@chasberger.co.uk', 'tom.site@chasberger.co.uk']) && sEmail.subject.startsWith('Scaffold strike SC-0001') && sEmail.text.includes('ASBESTOS: PRESENT'), 'scaffolder emailed with call-off and asbestos warning');
  const sLink = sEmail.text.match(/http:\/\/\S+\?c=\w+/)[0];
  const scaf = await b.newPage(phone);
  await scaf.goto(sLink); await scaf.waitForSelector('[data-act=open-scaffold]');
  ok(!(await scaf.isVisible('[data-act=open-snag]')), 'scaffolder sees only their call-off');
  await shot(scaf, '14-scaffolder');
  await scaf.click('[data-act=open-scaffold]');
  await scaf.click('[data-act=cf-ok]'); await toastHas(scaf, 'Date confirmed');
  em = await emails();
  ok(em[em.length - 1].to === 'pm@chasberger.co.uk' && JSON.stringify(em[em.length - 1].cc) === JSON.stringify(['tom.site@chasberger.co.uk']) && em[em.length - 1].subject.startsWith('Strike date confirmed'), 'PM told the strike date is confirmed, site manager copied');
  await scaf.click('[data-act=open-scaffold]');
  await scaf.click('[data-act=cf-struck]'); await toastHas(scaf, 'Add a photo');
  await scaf.setInputFiles('[data-photo-input=struck]', 'public/icon-192.png');
  await scaf.waitForSelector('[data-photos=struck] img[data-act=view-photo]');
  await scaf.click('[data-act=cf-struck]'); await toastHas(scaf, 'Marked as struck');
  em = await emails();
  ok(em[em.length - 1].subject.startsWith('Scaffold struck') && em[em.length - 1].attachments === 1, 'PM told it\'s struck, with photo');
  await admin.reload(); await admin.waitForSelector('#vbody .list');
  await admin.click('[data-act=open-prop] >> text=12 Elm Grove');
  ok(await admin.isVisible('[data-act=open-scaffold] >> text=Struck'), 'call-off shows as struck on the address');

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

  // ---------- delays ----------
  await admin.reload(); await admin.waitForSelector('#vbody'); await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=open-prop] >> text=14 Elm Grove');
  await admin.click('[data-act=new-delay]');
  await admin.click('[data-act=dl-save]'); await toastHas(admin, 'Pick the reason');
  await admin.selectOption('#dl-r', 'No access - tenant not in');
  await admin.click('label.opt:has(input[name=dl-c][value=Tenant])');
  const fiveAgo = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
  await admin.fill('#dl-s', fiveAgo); await admin.dispatchEvent('#dl-s', 'change');
  ok((await admin.textContent('#dl-days')).includes('5 calendar days'), 'days lost counted from the start date');
  await admin.fill('#dl-n', 'Three visits, calling card left');
  await shot(admin, '15-delay');
  await admin.click('[data-act=dl-save]'); await toastHas(admin, 'Delay logged');
  ok(await admin.isVisible('text=Delayed 5 days'), 'address shows it is delayed');
  await admin.click('[data-act=open-delay]');
  await admin.uncheck('#dl-on');
  await admin.click('[data-act=dl-save]'); await toastHas(admin, 'Delay saved');
  ok(await admin.isVisible('[data-act=open-delay] >> text=Resolved'), 'delay can be closed off');
  await admin.click('.nav [data-tab=reports]');
  ok(await admin.isVisible('text=Days down to tenant or client'), 'Progress tab shows delay totals');
  ok((await fetch(BASE + '/templates/' + encodeURIComponent('CB Site App - Address Upload Template.xlsx'))).status === 200, 'address template is on the site');

  // ---------- survey PDF ----------
  await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=open-prop] >> text=14 Elm Grove');
  await admin.click('[data-act=open-survey]');
  await admin.setInputFiles('[data-photo-input=sec0]', 'public/icon-512.png');
  await admin.waitForSelector('[data-photos=sec0] img[data-act=view-photo]');
  await admin.click('[data-act=sv-submit]'); await toastHas(admin, 'Survey submitted');
  await admin.click('[data-act=open-survey]');
  const [dl] = await Promise.all([admin.waitForEvent('download', { timeout: 20000 }), admin.click('[data-act=sv-pdf]')]);
  const pdfPath = (SHOTS || '/tmp') + '/survey.pdf'; await dl.saveAs(pdfPath);
  const head = fs.readFileSync(pdfPath).subarray(0, 5).toString();
  ok(head === '%PDF-' && dl.suggestedFilename().includes('14 Elm Grove') && fs.statSync(pdfPath).size > 5000, 'survey downloads as a PDF with its photo');
  await admin.click('[data-act=close-sheet]');

  // ---------- survey questions: download, edit, upload, undo ----------
  const ExcelJS = (await import('exceljs')).default;
  await admin.click('.nav [data-tab=projects]');
  ok(await admin.isVisible('[data-act=q-scope][data-id=""]'), 'admin can change the company questions');
  await admin.click(`[data-act=q-scope][data-id="${leedsId}"]`);
  const [qdl] = await Promise.all([admin.waitForEvent('download'), admin.click('#sheet [data-act=q-template]')]);
  const qPath = (SHOTS || '/tmp') + '/questions.xlsx'; await qdl.saveAs(qPath);
  const wbq = new ExcelJS.Workbook(); await wbq.xlsx.readFile(qPath);
  const cq = wbq.getWorksheet('Current questions');
  let rowTenant, rowPets;
  cq.eachRow((r, n) => { if (r.getCell(1).value === 'c_tenant') rowTenant = n; if (r.getCell(1).value === 'c_pets') rowPets = n; });
  ok(rowTenant && rowPets && wbq.getWorksheet('How to use'), 'template lists the live questions');
  cq.getRow(rowTenant).getCell(4).value = 'Was the tenant home?';
  cq.getRow(rowPets).getCell(9).value = 'Remove';
  const nqs = wbq.getWorksheet('New questions');
  ['Kitchen', 'Services', 'Carbon monoxide alarm fitted?', 'Yes / No / N/A', '', 'No'].forEach((v, i) => { nqs.getRow(2).getCell(i + 1).value = v; });
  ['Kitchen', 'Extras', 'Bin store condition', 'Pick one', 'Good, Poor', 'Poor'].forEach((v, i) => { nqs.getRow(3).getCell(i + 1).value = v; });
  const goodPath = (SHOTS || '/tmp') + '/questions-edited.xlsx'; await wbq.xlsx.writeFile(goodPath);
  ['Bathroom', 'Layout', 'Bad flag question', 'Yes / No / N/A', '', 'Maybe'].forEach((v, i) => { nqs.getRow(4).getCell(i + 1).value = v; });
  const badPath = (SHOTS || '/tmp') + '/questions-bad.xlsx'; await wbq.xlsx.writeFile(badPath);

  await admin.setInputFiles('#q-upload', badPath);
  await admin.waitForSelector('text=Check the changes');
  ok(await admin.isVisible('text=thing to fix') && await admin.isDisabled('[data-act=q-apply]'), 'mistakes in the upload are listed and block saving');
  await admin.click('[data-act=close-sheet]');
  await admin.click(`[data-act=q-scope][data-id="${leedsId}"]`);
  await admin.setInputFiles('#q-upload', goodPath);
  await admin.waitForSelector('text=Check the changes');
  const preview = await admin.textContent('#sheet');
  ok(!preview.includes('Options changed'), 'options containing commas are read correctly');
  ok(preview.includes('Was the tenant home?') && preview.includes('Removed (1)') && preview.includes('Added (2)') && preview.includes('New section (1)'), 'preview shows every change before saving');
  await shot(admin, '16-questions-preview');
  await admin.click('[data-act=q-apply]'); await toastHas(admin, 'Survey questions updated');
  ok((await api('saveQuestions', { questions: {}, project_id: leedsId }, { authorization: 'Bearer ' + sTok })).ok === false, 'site team cannot change questions');
  ok((await api('saveQuestions', { questions: {}, project_id: leedsId }, { authorization: 'Bearer ' + pmTok })).ok === false, 'PM cannot change another PM\'s project questions');
  ok((await api('saveQuestions', { questions: {} }, { authorization: 'Bearer ' + pmTok })).ok === false, 'PM cannot change the company questions');
  const pmQ = (await api('data', {}, { authorization: 'Bearer ' + pmTok })).data;
  const defaults = new Function(fs.readFileSync('public/questions.js', 'utf8') + ';return DEFAULT_QUESTIONS')();
  const pmCur = (await api('currentQuestions', { project_id: pmQ.projects[0].id, fallback: defaults }, { authorization: 'Bearer ' + pmTok })).data;
  ok((await api('saveQuestions', { questions: pmCur, project_id: pmQ.projects[0].id }, { authorization: 'Bearer ' + pmTok })).ok === true, 'PM can save questions for their own project');
  await pmPage.reload(); await pmPage.waitForSelector('#vbody'); await pmPage.click('.nav [data-tab=projects]');
  ok(await pmPage.isVisible(`[data-act=q-scope][data-id="${pmQ.projects[0].id}"]`) && !(await pmPage.isVisible('[data-act=q-scope][data-id=""]')), 'PM can change questions on their own project only');

  await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=open-prop] >> text=12 Elm Grove');
  await admin.click('[data-act=new-survey]'); await admin.click('[data-act=pick-type][data-v=kitchen]');
  const form = await admin.textContent('#sv-form');
  ok(form.includes('Was the tenant home?') && !form.includes('Pets in the property?') && form.includes('Carbon monoxide alarm fitted?') && form.includes('Bin store condition'), 'new surveys use the uploaded questions');
  await admin.click('[data-act=close-sheet]');
  await admin.click('[data-act=back]');
  await admin.click('[data-act=open-prop] >> text=14 Elm Grove');
  await admin.click('[data-act=open-survey]');
  ok(await admin.isVisible('#sv-form >> text=Suspected asbestos seen in the work area?') && await admin.isVisible('[data-photos=sec0] img[data-act=view-photo]'), 'old survey keeps its answers and photos');
  await admin.click('[data-act=close-sheet]');
  await admin.click('[data-act=back]');
  await admin.click('[data-act=open-prop] >> text=3 Oak Road');
  await admin.click('[data-act=new-survey]'); await admin.click('[data-act=pick-type][data-v=kitchen]');
  ok((await admin.textContent('#sv-form')).includes('Was the tenant in?'), 'other projects keep the company questions');
  await admin.click('[data-act=close-sheet]');

  await admin.click('.nav [data-tab=projects]');
  await admin.click(`[data-act=q-scope][data-id="${leedsId}"]`);
  await admin.click('[data-act=q-undo]'); await admin.click('[data-act=q-undo]');
  await toastHas(admin, 'Previous questions put back');
  await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=open-prop] >> text=12 Elm Grove');
  await admin.click('[data-act=new-survey]'); await admin.click('[data-act=pick-type][data-v=kitchen]');
  ok((await admin.textContent('#sv-form')).includes('Was the tenant in?'), 'undo puts the original questions back');
  await admin.click('[data-act=close-sheet]');

  // ---------- bulk delete ----------
  const staffDel = await api('deleteProperties', { ids: [d0.projects[0].id] }, { authorization: 'Bearer ' + sTok });
  ok(staffDel.ok === false, 'site team cannot bulk delete');
  const pmDel = await api('deleteProperties', { ids: (await api('data', {}, { authorization: 'Bearer ' + tok })).data.properties.map(p => p.id) }, { authorization: 'Bearer ' + pmTok });
  ok(pmDel.ok === false, 'PM cannot delete another PM\'s addresses');
  await admin.reload(); await admin.waitForSelector('#vbody'); await admin.click('.nav [data-tab=addresses]');
  await admin.click('[data-act=scheme] >> text=Bradford Roofing 2026');
  await admin.click('[data-act=sel-start]');
  await admin.click('[data-act=sel-all]');
  await admin.click('[data-act=del-go]');
  ok((await admin.textContent('[data-act=del-go]')).includes('Tap again'), 'bulk delete asks to confirm');
  await admin.click('[data-act=del-go]');
  await toastHas(admin, 'Deleted 1 address');
  ok((await api('data', {}, { authorization: 'Bearer ' + tok })).data.properties.length === 2, 'project\'s addresses deleted, others kept');

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
