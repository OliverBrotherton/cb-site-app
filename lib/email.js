// Snag emails to contractors (and close-out notices to the PM), sent over SMTP.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const snagRef = s => 'SN-' + String(s.ref_no).padStart(4, '0');
const fmtDate = iso => iso ? new Date(iso + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

let transport;
export const sentLog = [];

export function emailReady(env) { return env.EMAIL_MODE === 'log' || !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS); }

async function send(env, msg) {
  if (env.EMAIL_MODE === 'log') { sentLog.push(msg); return; }
  if (!emailReady(env)) throw new Error('Email isn\'t set up on the server yet');
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
  for (const [i, p] of (paths || []).slice(0, 4).entries()) {
    try { const ph = await store.getPhoto(p); out.push({ filename: `${ref}-${i + 1}.jpg`, content: ph.buffer, contentType: ph.type }); } catch { /* skip missing photo */ }
  }
  return out;
}

// kind: 'new' | 'reopen'
export async function emailContractor(env, store, { snag, property, project, contractor, kind }) {
  const ref = snagRef(snag); const link = `${env.APP_URL || ''}/?c=${contractor.token}`;
  const lines = [['Ref', ref], ['Project', project ? project.name : ''], ['Address', `${property.address}, ${property.postcode}`], ['Where', snag.location], ['Problem', snag.title], ['Priority', snag.priority], ['Fix by', fmtDate(snag.due)], ['Notes', snag.notes], kind === 'reopen' ? ['Why it\'s reopened', snag.reopen_reason] : null].filter(l => l && l[1]);
  const intro = kind === 'reopen' ? 'This snag has been checked and sent back. Please go back and sort it.' : `A snag has been raised${project ? ' on ' + project.name : ''} for you to close out.`;
  const pm = project && project.pm_email;
  const { text, html } = layout(`Hi ${contractor.name},`, intro, lines, { label: 'Close it out with a photo', url: link }, `Photos are attached. No login needed, the button opens your snag list.\n\nThanks,\nChas Berger${pm ? '\n' + pm : ''}`);
  await send(env, {
    to: contractor.email, ...(pm && pm.toLowerCase() !== contractor.email.toLowerCase() ? { cc: pm, replyTo: pm } : {}),
    subject: `${kind === 'reopen' ? 'SENT BACK: ' : ''}Snag ${ref} - ${property.address}, ${property.postcode} - ${snag.title}`,
    text, html, attachments: await attachPhotos(store, snag.photos, ref),
  });
}

export async function emailPmClosedOut(env, store, { snag, property, project, contractor }) {
  if (!project || !project.pm_email) return;
  const ref = snagRef(snag);
  const lines = [['Ref', ref], ['Address', `${property.address}, ${property.postcode}`], ['Problem', snag.title], ['Closed out by', contractor.name], ['Their note', snag.fix_note]].filter(l => l[1]);
  const { text, html } = layout('Hi,', `${contractor.name} has closed out a snag. Check it and sign it off in the app.`, lines, { label: 'Open the app', url: env.APP_URL || '' }, 'Their photos are attached.');
  await send(env, { to: project.pm_email, subject: `Done - check it: ${ref} - ${property.address} - ${snag.title}`, text, html, attachments: await attachPhotos(store, snag.fix_photos, ref) });
}
