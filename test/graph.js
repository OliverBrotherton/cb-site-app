// Checks the Microsoft 365 (Graph) email request without contacting Microsoft.
import { _test } from '../lib/email.js';
const calls = [];
const fake = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => url.includes('/token') ? { access_token: 'tok123', expires_in: 3600 } : {} }; };
const env = { MS_TENANT_ID: 'tenant-1', MS_CLIENT_ID: 'client-1', MS_CLIENT_SECRET: 'secret', MAIL_FROM: 'Chas Berger Snags <snags@chasberger.co.uk>' };
await _test.graphSend(env, { to: 'a@sub.co.uk', cc: 'pm@chasberger.co.uk', replyTo: 'pm@chasberger.co.uk', subject: 'Snag SN-0001', html: '<p>Hi</p>', attachments: [{ filename: 'SN-0001-1.jpg', contentType: 'image/jpeg', content: Buffer.from('jpegbytes') }] }, fake);
await _test.graphSend(env, { to: 'b@sub.co.uk', subject: 'Second', html: 'x' }, fake);
const send = JSON.parse(calls[1].opts.body);
const checks = [
  [calls[0].url === 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token', 'gets a token from the right tenant'],
  [String(calls[0].opts.body).includes('grant_type=client_credentials') && String(calls[0].opts.body).includes('graph.microsoft.com%2F.default'), 'uses app-only sign-in'],
  [calls[1].url === 'https://graph.microsoft.com/v1.0/users/snags%40chasberger.co.uk/sendMail', 'sends as the snags mailbox'],
  [calls[1].opts.headers.authorization === 'Bearer tok123', 'uses the token'],
  [send.message.toRecipients[0].emailAddress.address === 'a@sub.co.uk' && send.message.ccRecipients[0].emailAddress.address === 'pm@chasberger.co.uk' && send.message.replyTo[0].emailAddress.address === 'pm@chasberger.co.uk', 'to, cc and reply-to set'],
  [send.message.attachments[0].contentBytes === Buffer.from('jpegbytes').toString('base64') && send.message.attachments[0]['@odata.type'] === '#microsoft.graph.fileAttachment', 'photo attached'],
  [send.saveToSentItems === true, 'copy kept in the mailbox Sent folder'],
  [calls.length === 3 && !calls[2].url.includes('/token'), 'token reused for the next email'],
  [!JSON.parse(calls[2].opts.body).message.ccRecipients, 'no cc when none given'],
];
let bad = 0; for (const [c, m] of checks) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; }
process.exit(bad ? 1 : 0);
