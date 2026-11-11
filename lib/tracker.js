// Works tracker: reads a project's tracker template (columns, lists, statuses) and fills it in with live data.
// The template is the PM's own Excel file in the CB Works Tracker format: Site, UPRN, Addresses, Status, then their columns.
// Files are read and written directly (zip + XML) so the dashboard, chart and formatting are kept exactly.
import JSZip from 'jszip';

export const FIRST_ROW = 6, LAST_ROW = 255, MAX_ROWS = LAST_ROW - FIRST_ROW + 1;
const LAST_COL = 40; // AN
export const TYPES = { 'text': 'text', 'notes': 'notes', 'date': 'date', 'date or n/a': 'date_na', 'yes / no': 'yn', 'yes/no': 'yn', 'pick from list': 'pick', 'pick from list (can add new)': 'pick_add', 'number': 'number' };
export const TYPE_LABELS = { text: 'Text', notes: 'Notes', date: 'Date', date_na: 'Date or N/A', yn: 'Yes / No', pick: 'Pick from list', pick_add: 'Pick from list (can add new)', number: 'Number' };
export const GROUPS = ['Not started', 'In progress', 'Complete', 'Left out of totals'];

export const colLetter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colNum = l => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'col';
const unXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const texts = xml => (xml.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map(t => unXml(t.replace(/<t\b[^>]*>|<\/t>/g, ''))).join('');

async function sheetPath(zip, name) {
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const tag = new RegExp(`<sheet\\b[^>]*name="${name}"[^>]*>`).exec(wbXml); if (!tag) return null;
  const rid = /r:id="([^"]+)"/.exec(tag[0])[1];
  const target = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(rels)[0].match(/Target="([^"]+)"/)[1];
  return target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
}

// Text of every cell in rows from..to of a sheet: Map of "A5" -> "Status"
async function readCells(zip, name, from, to) {
  const path = await sheetPath(zip, name); if (!path) return null;
  const xml = await zip.file(path).async('string');
  const ssFile = zip.file('xl/sharedStrings.xml');
  const shared = ssFile ? ((await ssFile.async('string')).match(/<si>[\s\S]*?<\/si>/g) || []).map(texts) : [];
  const out = new Map(); const re = /<row\b[^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g; let m;
  while ((m = re.exec(xml))) {
    const r = Number(m[1]); if (r < from || r > to || !m[2]) continue;
    for (const c of m[2].match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c)[1]; const t = (/\bt="([^"]+)"/.exec(c) || [])[1];
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] || '';
      else if (t === 'inlineStr') val = texts(c);
      else if (v != null) val = unXml(v);
      if (val !== '') out.set(ref, val);
    }
  }
  return out;
}

// Which group a column shows under in the app
export function groupFor(name, type) {
  const n = name.toLowerCase();
  if (/asbestos/.test(n)) return 'Asbestos';
  if (/scaffold|handrail/.test(n)) return 'Scaffold';
  if (/roof|fascia|soffit|gutter|felt/.test(n)) return 'Roof';
  if (/window|door|glaz/.test(n)) return 'Windows & doors';
  if (/kitchen|bath/.test(n)) return 'Kitchen & bathroom';
  if (/contractor|subby|operative/.test(n)) return 'Contractors';
  if (type === 'notes' || /notes?$|info|comments?$/.test(n)) return 'Notes';
  return 'Other';
}

