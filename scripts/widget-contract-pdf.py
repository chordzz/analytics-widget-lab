"""
Widget Data Contract -> PDF.

Built from docs/WIDGET_DATA_CONTRACT.md, which is itself generated from the code
that builds the queries. So the PDF cannot drift from the repo doc, and neither
can drift from what the frontend actually sends.

Landscape A4 because the per-widget tables have five columns and one of them
holds a field-role list. In portrait the `needs` column wraps to four lines and
the table stops being scannable, which is the only thing this document is for.

Table headers repeat across page breaks (`repeatRows=1`) — a five-page reference
whose column headings appear once is a reference nobody can use in the middle.
"""

import io
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)

MD = '/Users/olaife/Documents/code/consult-with-josh/smc/analytics-widgets-lab/docs/WIDGET_DATA_CONTRACT.md'
OUT = '/Users/olaife/Documents/code/consult-with-josh/smc/analytics-widgets-lab/docs/WIDGET_DATA_CONTRACT.pdf'
md = io.open(MD, encoding='utf-8').read()

# --- palette: the project's own tokens ---------------------------------------
INK = colors.HexColor('#101620')
INK2 = colors.HexColor('#3B4653')
MUTED = colors.HexColor('#6B7683')
LINE = colors.HexColor('#E1E7EE')
LINESOFT = colors.HexColor('#EDF1F6')
SURF2 = colors.HexColor('#F2F5F9')
CODEBG = colors.HexColor('#F5F8FC')
ACCENT = colors.HexColor('#1060D8')
AGG = colors.HexColor('#12664A')
AGGSOFT = colors.HexColor('#E6F4EE')
REC = colors.HexColor('#9C4E06')
RECSOFT = colors.HexColor('#FDF2E4')

BODY, HEAD, MONO = 'Helvetica', 'Helvetica-Bold', 'Courier'

ss = getSampleStyleSheet()


def st(name, **kw):
    base = dict(
        fontName=BODY, fontSize=8.6, leading=12.4, textColor=INK2,
        alignment=TA_LEFT, spaceAfter=0,
    )
    # The page is landscape so the tables can breathe; prose at 269mm would run
    # to ~150 characters a line. Pulled back to roughly 95, which is as wide as
    # technical prose reads comfortably.
    if kw.pop('measure', False):
        base['rightIndent'] = 92 * mm
    base.update(kw)
    return ParagraphStyle(name, parent=ss['Normal'], **base)


S = {
    'h1': st('h1', fontName=HEAD, fontSize=21, leading=24, textColor=INK, spaceAfter=6),
    'eyebrow': st('eyebrow', fontName=MONO, fontSize=7, leading=10, textColor=ACCENT, spaceAfter=7),
    'stand': st('stand', fontSize=10.5, leading=15, textColor=INK2, spaceAfter=12, measure=True),
    'h2': st('h2', fontName=HEAD, fontSize=13, leading=16, textColor=INK, spaceBefore=16, spaceAfter=7),
    'h3': st('h3', fontName=HEAD, fontSize=9.6, leading=13, textColor=INK, spaceBefore=11, spaceAfter=5),
    'p': st('p', spaceAfter=7, measure=True),
    'li': st('li', spaceAfter=4, leftIndent=10, bulletIndent=1, measure=True),
    'th': st('th', fontName=HEAD, fontSize=6.6, leading=9, textColor=MUTED),
    'td': st('td', fontSize=7.4, leading=10.2),
    'tdmono': st('tdmono', fontName=MONO, fontSize=7, leading=9.6, textColor=INK),
    'num': st('num', fontName=MONO, fontSize=7.4, leading=10, textColor=INK, alignment=TA_RIGHT),
    'chip': st('chip', fontName=HEAD, fontSize=6.2, leading=8.4),
    'caption': st('caption', fontName=MONO, fontSize=6.6, leading=9, textColor=MUTED),
}


