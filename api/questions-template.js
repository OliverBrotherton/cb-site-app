// Survey questions template, built from the questions the app is using right now.
import { getApp } from '../lib/instance.js';
import { buildQuestionsTemplate } from '../lib/template.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const { app } = getApp();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const questions = await app.rpc({ action: 'currentQuestions', payload: { fallback: body.questions, project_id: body.project_id } }, req.headers, '');
    const buf = await buildQuestionsTemplate(questions, body.works || {}, String(body.scope || '').slice(0, 120));
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="CB Site App - Survey Questions Template.xlsx"', 'Cache-Control': 'no-store' });
    res.end(Buffer.from(buf));
  } catch (e) {
    if (!e.status) console.error(e);
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.status ? e.message : 'The template couldn\'t be made. Try again.' }));
  }
}
