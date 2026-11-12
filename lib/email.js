// Snag emails to contractors (and close-out notices to the PM), sent through Microsoft 365 (Graph) or any SMTP account.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const snagRef = s => 'SN-' + String(s.ref_no).padStart(4, '0');
// Who gets copied in: the PM and the site manager who raised it, never the main recipient twice
function copyList(to, ...emails) {
  const seen = new Set([String(to || '').toLowerCase()]); const out = [];
  for (const e of emails) { const k = String(e || '').trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(String(e).trim()); } }
  return out;
}
export const scaffRef = s => 'SC-' + String(s.ref_no).padStart(4, '0');
// Asbestos line for any email about work at an address
export function asbestosLine(p) {
  if (!p || !p.asb_status || p.asb_status === 'Not checked') return ['Asbestos', 'Not checked yet: ask the PM before disturbing anything'];
  if (p.asb_status === 'Asbestos present') return ['ASBESTOS', `PRESENT: ${p.asb_notes}${p.asb_impact ? ' (' + p.asb_impact + ')' : ''}. Do not disturb.`];
  if (p.asb_status === 'No survey available') return ['Asbestos', 'No survey available: ask the PM before disturbing anything'];
  return ['Asbestos', `None found${p.asb_ref ? ' (survey ' + p.asb_ref + ')' : ''}`];
}
const fmtDate = iso => iso ? new Date(iso + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

let transport;
export const sentLog = [];

const graphReady = env => !!(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.MAIL_FROM);
export function emailMethod(env) { return env.EMAIL_MODE === 'log' ? 'log' : graphReady(env) ? 'Microsoft 365' : env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS ? 'SMTP' : ''; }
export function emailReady(env) { return !!emailMethod(env); }

// "Chas Berger Snags <snags@chasberger.co.uk>" -> { name, address }
const parseAddr = s => { const m = String(s).match(/^\s*(.*?)\s*<([^>]+)>\s*$/); return m ? { name: m[1].replace(/^"|"$/g, ''), address: m[2].trim() } : { name: '', address: String(s).trim() }; };
const recip = a => ({ emailAddress: { address: a } });

let graphToken = { value: '', exp: 0 };
async function graphSend(env, msg, fetchFn = fetch) {
  if (graphToken.exp < Date.now() + 60000) {
    const r = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID.trim())}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.MS_CLIENT_ID.trim(), client_secret: env.MS_CLIENT_SECRET.trim(), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Microsoft sign-in failed: ' + (j.error_description || j.error || r.status));
    graphToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  }
  const from = parseAddr(env.MAIL_FROM);
  const message = {
    subject: msg.subject,
    body: { contentType: 'HTML', content: msg.html },
    toRecipients: [recip(msg.to)],
    ...(msg.cc && msg.cc.length ? { ccRecipients: [].concat(msg.cc).map(recip) } : {}),
    ...(msg.replyTo ? { replyTo: [recip(msg.replyTo)] } : {}),
    attachments: (msg.attachments || []).map(a => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.filename, contentType: a.contentType, contentBytes: Buffer.from(a.content).toString('base64') })),
  };
  const r = await fetchFn(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from.address)}/sendMail`, {
    method: 'POST', headers: { authorization: 'Bearer ' + graphToken.value, 'content-type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error('Microsoft 365 refused the email: ' + ((j.error && j.error.message) || r.status)); }
}
export const _test = { graphSend, parseAddr, reset: () => { graphToken = { value: '', exp: 0 }; } };

async function send(env, msg) {
  msg = { ...msg, subject: String(msg.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250) };
  if (Array.isArray(msg.cc) && !msg.cc.length) delete msg.cc;
  if (env.EMAIL_MODE === 'log') { sentLog.push(msg); return; }
  if (!emailReady(env)) throw new Error('Email isn\'t set up on the server yet');
  if (graphReady(env)) return graphSend(env, msg);
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default;
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: Number(env.SMTP_PORT) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, ...msg });
}

function layout(greeting, intro, lines, button, foot) {
  const text = `${greeting}\n\n${intro}\n\n${lines.map(([k, v]) => k + ': ' + v).join('\n')}\n\n${button ? button.label + ':\n' + button.url + '\n\n' : ''}${foot}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#202024;max-width:560px"><div style="border-top:5px solid #CF1523;padding-top:12px"><b style="color:#CF1523;font-size:18px">Chas</b> <span style="font-size:18px">Berger</span></div><p>${esc(greeting)}</p><p>${esc(intro)}</p><table style="border-collapse:collapse;font-size:15px">${lines.map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#5E5E66;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>${button ? `<p style="margin:22px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#CF1523;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(button.label)}</a></p>` : ''}<p style="white-space:pre-line">${esc(foot)}</p></div>`;
  return { text, html };
}