// Reads an uploaded tracker. Returns { config, problems }; config is null if it can't be used.
export async function readTracker(buffer, previous) {
  const problems = []; let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch (e) { return { config: null, problems: ['That file couldn\'t be opened. Save it as .xlsx and try again.'] }; }
  const tc = zip.file('xl/workbook.xml') ? await readCells(zip, 'Tracker', 4, 5) : null;
  const lc = zip.file('xl/workbook.xml') ? await readCells(zip, 'Lists', 3, 28) : null;
  if (!tc || !lc) return { config: null, problems: ['This isn\'t the Works Tracker template (it needs a Tracker tab and a Lists tab). Download the blank template and start from that.'] };
  const T = (c, r) => clean(tc.get(colLetter(c) + r) || '', 120), Lv = (c, r) => clean(lc.get(colLetter(c) + r) || '');
  ['Site', 'UPRN', 'Addresses', 'Status'].forEach((name, i) => {
    if (T(i + 1, 5).toLowerCase() !== name.toLowerCase()) problems.push(`Column ${colLetter(i + 1)} in row 5 must be "${name}". Don't move the first four columns.`);
  });
  // Lists: row 3 names, options below
  const lists = {}, listCol = {};
  for (let c = 1; c <= 26; c++) {
    const name = Lv(c, 3); if (!name) continue;
    const opts = []; for (let r = 4; r <= 28; r++) { const v = Lv(c, r); if (v) opts.push(v); }
    lists[name.toLowerCase()] = opts; listCol[name.toLowerCase()] = colLetter(c);
  }
  // Statuses with what they count as
  const statuses = [];
  for (let r = 4; r <= 28; r++) {
    const name = Lv(1, r); if (!name) continue;
    const g = Lv(2, r); const group = GROUPS.find(x => x.toLowerCase() === g.toLowerCase());
    if (!group) problems.push(`Lists tab, status "${name}": pick what it counts as (${GROUPS.join(', ')}).`);
    if (statuses.some(s => s.name.toLowerCase() === name.toLowerCase())) problems.push(`Status "${name}" is listed twice.`);
    statuses.push({ name, group: group || 'In progress' });
  }
  if (!statuses.length) problems.push('Add the project\'s statuses on the Lists tab, under Status, with what each one counts as.');
  const sites = lists['site'] || [];
  // The project's own columns, from E. Keys stay the same for a heading, so answers survive re-uploads.
  const fields = [], seen = new Set();
  const prevKeys = new Map((previous?.fields || []).map(f => [f.name.toLowerCase(), f.key]));
  for (let c = 5; c <= LAST_COL; c++) {
    const name = T(c, 5), typeText = T(c, 4).toLowerCase();
    if (!name) { if (typeText) problems.push(`Column ${colLetter(c)} has an answer type but no heading.`); continue; }
    if (seen.has(name.toLowerCase())) { problems.push(`The heading "${name}" is used twice.`); continue; }
    seen.add(name.toLowerCase());
    const type = TYPES[typeText];
    if (!type) { problems.push(`"${name}" (column ${colLetter(c)}): pick its answer type in the yellow row above it.`); continue; }
    let key = prevKeys.get(name.toLowerCase()) || slug(name); while (fields.some(f => f.key === key)) key += '_';
    const f = { key, name, type, col: colLetter(c), group: groupFor(name, type) };
    if (type === 'pick' || type === 'pick_add') {
      const opts = lists[name.toLowerCase()];
      if (!opts) problems.push(`"${name}" is a pick-from-list column, but there's no list called "${name}" on the Lists tab.`);
      else if (!opts.length) problems.push(`The "${name}" list on the Lists tab is empty.`);
      f.options = opts || []; f.listCol = listCol[name.toLowerCase()];
    }
    fields.push(f);
  }
  if (!fields.length) problems.push('There are no columns of your own yet. Add headings in row 5 from column E across.');
  const config = { fields, statuses, sites };
  return { config: problems.length ? null : config, problems };
}

// What changes between the current set-up and a new one, in plain words
export function describeChanges(oldC, newC) {
  const out = [];
  const o = new Map((oldC?.fields || []).map(f => [f.key, f])), n = new Map(newC.fields.map(f => [f.key, f]));
  for (const f of newC.fields) {
    const was = o.get(f.key);
    if (!was) out.push(['New column', `${f.name} (${TYPE_LABELS[f.type]})`]);
    else {
      if (was.type !== f.type) out.push(['Answer type changed', `${f.name}: ${TYPE_LABELS[was.type]} → ${TYPE_LABELS[f.type]}`]);
      if ((was.options || []).join('|') !== (f.options || []).join('|')) out.push(['List changed', `${f.name}: ${(f.options || []).join(', ')}`]);
    }
  }
  for (const f of oldC?.fields || []) if (!n.has(f.key)) out.push(['Column removed', `${f.name} (answers already filled in are kept)`]);
  const os = (oldC?.statuses || []).map(s => `${s.name}=${s.group}`).join('|'), ns = newC.statuses.map(s => `${s.name}=${s.group}`).join('|');
  if (os !== ns) out.push(['Statuses', newC.statuses.map(s => `${s.name} (${s.group})`).join(', ')]);
  if ((oldC?.sites || []).join('|') !== newC.sites.join('|')) out.push(['Sites', newC.sites.join(', ') || 'None']);
  return out;
}