def rich(text):
    """Markdown inline to reportlab markup."""
    t = text.replace('&', '&amp;')
    t = t.replace('<br>', '\x00')
    t = t.replace('<', '&lt;').replace('>', '&gt;')
    t = t.replace('\x00', '<br/>')
    t = re.sub(r'`([^`]+)`', r'<font face="Courier" color="#101620">\1</font>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', t)
    # Local links mean nothing on paper; keep the label, drop the target.
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1', t)
    return t


def blocks(text):
    """Markdown prose to flowables. Paragraphs and bullet lists."""
    out = []
    for chunk in re.split(r'\n\n+', text.strip()):
        chunk = chunk.strip()
        if not chunk:
            continue
        if chunk.startswith('- '):
            for item in re.split(r'\n(?=- )', chunk):
                out.append(
                    Paragraph(rich(item[2:].strip().replace('\n', ' ')), S['li'], bulletText='-')
                )
            out.append(Spacer(1, 4))
        else:
            out.append(Paragraph(rich(chunk.replace('\n', ' ')), S['p']))
    return out


def code(text, width):
    body = text.strip()
    style = st('code', fontName=MONO, fontSize=6.6, leading=9.4, textColor=INK2)
    t = Table([[Preformatted(body, style)]], colWidths=[width], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CODEBG),
        ('BOX', (0, 0), (-1, -1), 0.5, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return [t, Spacer(1, 9)]


def note(text, width, tone='accent'):
    """A callout. Left rule in the tone, the way the HTML version does it."""
    bar, bg = (ACCENT, colors.white) if tone == 'accent' else (REC, RECSOFT)
    inner = st('noteinner', spaceAfter=0)
    t = Table([[Paragraph(rich(text), inner)]], colWidths=[width], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('BOX', (0, 0), (-1, -1), 0.5, LINE),
        ('LINEBEFORE', (0, 0), (0, -1), 2.2, bar),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return [t, Spacer(1, 9)]


# --- parse the generated markdown --------------------------------------------
families = []
pattern = r'^### (.+?) - `([a-z-]+)`\n\n\| Type \|.*?\n\|[-|]+\|\n((?:\|.*\n)+)'
for m in re.finditer(pattern.replace(' - ', ' — '), md, re.M):
    label, fid, body = m.group(1), m.group(2), m.group(3)
    rows = []
    for line in body.strip().split('\n'):
        cells = [c.strip() for c in line.strip().strip('|').split(' | ')]
        tid, needs, request, grain, count = cells
        rows.append(dict(
            id=re.match(r'`([^`]+)`', tid).group(1),
            label=tid.split('<br>')[1] if '<br>' in tid else '',
            needs=needs, request=request, grain=grain, rows=count,
        ))
    families.append(dict(id=fid, label=label, rows=rows))

TOTAL = sum(len(f['rows']) for f in families)
AGGN = sum(1 for f in families for r in f['rows'] if r['grain'] != 'records')
RECN = TOTAL - AGGN

req = re.search(r'## 1\. The request\n\n(.*?)\n```ts\n(.*?)\n```\n\n(.*?)\n\n---', md, re.S)
resp = re.search(
    r'## 2\. The response\n\n(.*?)\n```ts\n(.*?)\n```\n\n(.*?)\n\n### Row shape\n\n(.*?)\n\n---',
    md, re.S,
)
grain_md = re.search(r'## 3\. Aggregation grain.*?\n\n(.*?)\n\n---', md, re.S).group(1)
roles_md = re.search(r'## 5\. Field roles, for reference\n\n(.*?)\n\n---', md, re.S).group(1)
never_md = re.search(r'## 6\. What we will not ask you for\n\n(.*)$', md, re.S).group(1)

# --- page furniture ----------------------------------------------------------
PAGE = landscape(A4)
MARGIN = 14 * mm
CONTENT_W = PAGE[0] - 2 * MARGIN


def furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont(MONO, 6.6)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 8.5 * mm, 'Analytics - Widget Data Contract')
    canvas.drawRightString(
        PAGE[0] - MARGIN, 8.5 * mm,
        'Generated from src/contract-docs/render.ts - page %d' % canvas.getPageNumber(),
    )
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 11.5 * mm, PAGE[0] - MARGIN, 11.5 * mm)
    canvas.restoreState()


