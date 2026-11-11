# Builds public/templates/CB Works Tracker - Blank Template.xlsx from a filled Works Tracker (Oliver's original).
# Usage: python3 tools/make_tracker_template.py <original tracker.xlsx> <output.xlsx>
# Blank Works Tracker template: fixed Site / UPRN / Addresses / Status, then the project's own columns.
# Statuses are set per project on the Lists tab, each with what it "counts as", and the dashboard works from that.
import sys, copy
import openpyxl
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.styles import PatternFill, Font, Alignment, Border
from openpyxl.utils import get_column_letter as L

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src)
t, d, ls, h = wb['Tracker'], wb['Dashboard'], wb['Lists'], wb['How to Use']
LAST, LASTN, HELP = 'AN', 40, 'AO'      # data columns A:AN, hidden helper AO
WIDTH = 18
TYPES = ["Text", "Notes", "Date", "Date or N/A", "Yes / No", "Pick from list", "Pick from list (can add new)", "Number"]
GROUPS = ["Not started", "In progress", "Complete", "Left out of totals"]
def cp(dst, srcc):
    dst.font = copy.copy(srcc.font); dst.fill = copy.copy(srcc.fill); dst.border = copy.copy(srcc.border)
    dst.alignment = copy.copy(srcc.alignment); dst.number_format = srcc.number_format

# ---------------- Tracker ----------------
hdr, body = copy.copy(t['C5']), t['C6']
hdr_style, body_style = t['C5'], t['C6']
for colx in range(1, LASTN + 2):
    t.column_dimensions[L(colx)].width = WIDTH
    c = t.cell(row=5, column=colx); c.value = None; cp(c, hdr_style)
    for r in range(6, 256):
        x = t.cell(row=r, column=colx); x.value = None; cp(x, body_style)
        if colx not in (2, 3): x.number_format = 'dd/mm/yyyy'   # dates the app fills in show as dates
for i, name in enumerate(['Site', 'UPRN', 'Addresses', 'Status']): t.cell(row=5, column=i + 1, value=name)
t['F2'] = None
for ref in ('H2', 'J2', 'J3'): t[ref] = None
for r in (2, 3):
    for c in t[r]:
        if c.column >= 8: c.fill = PatternFill(fill_type=None); c.border = Border()
t.conditional_formatting = type(t.conditional_formatting)()
# Row 4: how each column is filled in
t.row_dimensions[4].height = 30
grey = Font(name='Arial', size=8, italic=True, color='5E5E66')
for i, v in enumerate(['Pick from list (can add new)', 'Filled in by the app', 'Filled in by the app', 'Pick from list']): t.cell(row=4, column=i + 1, value=v)
for colx in range(1, LASTN + 1):
    c = t.cell(row=4, column=colx); c.font = grey; c.alignment = Alignment(wrap_text=True, vertical='bottom', horizontal='center')
    c.fill = PatternFill('solid', fgColor='FFF8DC' if colx >= 5 else 'F4F4F6')
# Hidden helper: what each address's status counts as
hc = t[f'{HELP}5']; hc.value = 'Counts as (auto)'
for r in range(6, 256):
    t[f'{HELP}{r}'] = f'=IF(D{r}="","",IFERROR(INDEX(Lists!$B$4:$B$28,MATCH(D{r},Lists!$A$4:$A$28,0)),""))'
t.column_dimensions[HELP].hidden = True
# Drop-downs: Site and Status from the Lists tab, answer types in row 4
t.data_validations.dataValidation = []
def dv(rule, rng, **k):
    v = DataValidation(**rule, **k); t.add_data_validation(v); v.add(rng)
dv(dict(type='list', formula1='"' + ','.join(TYPES) + '"'), f'E4:{LAST}4', allow_blank=True, showInputMessage=True, promptTitle='Answer type',
   prompt='How is this column filled in? For lists, add a list with the same name as the heading on the Lists tab.')
dv(dict(type='list', formula1='OFFSET(Lists!$C$4,0,0,MAX(1,COUNTA(Lists!$C$4:$C$28)),1)'), 'A6:A255', allow_blank=True, showErrorMessage=True, errorStyle='warning')
dv(dict(type='list', formula1='OFFSET(Lists!$A$4,0,0,MAX(1,COUNTA(Lists!$A$4:$A$28)),1)'), 'D6:D255', allow_blank=True, showErrorMessage=True, errorStyle='stop',
   errorTitle='Status', error='Pick a status from the list. Add new statuses on the Lists tab.')
t.freeze_panes = 'E6'

# ---------------- Lists ----------------
hl, ol = ls['A3'], ls['A4']
for colx in range(1, 27):
    ls.column_dimensions[L(colx)].width = 24
    for r in range(3, 29):
        c = ls.cell(row=r, column=colx); c.value = None; cp(c, hl if r == 3 else ol)
ls['A3'], ls['B3'], ls['C3'] = 'Status', 'Counts as', 'Site'
ls['A1'] = ('Drop-down options. Status: your statuses, and next to each one what it counts as on the dashboard. '
            'Site: your sites or estates. For any other list, use exactly the same name as its column heading on the Tracker tab.')