async function attachPhotos(store, paths, ref) {
  const out = [];
  for (const [i, p] of (paths || []).slice(0, 6).entries()) {
    try { const ph = await store.getPhoto(p); const ext = /pdf/.test(ph.type) || /\.pdf$/.test(p) ? 'pdf' : /png/.test(ph.type) ? 'png' : 'jpg'; out.push({ filename: `${ref}-${i + 1}.${ext}`, content: ph.buffer, contentType: /\.pdf$/.test(p) ? 'application/pdf' : ph.type }); } catch { /* skip missing photo */ }
  }
  return out;
}

// kind: 'new' | 'reopen'
export async function emailContractor(env, store, { snag, property, project, contractor, kind }) {
  const ref = snagRef(snag); const link = `${env.APP_URL || ''}/?c=${contractor.token}`;
  const lines = [['Ref', ref], ['Project', project ? project.name : ''], ['Address', `${property.address}, ${property.postcode}`], ['Where', snag.location], ['Problem', snag.title], ['Priority', snag.priority], ['Fix by', fmtDate(snag.due)], ['Notes', snag.notes], kind === 'reopen' ? ['Why it\'s reopened', snag.reopen_reason] : null, asbestosLine(property)].filter(l => l && l[1]);
  const intro = kind === 'reopen' ? 'This snag has been checked and sent back. Please go back and sort it.' : `A snag has been raised${project ? ' on ' + project.name : ''} for you to close out.`;
  const pm = project && project.pm_email;
  const { text, html } = layout(`Hi ${contractor.name},`, intro, lines, { label: 'Close it out with a photo', url: link }, `Photos are attached. No login needed, the button opens your snag list.\n\nThanks,\nChas Berger${pm ? '\n' + pm : ''}`);
  await send(env, {
    to: contractor.email, cc: copyList(contractor.email, pm, snag.raised_by_email), ...(pm ? { replyTo: pm } : {}),
    subject: `${kind === 'reopen' ? 'SENT BACK: ' : ''}Snag ${ref} - ${property.address}, ${property.postcode} - ${snag.title}`,
    text, html, attachments: await attachPhotos(store, snag.photos, ref),
  });
}

export async function emailPmClosedOut(env, store, { snag, property, project, contractor }) {
  const to = (project && project.pm_email) || snag.raised_by_email; if (!to) return;
  const ref = snagRef(snag);
  const lines = [['Ref', ref], ['Address', `${property.address}, ${property.postcode}`], ['Problem', snag.title], ['Closed out by', contractor.name], ['Their note', snag.fix_note]].filter(l => l[1]);
  const { text, html } = layout('Hi,', `${contractor.name} has closed out a snag. Check it and sign it off in the app.`, lines, { label: 'Open the app', url: env.APP_URL || '' }, 'Their photos are attached.');
  await send(env, { to, cc: copyList(to, snag.raised_by_email), subject: `Done - check it: ${ref} - ${property.address} - ${snag.title}`, text, html, attachments: await attachPhotos(store, snag.fix_photos, ref) });
}

