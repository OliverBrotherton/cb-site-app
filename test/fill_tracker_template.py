# Test helper: fills the blank tracker template the way a PM would. Usage: python3 fill_tracker_template.py <template> <out>
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1]); t = wb['Tracker']; ls = wb['Lists']
cols = [('Scaffold Elevation Erection', 'Date'), ('Scaffold Elevation Strike', 'Date'), ('Scaffold Handrail Strike', 'Date or N/A'), ('Contractors', 'Pick from list'),
        ('Visual Asbestos Check Against Scope', 'Yes / No'), ('Scaffold Notes', 'Pick from list (can add new)'), ('Window Cleaning', 'Pick from list'), ('CB Notes', 'Notes')]
for i, (h, ty) in enumerate(cols): t.cell(row=5, column=5 + i, value=h); t.cell(row=4, column=5 + i, value=ty)
for i, (s, g) in enumerate([('Surveyed', 'Not started'), ('WIP', 'In progress'), ('Works Complete', 'Complete'), ('Omitted', 'Left out of totals')]):
    ls.cell(row=4 + i, column=1, value=s); ls.cell(row=4 + i, column=2, value=g)
for i, s in enumerate(['Fold Croft', 'Canons Brook']): ls.cell(row=4 + i, column=3, value=s)
for c, (name, opts) in enumerate([('Contractors', ['Broadwall', 'Jaw']), ('Scaffold Notes', ['1 Lift Front Only', 'Back Only']), ('Window Cleaning', ['N/A', 'To be booked', 'Booked', 'Complete'])]):
    ls.cell(row=3, column=4 + c, value=name)
    for i, o in enumerate(opts): ls.cell(row=4 + i, column=4 + c, value=o)
wb.save(sys.argv[2])
