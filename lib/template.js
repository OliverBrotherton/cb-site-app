// Builds the styled Excel template for changing survey questions.
import ExcelJS from 'exceljs';
import { LOGO_PNG } from './logo.js';

export const TYPE_LABELS = { yn: 'Yes / No / N/A', choice: 'Pick one', multi: 'Tick all that apply', number: 'Number', text: 'Free text' };
const RED = 'FFCF1523', INK = 'FF202024', GREY = 'FF5E5E66', INPUT = 'FFFFF8DC', LINE = 'FFDEDEE2', SOFT = 'FFF4F4F6';
const F = (o = {}) => ({ name: 'Arial', size: 11, color: { argb: INK }, ...o });
const box = { top: { style: 'thin', color: { argb: LINE } }, left: { style: 'thin', color: { argb: LINE } }, bottom: { style: 'thin', color: { argb: LINE } }, right: { style: 'thin', color: { argb: LINE } } };

function header(ws, titles, widths) {
  ws.columns = widths.map(w => ({ width: w }));
  const row = ws.getRow(1); row.height = 32;
  titles.forEach((t, i) => { const c = row.getCell(i + 1); c.value = t; c.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }; c.alignment = { vertical: 'middle', wrapText: true }; c.border = box; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function buildQuestionsTemplate(q, works, scope) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Chas Berger Site App';
  const logo = wb.addImage({ base64: LOGO_PNG, extension: 'png' });

  // ---- How to use ----
  const g = wb.addWorksheet('How to use', { views: [{ showGridLines: false }] });
  g.columns = [{ width: 6 }, { width: 100 }];
  g.addImage(logo, { tl: { col: 0, row: 0 }, ext: { width: 230, height: 78 } });
  g.getCell('A5').value = scope ? `Survey questions: ${scope}` : 'Survey questions template'; g.getCell('A5').font = F({ size: 18, bold: true });
  g.getCell('A6').value = `The survey questions ${scope ? 'used on ' + scope : 'the app is using'} now (downloaded ${new Date().toLocaleDateString('en-GB')}). Change them here, then upload this file in the app for the same ${scope && scope !== 'Company questions (all projects)' ? 'project' : 'questions'}.`; g.getCell('A6').font = F({ color: { argb: GREY } });
  const steps = [
    'On the Current questions tab, change any wording, answer type, options or red-flag answer by typing straight into the yellow cells.',
    'To remove a question, pick Remove in the "Keep / Change / Remove" column. Removed questions stop appearing on new surveys. Surveys already done keep their answers.',
    'Picking Change is optional. The app spots any edits you make. Use the Notes column for anything you want to remember; the app ignores it.',
    'Answer options: separate them with semicolons, e.g. Good; Fair; Poor. Yes / No / N/A questions don\'t need options.',
    '"Flags red when answer is" must be one of that question\'s answers exactly, e.g. Yes or Poor. Leave it blank if no answer needs flagging.',
    'Add brand new questions on the New questions tab, one per row. For "All surveys", use the section Access & safety or Sign-off. For a work type, use an existing section name, or a new name to make a new section.',
    'Don\'t change the ID column or the tab names. The ID is how the app matches each row to its question.',
    'In the app: Projects tab > Survey questions > pick the project > Upload edited template. You\'ll see every change before anything is saved, and you can undo it afterwards.',
  ];
  steps.forEach((s, i) => { const r = 8 + i; g.getCell(`A${r}`).value = i + 1; g.getCell(`A${r}`).font = F({ size: 13, bold: true, color: { argb: RED } }); g.getCell(`A${r}`).alignment = { vertical: 'top' }; const c = g.getCell(`B${r}`); c.value = s; c.font = F({ size: 12 }); c.alignment = { wrapText: true, vertical: 'top' }; g.getRow(r).height = 18 * Math.max(1, Math.ceil(s.length / 95)); });
  const lr = 8 + steps.length + 1;
  g.getCell(`A${lr}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } }; g.getCell(`A${lr}`).border = box;
  g.getCell(`B${lr}`).value = 'Yellow cells are the ones you can change. Don\'t change the red heading row or the ID column.'; g.getCell(`B${lr}`).font = F({ italic: true, color: { argb: GREY } });
  g.getCell(`B${lr + 2}`).value = 'EXAMPLE of a new question (New questions tab)'; g.getCell(`B${lr + 2}`).font = F({ bold: true, color: { argb: GREY } });
  ['Survey:  Kitchen', 'Section:  Services', 'Question:  Carbon monoxide alarm fitted?', 'Answer type:  Yes / No / N/A', 'Answer options:  (leave blank for Yes / No / N/A, or e.g. Good; Fair; Poor)', 'Flags red when answer is:  No'].forEach((t, i) => { g.getCell(`B${lr + 3 + i}`).value = t; g.getCell(`B${lr + 3 + i}`).font = F(); });

  // ---- Current questions ----
  const typeList = '"' + Object.values(TYPE_LABELS).join(',') + '"';
  const ws = wb.addWorksheet('Current questions');
  header(ws, ['ID (don\'t change)', 'Survey', 'Section', 'Question', 'Answer type', 'Answer options', 'Flags red when answer is', 'Help text', 'Keep / Change / Remove', 'Notes (ignored by the app)'], [16, 18, 20, 52, 20, 40, 22, 34, 16, 34]);
  const secs = [['All surveys', q.COMMON], ...Object.entries(q.TEMPLATES).flatMap(([k, list]) => list.map(s => [works[k] || k, s])), ['All surveys', q.CLOSE]];
  let r = 2;
  for (const [survey, sec] of secs) for (const x of sec.qs) {
    if (x[6]) continue;
    const vals = [x[0], survey, sec.title, x[1], TYPE_LABELS[x[2]], x[2] === 'choice' || x[2] === 'multi' ? (x[3] || []).join('; ') : '', x[4] || '', x[5] || '', '', ''];
    vals.forEach((v, i) => {
      const c = ws.getRow(r).getCell(i + 1); c.value = v; c.border = box; c.alignment = { vertical: 'top', wrapText: true };
      const editable = i >= 3; c.font = F({ color: { argb: i === 0 ? GREY : i === 6 && v ? RED : INK }, size: i === 0 ? 9 : 11 });
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: editable ? INPUT : SOFT } };
    });
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [typeList] };
    ws.getCell(`I${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Keep,Change,Remove"'] };
    r++;
  }
  ws.autoFilter = { from: 'A1', to: `J${r - 1}` };

  // ---- New questions ----
  const nq = wb.addWorksheet('New questions');
  header(nq, ['Survey', 'Section', 'Question', 'Answer type', 'Answer options', 'Flags red when answer is', 'Help text', 'Why it\'s needed (ignored by the app)'], [18, 22, 52, 20, 40, 22, 34, 40]);
  const surveyList = '"All surveys,' + Object.keys(q.TEMPLATES).map(k => works[k] || k).join(',') + '"';
  for (let i = 2; i <= 101; i++) for (let c = 1; c <= 8; c++) {
    const cell = nq.getRow(i).getCell(c); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } }; cell.border = box; cell.font = F(); cell.alignment = { vertical: 'top', wrapText: true };
    if (c === 1) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [surveyList] };
    if (c === 4) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [typeList] };
  }
  return wb.xlsx.writeBuffer();
}