doc = BaseDocTemplate(
    OUT, pagesize=PAGE,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=17 * mm,
    title='Analytics - Widget Data Contract',
    author='Analytics frontend',
    subject='What each of the %d widget types asks a Source System for' % TOTAL,
)
frame = Frame(MARGIN, 17 * mm, CONTENT_W, PAGE[1] - MARGIN - 17 * mm, id='body')
doc.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=furniture)])

# Prose sits at a readable measure even though the page is wide; only the
# tables use the full width.
PROSE_W = min(CONTENT_W, 168 * mm)

story = []
story += [
    Paragraph('For the Source Systems team &nbsp;&middot;&nbsp; %d widget types' % TOTAL, S['eyebrow']),
    Paragraph('Widget Data Contract', S['h1']),
    Paragraph(
        'One question per widget: what will the frontend ask you for, and what '
        'shape must the answer be?', S['stand']),
]

# --- the ratio, as a bar -----------------------------------------------------
bar_w = PROSE_W
agg_w = bar_w * AGGN / TOTAL
bar = Table([['', '']], colWidths=[agg_w, bar_w - agg_w], rowHeights=[5], hAlign='LEFT')
bar.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (0, 0), AGG),
    ('BACKGROUND', (1, 0), (1, 0), REC),
    ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ('TOPPADDING', (0, 0), (-1, -1), 0),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
]))

legend = Paragraph(
    '<font face="Courier"><b>%d</b></font> send an aggregated query'
    '&nbsp;&nbsp;&nbsp;&nbsp;'
    '<font face="Courier"><b>%d</b></font> ask for records' % (AGGN, RECN),
    st('legend', fontSize=8, leading=11, textColor=INK2))

story += [
    Paragraph('HOW THE %d TYPES ASK TODAY' % TOTAL, S['caption']),
    Spacer(1, 4), bar, Spacer(1, 5), legend, Spacer(1, 13),
]

story += blocks(
    'Every row in this document is read out of the code that builds the query - '
    'the same `queryFor` the running application calls - so nothing here is an '
    'intention. Read the publication contract first for what a Dataset must '
    '*declare*; this is about what gets *asked* afterwards.'
)

# --- 1. request --------------------------------------------------------------
story += [Paragraph('1 &nbsp;&middot;&nbsp; The request', S['h2'])]
story += blocks('One shape, for every widget.')
story += code(req.group(2), PROSE_W)
story += blocks(req.group(3))

# --- 2. response -------------------------------------------------------------
story += [Paragraph('2 &nbsp;&middot;&nbsp; The response', S['h2'])]
story += blocks(
    'Four outcomes, and they must be distinguishable. This is the easiest part of '
    'the contract to get wrong, because nothing in the requirements says it about '
    'the API - only about the display.'
)
story += code(resp.group(2), PROSE_W)
story += blocks(resp.group(3))
story += [Paragraph('Row shape', S['h3'])]
story += blocks(resp.group(4))

# --- 3. grain ----------------------------------------------------------------
story += [Paragraph('3 &nbsp;&middot;&nbsp; Aggregation grain - the thing to settle with us', S['h2'])]
story += note(
    'Of the %d built widget types, **%d currently send an aggregated query and %d '
    'ask for records.** That is not a recommendation, it is a report - and it needs '
    'a conversation before it meets a real database.' % (TOTAL, AGGN, RECN),
    PROSE_W, tone='warn')
story += blocks(re.sub(r'^Of the .*?ask for records\.\*\*\n\n', '', grain_md, flags=re.S))