v = DataValidation(type='list', formula1='"' + ','.join(GROUPS) + '"', allow_blank=True, showInputMessage=True, promptTitle='Counts as',
                   prompt='Not started, In progress, Complete, or Left out of totals (e.g. Omitted).')
ls.add_data_validation(v); v.add('B4:B28')

# ---------------- named columns ----------------
def col(name): return f'INDEX(Tracker!$A$6:${LAST}$255,0,MATCH("{name}",Tracker!$A$5:${LAST}$5,0))'
names = {
    'colSite': 'Tracker!$A$6:$A$255', 'colUPRN': 'Tracker!$B$6:$B$255', 'colAddr': 'Tracker!$C$6:$C$255', 'colStatus': 'Tracker!$D$6:$D$255',
    'colGroup': f'Tracker!${HELP}$6:${HELP}$255', 'colContractor': col('Contractors'),
    'colAsbCheck': col('Visual Asbestos Check Against Scope'), 'colAsbPresumed': col('Asbestos Presumed'),
    'colElevErect': col('Scaffold Elevation Erection'), 'colElevStrike': col('Scaffold Elevation Strike'), 'colHRStrike': col('Scaffold Handrail Strike'),
    'colWindows': col('Window Cleaning'),
    'listStatus': 'Lists!$A$4:$A$28', 'listGroup': 'Lists!$B$4:$B$28', 'listSite': 'Lists!$C$4:$C$28',
    'listContractor': 'INDEX(Lists!$A$4:$Z$28,0,MATCH("Contractors",Lists!$A$3:$Z$3,0))',
}
for n, val in names.items(): wb.defined_names[n] = DefinedName(n, attr_text=val)

# ---------------- Dashboard ----------------
LIVE = '((colGroup="Not started")+(colGroup="In progress"))'
STRIKE_PAST = '((((colElevStrike<TODAY())*ISNUMBER(colElevStrike))+IFERROR((colHRStrike<TODAY())*ISNUMBER(colHRStrike),0))>0)'
STRIKE_7 = '(((ISNUMBER(colElevStrike)*(colElevStrike>=TODAY())*(colElevStrike<=TODAY()+7))+IFERROR(ISNUMBER(colHRStrike)*(colHRStrike>=TODAY())*(colHRStrike<=TODAY()+7),0))>0)'
d['B7'] = '=COUNTIFS(colAddr,"<>",colGroup,"<>Left out of totals")'
d['C7'] = '=COUNTIF(colGroup,"Complete")'
d['E7'] = '=IFERROR(IF(B7=0,0,C7/B7),"–")'
d['G7'] = '=IFERROR(SUMPRODUCT(ISNUMBER(colElevErect)*(colElevErect<=TODAY())*(((colElevStrike="")+ISNUMBER(colElevStrike)*(colElevStrike>TODAY()))>0)),"–")'
d['J7'] = f'=IFERROR(SUMPRODUCT({LIVE}*{STRIKE_PAST}),"–")'
d['L7'] = f'=IFERROR(SUMPRODUCT((colAddr<>"")*(colGroup<>"Complete")*(colGroup<>"Left out of totals")*{STRIKE_7}),"–")'
d['N7'] = '=IFERROR(COUNTIF(colAsbCheck,"No"),"–")'
d['B8'] = ('Totals leave out statuses that count as "Left out of totals". Overdue = strike date passed and status counts as Not started or In progress. '
           'Scaffolds Up = elevation erected, not yet struck. Tiles show – until the tracker has the heading they need (see How to Use).')
# Status breakdown: 12 statuses (rows 12-23), then "No status set" (row 24)
row19 = [copy.copy(d.cell(row=19, column=cx)._style) for cx in range(2, 5)]
row20 = [copy.copy(d.cell(row=20, column=cx)._style) for cx in range(2, 5)]
for k in range(1, 13):
    r = 11 + k
    for cx in range(2, 5):
        if r >= 20: d.cell(row=r, column=cx)._style = copy.copy(row19[cx - 2])
    d[f'B{r}'] = f'=IF(INDEX(listStatus,{k})="","",INDEX(listStatus,{k}))'
    d[f'C{r}'] = f'=IF(B{r}="","",COUNTIF(colStatus,B{r}))'
    d[f'D{r}'] = f'=IF(B{r}="","",IF(INDEX(listGroup,{k})="Left out of totals","excl.",IF($B$7=0,0,C{r}/$B$7)))'
for cx in range(2, 5): d.cell(row=24, column=cx)._style = copy.copy(row20[cx - 2])
d['B24'] = 'No status set'; d['C24'] = '=COUNTIFS(colAddr,"<>",colStatus,"")'; d['D24'] = '=IF($B$7=0,0,C24/$B$7)'
for ch in d._charts:
    for s in ch.series:
        if s.cat is not None:
            for ref in (getattr(s.cat, 'strRef', None), getattr(s.cat, 'numRef', None)):
                if ref is not None: ref.f = "'Dashboard'!$B$12:$B$24"
        if s.val is not None and s.val.numRef is not None: s.val.numRef.f = "'Dashboard'!$C$12:$C$24"
