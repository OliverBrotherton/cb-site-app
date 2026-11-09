import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.drawing.image import Image

import os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "templates") + "/"
# Survey questions come straight from the app, so the template always matches it
q = subprocess.run(["node", "-e", "const fs=require('fs');const src=fs.readFileSync(process.argv[1],'utf8');const f=new Function('S',src+';return {WORKS,COMMON,TEMPLATES,CLOSE}');console.log(JSON.stringify(f({})))", os.path.join(ROOT, "public", "questions.js")], capture_output=True, text=True, check=True).stdout
RED, INK, GREY, PALE, INPUT = "CF1523", "202024", "5E5E66", "F4F4F6", "FFF8DC"
F = "Arial"
thin = Side(style="thin", color="DEDEE2")
box = Border(left=thin, right=thin, top=thin, bottom=thin)

def font(**k):
    k.setdefault("name", F); k.setdefault("size", 11); return Font(**k)

def logo(ws, anchor="A1"):
    img = Image(os.path.join(HERE, "logo.png")); img.width, img.height = 230, 78
    ws.add_image(img, anchor)

def header(ws, row, titles, widths):
    for i, (t, w) in enumerate(zip(titles, widths), 1):
        c = ws.cell(row=row, column=i, value=t)
        c.font = font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=RED)
        c.alignment = Alignment(vertical="center", wrap_text=True); c.border = box
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[row].height = 30

def inputs(ws, r1, r2, ncol):
    for r in range(r1, r2 + 1):
        for col in range(1, ncol + 1):
            c = ws.cell(row=r, column=col)
            c.fill = PatternFill("solid", fgColor=INPUT); c.border = box; c.font = font()
            c.alignment = Alignment(vertical="top", wrap_text=True)