// kind: 'new' | 'cancel'
// Wording for each kind of scaffold call-off
const SW = {
  strike: { title: 'Scaffold strike', on: 'Strike on', ask: "Please strike the scaffold at this address. Tap the button to confirm your date, then mark it struck with a photo when it's down.", btn: 'Confirm the strike date', cancel: 'Please leave the scaffold up.', done: 'struck', doneTitle: 'Scaffold struck', confirmTitle: 'Strike date confirmed', will: 'Will strike on', mark: 'Mark it struck', dueWas: 'Strike was due' },
  erect: { title: 'Scaffold erection', on: 'Erect on', ask: "Please put up the scaffold at this address. Tap the button to confirm your date, then mark it up with a photo and the handover certificate when it's done.", btn: 'Confirm the erection date', cancel: "Please don't put the scaffold up.", done: 'up', doneTitle: 'Scaffold up', confirmTitle: 'Erection date confirmed', will: 'Will put it up on', mark: 'Mark it up', dueWas: 'Erection was due' },
};
const sw = sc => SW[sc.kind === 'erect' ? 'erect' : 'strike'];

// kind: 'new' | 'cancel'
export async function emailScaffolder(env, store, { scaffold, property, project, contractor, kind }) {
  const ref = scaffRef(scaffold); const link = `${env.APP_URL || ''}/?c=${contractor.token}`; const w = sw(scaffold);
  const pm = project && project.pm_email;
  const lines = [['Ref', ref], ['Project', project ? project.name : ''], ['Address', `${property.address}, ${property.postcode}`], [w.on, fmtDate(scaffold.strike_date)], ['Notes', scaffold.notes], ['Checked before call-off', (scaffold.checks || []).join(', ')], ['Requested by', scaffold.requested_by], asbestosLine(property)].filter(l => l[1]);
  const cancel = kind === 'cancel';
  const intro = cancel ? `This ${w.title.toLowerCase()} has been CANCELLED. ${w.cancel}` : w.ask;
  const { text, html } = layout(`Hi ${contractor.name},`, intro, lines, cancel ? null : { label: w.btn, url: link }, `${cancel ? '' : 'No login needed, the button opens your list.\n\n'}Thanks,\nChas Berger${pm ? '\n' + pm : ''}`);
  await send(env, {
    to: contractor.email, cc: copyList(contractor.email, pm, scaffold.requested_by_email), ...(pm ? { replyTo: pm } : {}),
    subject: `${cancel ? 'CANCELLED: ' : ''}${w.title} ${ref} - ${property.address}, ${property.postcode} - ${fmtDate(scaffold.strike_date)}`,
    text, html, attachments: cancel ? [] : await attachPhotos(store, scaffold.photos, ref),
  });
}

// kind: 'confirm' | 'struck'
export async function emailPmScaffold(env, store, { scaffold, property, project, contractor, kind }) {
  const to = (project && project.pm_email) || scaffold.requested_by_email; if (!to) return;
  const ref = scaffRef(scaffold); const done = kind === 'struck'; const w = sw(scaffold); const erect = scaffold.kind === 'erect';
  const certs = (scaffold.cert_docs || []).length;
  const lines = [['Ref', ref], ['Address', `${property.address}, ${property.postcode}`], ['Scaffolder', contractor.name],
    done ? [erect ? 'Up' : 'Struck', 'Yes, photo attached'] : [w.will, fmtDate(scaffold.confirmed_date)],
    done && erect ? ['Handover certificate', certs ? 'Attached' : 'NOT SENT: get one before the scaffold is used'] : null,
    ['You asked for', fmtDate(scaffold.strike_date)], ['Their note', scaffold.scaff_note]].filter(l => l && l[1]);
  const { text, html } = layout('Hi,', done ? `${contractor.name} has ${erect ? 'put the scaffold up' : 'struck the scaffold'}.` : `${contractor.name} has confirmed the ${erect ? 'scaffold erection' : 'scaffold strike'}.`, lines, { label: 'Open the app', url: env.APP_URL || '' }, '');
  await send(env, { to, cc: copyList(to, scaffold.requested_by_email), subject: `${done ? w.doneTitle : w.confirmTitle}: ${ref} - ${property.address}`, text, html,
    attachments: done ? await attachPhotos(store, [...(scaffold.struck_photos || []), ...(scaffold.cert_docs || [])], ref) : [] });
}

