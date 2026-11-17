from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Kalkulation-Auftrag.xlsx')
wb = Workbook()
ws = wb.active
ws.title = 'Kalkulation'

EUR = '#,##0.00 €'
PCT = '0%'
lila = PatternFill('solid', fgColor='7E22CE')
hell = PatternFill('solid', fgColor='F3EDFB')
gelb = PatternFill('solid', fgColor='FFF7D6')
gruen = PatternFill('solid', fgColor='E6F4EA')
thin = Side(style='thin', color='D9C8F0')
box = Border(left=thin, right=thin, top=thin, bottom=thin)
bold = Font(bold=True)
weiss = Font(bold=True, color='FFFFFF')

ws['A1'] = 'Wunsch-Fabrik.dk – Auftragskalkulation'
ws['A1'].font = Font(bold=True, size=16, color='7E22CE')
ws['A2'] = 'Gelbe Felder ausfüllen bzw. anpassen – alles andere rechnet automatisch. Preise der Ware netto (ohne Moms) eintragen.'
ws['A2'].font = Font(italic=True, color='666666')

# ---- Einstellungen ----
ws['A4'] = 'Einstellungen'; ws['A4'].font = Font(bold=True, size=12)
settings = [
    ('Stundensatz (netto)', 50, EUR, 'Was deine Arbeitsstunde kosten soll'),
    ('Arbeitszeit je Stück (Minuten)', 30, '0', 'Bei vielen gleichen Teilen weniger als bei einem einzelnen'),
    ('Aufschlag auf Material', 0.20, PCT, 'Für Fehldrucke, Einkauf, Lager'),
    ('Moms', 0.25, PCT, 'Dänische Moms'),
    ('Einkommensteuer (Schätzung)', 0.42, PCT, 'Grobe Schätzung inkl. AM-bidrag – nur zur Anzeige, was bleibt'),
]
for i, (name, val, fmt, hint) in enumerate(settings):
    r = 5 + i
    ws.cell(r, 1, name)
    c = ws.cell(r, 3, val); c.number_format = fmt; c.fill = gelb; c.border = box
    ws.cell(r, 4, hint).font = Font(color='888888', italic=True)
STD, MIN, AUF, MOMS, STEUER = '$C$5', '$C$6', '$C$7', '$C$8', '$C$9'

ws['A11'] = 'Veredelung je Stück (Material netto)'; ws['A11'].font = Font(bold=True, size=12)
deko = [
    ('Stickgarn, Vlies, Nadeln', 0.50),
    ('DTF Rücken', 2.50),
    ('DTF Ärmel (beide)', 1.20),
    ('Strom, Maschinen-Verschleiß', 0.50),
]
for i, (name, val) in enumerate(deko):
    r = 12 + i
    ws.cell(r, 1, name)
    c = ws.cell(r, 3, val); c.number_format = EUR; c.fill = gelb; c.border = box
ws.cell(16, 1, 'Veredelungsmaterial je Stück').font = bold
c = ws.cell(16, 3, '=SUM(C12:C15)'); c.number_format = EUR; c.font = bold
DEKO = '$C$16'
ws.cell(17, 1, 'Digitalisierung Stickdatei (einmalig, netto)')
c = ws.cell(17, 3, 30); c.number_format = EUR; c.fill = gelb; c.border = box
ws.cell(17, 4, '0 eintragen, wenn das Logo schon digitalisiert ist').font = Font(color='888888', italic=True)
DIGI = '$C$17'

# ---- Artikel ----
H = 19
heads = ['Art', 'Größe', 'Artikel-Nr.', 'Menge', 'Einkauf je Stück netto', 'Einkauf gesamt netto',
         'Preis je Stück netto', 'Preis je Stück inkl. Moms', 'Summe netto', 'Summe inkl. Moms']
for j, t in enumerate(heads, 1):
    c = ws.cell(H, j, t); c.font = weiss; c.fill = lila; c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center'); c.border = box
ws.row_dimensions[H].height = 34