def guide(ws, title, intro, steps, start=6):
    logo(ws)
    ws.column_dimensions["A"].width = 6; ws.column_dimensions["B"].width = 100
    ws["A5"] = title; ws["A5"].font = font(size=18, bold=True, color=INK)
    ws["A6"] = intro; ws["A6"].font = font(color=GREY); ws["A6"].alignment = Alignment(wrap_text=False)
    r = start + 2
    for n, s in enumerate(steps, 1):
        ws.cell(row=r, column=1, value=n).font = font(size=13, bold=True, color=RED)
        ws.cell(row=r, column=1).alignment = Alignment(vertical="top")
        c = ws.cell(row=r, column=2, value=s); c.font = font(size=12); c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 18 * max(1, (len(s) // 95) + 1)
        r += 1
    ws.sheet_view.showGridLines = False
    return r + 1

def legend(ws, r):
    a = ws.cell(row=r, column=1); a.fill = PatternFill("solid", fgColor=INPUT); a.border = box
    b = ws.cell(row=r, column=2, value="Yellow cells are the ones you fill in. Don't change the red heading row."); b.font = font(italic=True, color=GREY)
    return r + 2

def example(ws, r, titles, row, cols=None):
    ws.cell(row=r, column=2, value="EXAMPLE - how a filled-in row looks (don't type on this tab)").font = font(bold=True, color=GREY)
    r += 1
    for i, t in enumerate(titles):
        ws.cell(row=r + i, column=2, value=f"{t}:  {row[i]}").font = font(color=INK)
    return r + len(titles) + 1

# ---------------- 1. Address upload ----------------
wb = Workbook()
g = wb.active; g.title = "How to use"
A_TITLES = ["UPRN / Property ref", "Address", "Postcode", "Work planned", "Access notes"]
r = guide(g, "Address upload template",
    "Fill this in, save it, and upload it in the Site App to add hundreds of addresses in one go.",
    ["Go to the Addresses tab (bottom of this file) and put one property per row, starting on row 2.",
     "Address = house or flat number, street and town, e.g. \"Flat 3, 22 High Street, Bradford\". Put the postcode in its own column.",
     "UPRN / Property ref is optional but recommended. Copy it straight from the client's schedule.",
     "Work planned: pick from the drop-down. For more than one, type them with a semicolon, e.g. \"Kitchen; Bathroom\". Leave it blank to choose the work in the app instead.",
     "Access notes are optional: key safe location, best times to call, tenant needs. Contractors on the job can see these too, so no key safe codes.",
     "Save the file as .xlsx. Keep the column headings and the tab name 'Addresses' as they are.",
     "In the app: Addresses > Add addresses > Upload the Excel template. Pick the project, check the list it shows you, then tap Add.",
     "Addresses already in the app are skipped automatically, so it's safe to upload an updated list."])
r = legend(g, r)
example(g, r, A_TITLES, ["100023456789", "12 Elm Grove, Headingley, Leeds", "LS6 2AB", "Kitchen; Bathroom", "Tenant works nights, call after 12pm"])

ws = wb.create_sheet("Addresses")
header(ws, 1, A_TITLES, [22, 48, 13, 28, 50])
inputs(ws, 2, 1001, 5)
for r_ in range(2, 1002):
    ws.cell(row=r_, column=1).number_format = "@"
ws.freeze_panes = "A2"
ws.auto_filter.ref = "A1:E1001"

lists = wb.create_sheet("Lists")
WORK_OPTS = ["Kitchen", "Bathroom", "Kitchen; Bathroom", "Windows & doors", "Roofing", "External repairs", "Structural repairs"]
lists["A1"] = "Work planned options"; lists["A1"].font = font(bold=True)
for i, v in enumerate(WORK_OPTS, 2):
    lists.cell(row=i, column=1, value=v).font = font()
lists.column_dimensions["A"].width = 28
lists.sheet_state = "hidden"
dv = DataValidation(type="list", formula1=f"=Lists!$A$2:$A${len(WORK_OPTS)+1}", allow_blank=True, showErrorMessage=False)
dv.promptTitle = "Work planned"; dv.prompt = "Pick one, or type several separated by ;"; dv.showInputMessage = True
ws.add_data_validation(dv); dv.add("D2:D1001")
dvp = DataValidation(type="textLength", operator="between", formula1="5", formula2="8", allow_blank=True, showErrorMessage=True, errorStyle="warning")
dvp.errorTitle = "Check the postcode"; dvp.error = "That doesn't look like a full postcode, e.g. LS6 2AB."
ws.add_data_validation(dvp); dvp.add("C2:C1001")
wb.active = 0
wb.save(OUT + "CB Site App - Address Upload Template.xlsx")

# Survey questions template is built live by the app (lib/template.js), from the questions in use

# ---------------- 3. Projects & contractors ----------------
wb = Workbook()
g = wb.active; g.title = "How to use"
P_TITLES = ["Project name", "PM work email", "Site team PIN (6 numbers)", "Contractor / company name", "Contractor email", "Trade", "Added in app?", "Test snag received?"]
r = guide(g, "Projects & contractors setup sheet",
    "Use this to gather everyone's details before setting a new project up in the app, and to check each contractor is ready.",
    ["One row per contractor. Repeat the project name, PM email and PIN on each row for that project.",
     "PM work email gets copied in on every snag email, and gets told when a contractor closes one out.",
     "Site team PIN: the app makes one for you, or pick your own 6 numbers. Every project needs a different PIN. Give it only to your site team.",
     "Contractor email is where their snags get sent. They don't need an account or a PIN: the email has a button that opens their snag list.",
     "In the app: Projects > New project. Type in the name, PIN and your email, add each contractor, then Save.",
     "Raise a test snag against each contractor and check they got the email. Tick the last column when they have.",
     "Keep this file somewhere safe. It holds the PINs."])
r = legend(g, r)
example(g, r, P_TITLES[:6], ["Leeds K&B Phase 2", "j.smith@chasberger.co.uk", "482913", "Smith Plumbing Ltd", "snags@smithplumbing.co.uk", "Plumber"])
ws = wb.create_sheet("Projects & contractors")
header(ws, 1, P_TITLES, [26, 30, 16, 30, 32, 18, 14, 16])
inputs(ws, 2, 201, 8)
for r_ in range(2, 202):
    ws.cell(row=r_, column=3).number_format = "@"
TR = ["Joiner", "Plumber", "Electrician", "Plasterer", "Tiler", "Decorator", "Roofer", "Bricklayer", "Window fitter", "Groundworker", "Kitchen fitter", "General / labourer"]
dvt = DataValidation(type="list", formula1='"' + ",".join(TR) + '"', allow_blank=True, showErrorMessage=False); ws.add_data_validation(dvt); dvt.add("F2:F201")
dvy = DataValidation(type="list", formula1='"Yes,No"', allow_blank=True); ws.add_data_validation(dvy); dvy.add("G2:H201")
dvp = DataValidation(type="textLength", operator="equal", formula1="6", allow_blank=True, showErrorMessage=True, errorStyle="warning")
dvp.errorTitle = "PIN"; dvp.error = "The PIN must be 6 numbers."; ws.add_data_validation(dvp); dvp.add("C2:C201")
ws.freeze_panes = "A2"; ws.auto_filter.ref = "A1:H201"
wb.active = 0
wb.save(OUT + "CB Site App - Projects and Contractors Setup.xlsx")
print("ok")