function overdueBits(n, daysLate) { return { tag: n > 1 ? `CHASE ${n}` : 'OVERDUE', late: `${daysLate} working day${daysLate === 1 ? '' : 's'} overdue` }; }

export async function emailChaseSnag(env, store, { snag, property, project, contractor, n, daysLate }) {
  const ref = snagRef(snag); const link = `${env.APP_URL || ''}/?c=${contractor.token}`; const pm = project && project.pm_email;
  const { tag, late } = overdueBits(n, daysLate);
  const lines = [['Ref', ref], ['Address', `${property.address}, ${property.postcode}`], ['Where', snag.location], ['Problem', snag.title], ['Was due', fmtDate(snag.due)], ['Overdue', late], ['Chase', n === 1 ? 'First reminder' : `Reminder ${n}`], asbestosLine(property)].filter(l => l[1]);
  const { text, html } = layout(`Hi ${contractor.name},`, `This snag was due to be fixed by ${fmtDate(snag.due)} and hasn't been closed out yet. Please close it out with a photo as soon as possible, or reply to let us know when it'll be done.`, lines, { label: 'Close it out with a photo', url: link }, `We'll send a reminder every 5 working days until it's closed out.\n\nThanks,\nChas Berger${pm ? '\n' + pm : ''}`);
  await send(env, { to: contractor.email, cc: copyList(contractor.email, pm, snag.raised_by_email), ...(pm ? { replyTo: pm } : {}), subject: `${tag}: Snag ${ref} - ${property.address}, ${property.postcode} - ${snag.title}`, text, html });
}

export async function emailChaseScaffold(env, store, { scaffold, property, project, contractor, n, due, daysLate }) {
  const ref = scaffRef(scaffold); const link = `${env.APP_URL || ''}/?c=${contractor.token}`; const pm = project && project.pm_email;
  const { tag, late } = overdueBits(n, daysLate); const w = sw(scaffold); const erect = scaffold.kind === 'erect';
  const confirmed = scaffold.status === 'confirmed';
  const lines = [['Ref', ref], ['Address', `${property.address}, ${property.postcode}`], [confirmed ? 'You confirmed' : w.dueWas, fmtDate(due)], ['Overdue', late], ['Chase', n === 1 ? 'First reminder' : `Reminder ${n}`], asbestosLine(property)].filter(l => l[1]);
  const verb = erect ? 'put up' : 'struck', state = erect ? 'up' : 'struck', isDone = erect ? "it's up" : "it's down";
  const intro = confirmed ? `You confirmed this scaffold would be ${verb} on ${fmtDate(due)}, but it hasn't been marked as ${state} yet. If ${isDone}, please mark it ${state} with a photo${erect ? ' and the handover certificate' : ''}. If not, reply to let us know the new date.` : `This scaffold was due to be ${verb} on ${fmtDate(due)} and we haven't had a confirmation. Please confirm your date, or mark it ${state} with a photo if ${isDone}.`;
  const { text, html } = layout(`Hi ${contractor.name},`, intro, lines, { label: confirmed ? w.mark : w.btn, url: link }, `We'll send a reminder every 5 working days until it's ${state}.\n\nThanks,\nChas Berger${pm ? '\n' + pm : ''}`);
  await send(env, { to: contractor.email, cc: copyList(contractor.email, pm, scaffold.requested_by_email), ...(pm ? { replyTo: pm } : {}), subject: `${tag}: ${w.title} ${ref} - ${property.address}, ${property.postcode}`, text, html });
}