# --- 4. the tables -----------------------------------------------------------
story += [Paragraph('4 &nbsp;&middot;&nbsp; Every widget, and what it asks for', S['h2'])]
story += blocks(
    '**Needs** is what a Dataset must offer for the widget to be *offered* at all - '
    'the Field roles, and how many of each. A widget whose required slots cannot be '
    'filled is never shown to an Author, so a Dataset missing a Time Dimension '
    'simply does not produce trend charts.\n\n'
    '**Rows** is what our fixtures return: the volume a widget can usefully draw, '
    'not a limit to enforce. A calendar heatmap wants 365 points and a stat card '
    'wants one.'
)

COLS = [46 * mm, 92 * mm, 68 * mm, 30 * mm, 18 * mm]

for fam in families:
    header = [
        Paragraph('TYPE', S['th']), Paragraph('NEEDS', S['th']),
        Paragraph('REQUEST TODAY', S['th']), Paragraph('GRAIN', S['th']),
        Paragraph('ROWS', S['th']),
    ]
    data = [header]
    for r in fam['rows']:
        data.append([
            Paragraph(
                '<font face="Courier" color="#101620">%s</font><br/>'
                '<font size="6.4" color="#6B7683">%s</font>' % (r['id'], r['label']),
                S['td']),
            Paragraph(rich(r['needs']), S['td']),
            Paragraph(rich(r['request']), S['td']),
            Paragraph(r['grain'].upper(), S['chip']),
            Paragraph(r['rows'], S['num']),
        ])

    t = Table(data, colWidths=COLS, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), SURF2),
        ('LINEBELOW', (0, 0), (-1, 0), 0.6, LINE),
        ('BOX', (0, 0), (-1, -1), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i, r in enumerate(fam['rows'], start=1):
        style.append(('LINEBELOW', (0, i), (-1, i), 0.4, LINESOFT))
        # Grain is the one thing to read at a glance, so it is a filled cell
        # rather than a word: green is safe at any volume, amber needs a talk.
        if r['grain'] == 'records':
            style += [('BACKGROUND', (3, i), (3, i), RECSOFT),
                      ('TEXTCOLOR', (3, i), (3, i), REC)]
        else:
            style += [('BACKGROUND', (3, i), (3, i), AGGSOFT),
                      ('TEXTCOLOR', (3, i), (3, i), AGG)]
    t.setStyle(TableStyle(style))

    story.append(KeepTogether([
        Paragraph('%s <font face="Courier" size="7" color="#6B7683">%s</font>'
                  % (fam['label'], fam['id']), S['h3']),
        t,
    ]))
    story.append(Spacer(1, 7))

# --- 5. roles ----------------------------------------------------------------
story += [Paragraph('5 &nbsp;&middot;&nbsp; Field roles, for reference', S['h2'])]
rt = re.search(r'\| Role \|.*?\n\|[-|]+\|\n((?:\|.*\n)+)', roles_md)
rdata = [[Paragraph('ROLE', S['th']), Paragraph('WHAT IT IS', S['th']), Paragraph('NOTES', S['th'])]]
for line in rt.group(1).strip().split('\n'):
    c = [x.strip() for x in line.strip().strip('|').split('|')]
    rdata.append([Paragraph(rich(c[0]), S['td']), Paragraph(rich(c[1]), S['td']),
                  Paragraph(rich(c[2]), S['td'])])
rtab = Table(rdata, colWidths=[42 * mm, 74 * mm, 84 * mm])
rtab.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), SURF2),
    ('LINEBELOW', (0, 0), (-1, 0), 0.6, LINE),
    ('BOX', (0, 0), (-1, -1), 0.5, LINE),
    ('INNERGRID', (0, 1), (-1, -1), 0.4, LINESOFT),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story += [rtab, Spacer(1, 9)]
story += blocks(roles_md[rt.end():])

# --- 6. not asking for ------------------------------------------------------
story += [Paragraph('6 &nbsp;&middot;&nbsp; What we will not ask you for', S['h2'])]
story += blocks(never_md)

doc.build(story)
print('wrote %s' % OUT)
print('%d types, %d families | %d aggregated / %d records' % (TOTAL, len(families), AGGN, RECN))