items = [
    ('Polo', '116', 'BCPK001', 1, 5.45), ('Polo', 'M', 'BCPU426', 4, 8.64), ('Polo', 'S', 'BCPW463', 2, 8.64),
    ('Pulli', 'S', 'BCWW02W', 1, 9.30), ('Pulli', 'M', 'BCWU01W', 2, 9.30), ('Pulli', '116', 'BCWK001', 1, 6.75),
    ('Hoodie', '116', 'BCWK002', 1, 9.45), ('Hoodie', 'M', 'E2180', 1, 18.77), ('Hoodie', 'S', 'E2181', 1, 17.00),
]
first = H + 1
rows = len(items) + 6   # freie Zeilen für weitere Artikel
for k in range(rows):
    r = first + k
    if k < len(items):
        a, g, nr, m, p = items[k]
        vals = [a, g, nr, m, p]
    else:
        vals = [None] * 5
    for j, v in enumerate(vals, 1):
        c = ws.cell(r, j, v); c.fill = gelb; c.border = box
    ws.cell(r, 4).number_format = '0'
    ws.cell(r, 5).number_format = EUR
    f = {
        6: f'=IF(D{r}="","",D{r}*E{r})',
        7: f'=IF(E{r}="","",ROUND(E{r}*(1+{AUF})+{DEKO}*(1+{AUF})+{MIN}/60*{STD},2))',
        8: f'=IF(G{r}="","",ROUND(G{r}*(1+{MOMS}),2))',
        9: f'=IF(G{r}="","",D{r}*G{r})',
        10: f'=IF(H{r}="","",D{r}*H{r})',
    }
    for j, formula in f.items():
        c = ws.cell(r, j, formula); c.number_format = EUR; c.border = box
last = first + rows - 1

# Digitalisierung als eigene Zeile
rd = last + 1
ws.cell(rd, 1, 'Digitalisierung Stickdatei (einmalig)')
ws.cell(rd, 4, f'=IF({DIGI}>0,1,0)').number_format = '0'
for j, formula in {7: f'={DIGI}', 8: f'=ROUND({DIGI}*(1+{MOMS}),2)', 9: f'=D{rd}*G{rd}', 10: f'=D{rd}*H{rd}'}.items():
    c = ws.cell(rd, j, formula); c.number_format = EUR
for j in range(1, 11):
    ws.cell(rd, j).border = box

rs = rd + 1
ws.cell(rs, 1, 'Summe').font = bold
c = ws.cell(rs, 4, f'=SUM(D{first}:D{last})'); c.font = bold
for j, col in [(6, 'F'), (9, 'I'), (10, 'J')]:
    c = ws.cell(rs, j, f'=SUM({col}{first}:{col}{rd})'); c.number_format = EUR; c.font = bold
for j in range(1, 11):
    ws.cell(rs, j).fill = hell; ws.cell(rs, j).border = box

# ---- Was bleibt ----
r0 = rs + 2
ws.cell(r0, 1, 'Was bleibt dir?').font = Font(bold=True, size=12)
calc = [
    ('Kunde zahlt (inkl. Moms)', f'=J{rs}'),
    ('davon Moms (an Skattestyrelsen, Einkaufs-Moms wird verrechnet)', f'=J{rs}-I{rs}'),
    ('Umsatz netto', f'=I{rs}'),
    ('− Ware netto', f'=F{rs}'),
    ('− Veredelungsmaterial', f'=D{rs}*{DEKO}'),
    ('➜ Gewinn vor Steuer', f'=C{r0+3}-C{r0+4}-C{r0+5}'),
    ('− Einkommensteuer (Schätzung)', f'=C{r0+6}*{STEUER}'),
    ('➜ bleibt dir', f'=C{r0+6}-C{r0+7}'),
    ('Arbeitszeit gesamt (Stunden)', f'=D{rs}*{MIN}/60'),
    ('➜ bleibt dir je Stunde', f'=IF(C{r0+9}=0,0,C{r0+8}/C{r0+9})'),
]
for i, (name, formula) in enumerate(calc):
    r = r0 + 1 + i
    ws.cell(r, 1, name)
    c = ws.cell(r, 3, formula); c.number_format = '0.0' if 'Stunden)' in name else EUR; c.border = box
    if name.startswith('➜'):
        ws.cell(r, 1).font = bold; c.font = bold; c.fill = gruen
ws.cell(r0 + 12, 1, 'Hinweis: Steuer ist eine grobe Schätzung, keine Steuerberatung. Weitere Ausgaben (Versand, Folie, Maschinen) senken den Gewinn und damit die Steuer.').font = Font(italic=True, color='888888')

widths = {'A': 34, 'B': 9, 'C': 14, 'D': 9, 'E': 14, 'F': 14, 'G': 14, 'H': 15, 'I': 13, 'J': 15}
for k, v in widths.items():
    ws.column_dimensions[k].width = v
ws.freeze_panes = 'A20'
ws.sheet_view.zoomScale = 110
wb.save(OUT)
print(OUT)
