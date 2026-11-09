// Checks a set of survey questions before it's saved, so a bad upload can't break the surveys.
const TYPES = ['yn', 'choice', 'multi', 'text', 'number'];
const WORK_KEYS = ['kitchen', 'bathroom', 'windows', 'roofing', 'external', 'structural'];
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function checkQuestions(q) {
  const bad = m => { throw Object.assign(new Error(m), { status: 400 }); };
  if (!q || typeof q !== 'object') bad('No questions sent');
  const ids = new Set(); let count = 0;
  const section = (s, where) => {
    if (!s || typeof s !== 'object' || !Array.isArray(s.qs)) bad(`${where}: section is missing its questions`);
    const title = clean(s.title, 80); if (!title) bad(`${where}: a section has no name`);
    const qs = s.qs.map(x => {
      if (!Array.isArray(x)) bad(`${where} > ${title}: a question is the wrong shape`);
      const [id, label, type, opts, flag, help, retired] = x;
      if (!/^[a-z0-9_]{1,30}$/.test(id || '')) bad(`${where} > ${title}: a question has a bad ID`);
      if (ids.has(id)) bad(`Question ID ${id} is used twice`); ids.add(id);
      if (!TYPES.includes(type)) bad(`"${clean(label, 60)}" has an answer type the app doesn't know`);
      const l = clean(label, 200); if (!l) bad(`${where} > ${title}: a question has no wording`);
      const o = Array.isArray(opts) ? opts.map(v => clean(v, 80)).filter(Boolean).slice(0, 20) : null;
      if ((type === 'choice' || type === 'multi') && (!o || o.length < 2)) bad(`"${l}" needs at least 2 answer options`);
      const f = flag ? clean(flag, 80) : null;
      const allowed = type === 'yn' ? ['Yes', 'No', 'N/A'] : o || [];
      if (f && !allowed.includes(f)) bad(`"${l}": the red-flag answer "${f}" isn't one of its options`);
      if (++count > 800) bad('Too many questions');
      return [id, l, type, type === 'choice' || type === 'multi' ? o : null, f, help ? clean(help, 200) : null, retired ? 1 : 0];
    });
    const key = /^[a-z0-9_]{1,20}$/i.test(s.key || '') ? s.key : undefined;
    const keyBy = s.keyBy && typeof s.keyBy === 'object' ? Object.fromEntries(Object.entries(s.keyBy).filter(([k, v]) => WORK_KEYS.includes(k) && /^[a-z0-9_]{1,20}$/i.test(v))) : undefined;
    return { title, qs, ...(key ? { key } : {}), ...(keyBy ? { keyBy } : {}) };
  };
  const out = { COMMON: section(q.COMMON, 'All surveys'), CLOSE: section(q.CLOSE, 'All surveys'), TEMPLATES: {} };
  for (const k of WORK_KEYS) {
    const list = (q.TEMPLATES || {})[k];
    if (!Array.isArray(list)) bad(`The ${k} survey is missing`);
    out.TEMPLATES[k] = list.slice(0, 30).map(s => section(s, k));
  }
  return out;
}