# By site (rows 28-35) and by contractor (rows 40-45)
def table(first, n, lst, colname, wrap):
    for k in range(1, n + 1):
        r = first + k - 1; b = f'B{r}'
        d[b] = f'=IFERROR(IF(INDEX({lst},{k})="","",INDEX({lst},{k})),"")'
        f = {
            'C': f'COUNTIFS({colname},{b},colAddr,"<>",colGroup,"<>Left out of totals")',
            'D': f'COUNTIFS({colname},{b},colGroup,"Not started")',
            'E': f'COUNTIFS({colname},{b},colGroup,"In progress")',
            'F': f'COUNTIFS({colname},{b},colGroup,"Complete")',
            'G': f'IF(C{r}=0,0,F{r}/C{r})',
            'H': f'IFERROR(SUMPRODUCT(({colname}={b})*{LIVE}*{STRIKE_PAST}),"–")',
        }
        for cl, fx in f.items(): d[f'{cl}{r}'] = f'=IF({b}="","",IFERROR({fx},""))'
table(28, 8, 'listSite', 'colSite', False)
table(40, 6, 'listContractor', 'colContractor', True)
for r, (crit_col, val) in zip(range(28, 34), [('colAsbPresumed', 'Yes'), ('colAsbCheck', 'Yes'), ('colAsbCheck', 'No'), ('colWindows', 'To be booked'), ('colWindows', 'Booked'), ('colWindows', 'Complete')]):
    d[f'L{r}'] = f'=IFERROR(COUNTIF({crit_col},"{val}"),"–")'
d['B47'] = 'Statuses and sites come from the Lists tab, contractors from a list named Contractors. Add new ones there and they appear here automatically.'

# ---------------- How to Use ----------------
lab, txt = copy.copy(h['B3'].font), copy.copy(h['C3'].font)
for r in range(2, 60):
    for cx in (2, 3): h.cell(row=r, column=cx).value = None
h['B1'] = 'How to set up this tracker'
rows = [
    ('Fixed columns', 'Site, UPRN, Addresses and Status are always the first four columns. The app fills in UPRN and Addresses for every address on the project.'),
    ('Your columns', 'Type one heading per column in the dark row (row 5), from column E across. Up to 36 columns of your own.'),
    ('Answer type', 'In the yellow row above each heading (row 4), pick how it\'s filled in: Text, Notes, Date, Date or N/A, Yes / No, Pick from list, Pick from list (can add new), or Number.'),
    ('Lists', 'For "Pick from list", add a list on the Lists tab with exactly the same name as the heading, options underneath with no gaps. "Can add new" lets the site team type something not on the list.'),
    ('Statuses', 'On the Lists tab, type this project\'s statuses under Status (up to 12 show on the dashboard). Next to each one, under Counts as, pick Not started, In progress, Complete, or Left out of totals.'),
    ('Example statuses', 'Surveyed = Not started. Start Date Letter Sent = Not started. WIP = In progress. Snagging = In progress. Works Complete = Complete. Omitted = Left out of totals.'),
    ('Sites', 'On the Lists tab, type the project\'s sites or estates under Site. Leave it empty if there\'s only one.'),
    ('Columns', 'All columns start the same width. Make any wider if you need to.'),
    ('In the app', 'Upload this file under Projects > your project > Works tracker. Each heading becomes a box on every address, and the app keeps this spreadsheet up to date.'),
    ('', ''),
    ('Dashboard', 'Works itself out from the Tracker. Totals and % complete use what each status counts as. For the other tiles, use these headings exactly:'),
    ('Contractors', 'A list named Contractors gives the "By contractor" table.'),
    ('Scaffold dates', 'Scaffold Elevation Erection and Scaffold Elevation Strike (dates) give Scaffolds Up Now, Overdue Strikes and Strikes Due Next 7 Days. Scaffold Handrail Strike is included if you have it.'),
    ('Asbestos', 'Visual Asbestos Check Against Scope and Asbestos Presumed (Yes / No) give the asbestos counts.'),
    ('Window Cleaning', 'A list with To be booked, Booked, Complete gives the window cleaning counts.'),
    ('', ''),
    ('Size', 'Up to 250 addresses.'),
    ('Don\'t', 'Don\'t rename the tabs, move the first four columns, merge cells, or leave gaps between headings.'),
]
r = 3
for k, val in rows:
    a = h.cell(row=r, column=2, value=k or None); a.font = lab; a.alignment = Alignment(vertical='top', wrap_text=True)
    b = h.cell(row=r, column=3, value=val or None); b.font = txt; b.alignment = Alignment(vertical='top', wrap_text=True)
    h.row_dimensions[r].height = 15 * max(1, len(val) // 80 + 1) if val else 8
    r += 1
h.column_dimensions['C'].width = max(h.column_dimensions['C'].width or 0, 90)
wb.active = wb.sheetnames.index('Tracker')
wb.save(out)
print('saved')