// Checks one tracker answer; returns the value to save, or throws with a plain message
export function checkValue(f, v) {
  v = String(v ?? '').trim();
  if (!v) return '';
  const bad = m => { throw Object.assign(new Error(`${f.name}: ${m}`), { status: 400 }); };
  switch (f.type) {
    case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) bad('pick a date'); return v;
    case 'date_na': if (/^n\/?a$/i.test(v)) return 'N/A'; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) bad('pick a date, or N/A'); return v;
    case 'yn': { const m = ['Yes', 'No'].find(x => x.toLowerCase() === v.toLowerCase()); if (!m) bad('answer Yes or No'); return m; }
    case 'pick': { const m = (f.options || []).find(x => x.toLowerCase() === v.toLowerCase()); if (!m) bad(`pick one of: ${(f.options || []).join(', ')}`); return m; }
    case 'pick_add': { const m = (f.options || []).find(x => x.toLowerCase() === v.toLowerCase()); return m || v.slice(0, 200); }
    case 'number': if (!/^-?\d+(\.\d+)?$/.test(v)) bad('enter a number'); return v;
    case 'notes': return v.slice(0, 4000);
    default: return v.slice(0, 500);
  }
}

// ---------- filling in the spreadsheet ----------
const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
function cellXml(ref, style, v, kind) {
  const s = style ? ` s="${style}"` : '';
  if (v === '' || v == null) return `<c r="${ref}"${s}/>`;
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${ref}"${s}><v>${serial(v)}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}
function splitRows(sheet) {
  const start = sheet.indexOf('<sheetData'); const open = sheet.indexOf('>', start) + 1;
  if (sheet.slice(start, open).endsWith('/>')) return { head: sheet.slice(0, start) + '<sheetData>', rows: new Map(), tail: '</sheetData>' + sheet.slice(open) };
  const end = sheet.indexOf('</sheetData>');
  const body = sheet.slice(open, end); const rows = new Map();
  const re = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g; let m;
  while ((m = re.exec(body))) rows.set(Number(/\br="(\d+)"/.exec(m[0])[1]), m[0]);
  return { head: sheet.slice(0, open), rows, tail: sheet.slice(end) };
}
function rowCells(rowXml) {
  const cells = new Map(); const re = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g; let m;
  while ((m = re.exec(rowXml || ''))) { const ref = /\br="([A-Z]+)\d+"/.exec(m[0]); if (ref) cells.set(ref[1], m[0]); }
  return cells;
}
const styleOf = c => (c && /\bs="(\d+)"/.exec(c) || [])[1];
function buildRow(r, oldRow, values, kinds, fallbackStyles) {
  const old = rowCells(oldRow); const openTag = oldRow ? /^<row\b[^>]*?(?=\/?>)/.exec(oldRow)[0] : `<row r="${r}"`;
  const cols = new Set([...old.keys(), ...Object.keys(values)]);
  const out = [...cols].sort((a, b) => colNum(a) - colNum(b)).map(col =>
    col in values ? cellXml(col + r, styleOf(old.get(col)) || fallbackStyles[col], values[col], kinds[col]) : old.get(col));
  return `${openTag}>${out.join('')}</row>`;
}

// rows: [{ site, uprn, address, status, values: { key: value } }]
export async function fillTracker(templateBuffer, config, { projectName, rows }) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const path = await sheetPath(zip, 'Tracker'); if (!path) throw new Error('No Tracker tab');
  let sheet = await zip.file(path).async('string');
  const { head, rows: existing, tail } = splitRows(sheet);
  const kinds = { A: 'text', B: 'text', C: 'text', D: 'text' };
  for (const f of config.fields) kinds[f.col] = f.type === 'date' || f.type === 'date_na' ? 'date' : 'text';
  const rowStyles = Object.fromEntries([...rowCells(existing.get(FIRST_ROW))].map(([k, v]) => [k, styleOf(v)]));
  for (let i = 0; i < MAX_ROWS; i++) {
    const r = FIRST_ROW + i, d = rows[i];
    const values = { A: d ? d.site : '', B: d ? d.uprn : '', C: d ? d.address : '', D: d ? d.status : '' };
    for (const f of config.fields) values[f.col] = d ? (d.values[f.key] ?? '') : '';
    existing.set(r, buildRow(r, existing.get(r), values, kinds, rowStyles));
  }
  existing.set(2, buildRow(2, existing.get(2), { F: projectName || '' }, { F: 'text' }, {}));
  sheet = head + [...existing.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]).join('') + tail;
  // Drop-downs and date checks for the project's own columns (replacing any from an earlier download)
  const rng = col => `${col}${FIRST_ROW}:${col}${LAST_ROW}`;
  const mine = new Set(config.fields.map(f => rng(f.col)));
  sheet = sheet.replace(/<dataValidation\b[^>]*sqref="([^"]+)"[^>]*>[\s\S]*?<\/dataValidation>/g, (m, sq) => mine.has(sq) ? '' : m);
  const list = c => `OFFSET(Lists!$${c}$4,0,0,MAX(1,COUNTA(Lists!$${c}$4:$${c}$28)),1)`;
  const dv = config.fields.map(f => {
    const top = `${f.col}${FIRST_ROW}`;
    const rule = {
      date: ['date', '', 'greaterThan', '1', 'Pick a date (dd/mm/yyyy).'],
      date_na: ['custom', '', '', `OR(${top}="N/A",ISNUMBER(${top}))`, 'Type a date (dd/mm/yyyy) or N/A.'],
      yn: ['list', '', '', '"Yes,No"', 'Pick Yes or No.'],
      pick: ['list', '', '', f.listCol ? list(f.listCol) : '""', 'Pick from the list. Add options on the Lists tab.'],
      pick_add: ['list', 'warning', '', f.listCol ? list(f.listCol) : '""', 'That isn\'t on the list. Keep it anyway?'],
      number: ['decimal', '', 'between', '-1000000000', 'Enter a number.', '1000000000'],
    }[f.type];
    if (!rule) return '';
    const [type, style, op, f1, msg, f2] = rule;
    return `<dataValidation type="${type}"${style ? ` errorStyle="${style}"` : ''}${op ? ` operator="${op}"` : ''} allowBlank="1" showErrorMessage="1" error="${xmlEsc(msg)}" sqref="${rng(f.col)}"><formula1>${xmlEsc(f1)}</formula1>${f2 ? `<formula2>${f2}</formula2>` : ''}</dataValidation>`;
  }).join('');
  if (/<dataValidations\b/.test(sheet)) {
    sheet = sheet.replace(/(<dataValidations\b[^>]*>)([\s\S]*?)<\/dataValidations>/, (m, o, inner) => {
      const all = inner + dv; const n = (all.match(/<dataValidation\b/g) || []).length;
      return o.replace(/count="\d+"/, `count="${n}"`) + all + '</dataValidations>';
    });
  } else if (dv) {
    const n = (dv.match(/<dataValidation\b/g) || []).length;
    sheet = sheet.replace(/(<hyperlinks\b|<printOptions\b|<pageMargins\b|<\/worksheet>)/, `<dataValidations count="${n}">${dv}</dataValidations>$1`);
  }
  zip.file(path, sheet);
  // Make Excel work the dashboard out when the file opens
  let w = await zip.file('xl/workbook.xml').async('string');
  if (/<calcPr\b/.test(w)) w = w.replace(/<calcPr\b([^>]*?)\/?>/, (m, a) => `<calcPr${a.replace(/\s*fullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`);
  else w = w.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/workbook.xml', w);
  zip.remove('xl/calcChain.xml');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
