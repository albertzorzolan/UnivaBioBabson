"""Build the one-page project description and a paginated, readable source-code PDF."""
from pathlib import Path
from xml.sax.saxutils import escape
import json, textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import reportlab

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
fonts=Path(reportlab.__file__).parent/'fonts'
pdfmetrics.registerFont(TTFont('Vera',str(fonts/'Vera.ttf')))
pdfmetrics.registerFont(TTFont('VeraBold',str(fonts/'VeraBd.ttf')))
mono=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fonts/truetype/DejaVuSansMono.ttf'
if not mono.exists(): mono=Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf')
if not mono.exists(): mono=fonts/'Vera.ttf'
pdfmetrics.registerFont(TTFont('VeraMono',str(mono)))
GREEN=HexColor('#355c4c');INK=HexColor('#303b34');MUTED=HexColor('#627457');PALE=HexColor('#edf2e7');LINE=HexColor('#dce4d2')

def para(c,text,x,y,w,size=9.5,leading=14,color=INK,bold=False):
    style=ParagraphStyle('body',fontName='VeraBold' if bold else 'Vera',fontSize=size,leading=leading,textColor=color)
    p=Paragraph(text,style);_,height=p.wrap(w,1000);p.drawOn(c,x,y-height);return y-height

def description():
    c=canvas.Canvas(str(OUT/'MedWatch-Project-Description.pdf'),pagesize=(612,792));c.setTitle('MedWatch - UnivaBio Project Description')
    c.setFillColor(GREEN);c.rect(0,640,612,152,fill=1,stroke=0)
    para(c,'UNIVABIO  |  ARTIFICIAL INTELLIGENCE FOR HUMAN HEALTH',40,758,532,8,12,HexColor('#d8e5d0'),True)
    para(c,'MedWatch',40,729,532,31,37,HexColor('#ffffff'),True)
    para(c,'A clearer story between care visits.',40,678,532,14,19,HexColor('#e7efdf'))
    y=para(c,'<b>The problem.</b> Everyday changes can be hard to recall at an appointment. Older adults and family caregivers may arrive with disconnected notes and an incomplete picture of what was actually recorded.',40,615,532,10,15)
    y=para(c,'<b>Our approach.</b> MedWatch turns a patient\'s own words into a reviewable daily record, then brings confirmed observations, caregiver concerns and a medication list into a concise visit brief.',40,y-12,532,10,15)
    c.setFillColor(PALE);c.roundRect(40,447,532,54,7,fill=1,stroke=0)
    for i,(title,body) in enumerate([('01  Record','Describe the day'),('02  Confirm','Check every suggestion'),('03  Understand','Follow the evidence'),('04  Prepare','Review a visit brief')]):
        x=52+i*131;para(c,title,x,485,122,9,13,GREEN,True);para(c,body,x,466,122,8,11,MUTED)
    y=424
    para(c,'MEANINGFUL AI',40,y,252,10,14,GREEN,True)
    para(c,'A real language model runs locally in the browser. It extracts proposed form answers with exact source quotes, chooses fixed clarification prompts, summarizes records, answers bounded record questions, and drafts visit discussion notes. The full manual form remains available.',40,y-24,252,9.2,14)
    para(c,'EVIDENCE AND HUMAN CONTROL',320,y,252,10,14,GREEN,True)
    para(c,'The app validates response structure, source identity, quoted spans and numerical support before showing a draft. Patients confirm source writes. Caregivers review report wording. Missing answers stay unknown, and observer notes stay separate from patient counts.',320,y-24,252,9.2,14)
    c.setStrokeColor(LINE);c.line(40,297,572,297)
    para(c,'WORKING PROTOTYPE',40,276,252,10,14,GREEN,True)
    para(c,'React + TypeScript, local browser storage, WebGPU inference with WebLLM and Qwen2.5-1.5B. Includes role-specific screens, correction history, medication-list editing, descriptive charts, evidence drawers, pinned concerns, and review-required PDF printing.',40,252,252,9.2,14)
    para(c,'IMPACT AND HONEST LIMITS',320,276,252,10,14,GREEN,True)
    para(c,'The intended benefit is less recall burden and better visit preparation. Health outcomes and human usability have not been measured. This is a fictional-data student prototype: no diagnosis, dosing advice, risk scoring, triage, clinician monitoring, or claim of regulatory clearance.',320,252,252,9.2,14)
    c.setFillColor(PALE);c.roundRect(40,66,532,56,6,fill=1,stroke=0)
    para(c,'Development evidence, not clinical validation',52,108,508,9,13,GREEN,True)
    para(c,'Automated checks cover record logic, persistence, role controls, responsive screens and printing. Real-model synthetic results are logged separately. Source-explanation AI is gated pending qualified content review.',52,90,508,8,11,MUTED)
    para(c,'Submission includes source code and a working local demo.  |  MedWatch is a working project name.',40,45,532,7,10,MUTED)
    c.showPage();c.save()

def code_pdf():
    files=[ROOT/'package.json',ROOT/'index.html',ROOT/'vite.config.ts',ROOT/'tsconfig.json',ROOT/'Start MedWatch.command',ROOT/'.gitignore',ROOT/'public/favicon.svg',ROOT/'public/fonts/fonts.css']
    files+=sorted(p for p in (ROOT/'src').rglob('*') if p.suffix in ['.ts','.tsx','.css','.json'] and p.name!='validators.ts')
    files+=sorted(p for p in (ROOT/'scripts').glob('*') if p.suffix in ['.mjs','.py'])
    c=canvas.Canvas(str(OUT/'MedWatch-Source-Code.pdf'),pagesize=(612,792));c.setTitle('MedWatch - Authored Source Code')
    y=735;page=1
    para(c,'MedWatch',40,y,530,28,34,GREEN,True)
    para(c,'Authored source code',40,687,530,18,24,INK)
    y=para(c,'UnivaBio fictional-data prototype. The complete runnable project is supplied alongside this PDF. This listing includes application code, schemas, configuration and development scripts. Vendor dependencies, downloaded model weights, generated validator output, lockfile and binary assets are excluded; the validator generator and its source schemas are included.',40,643,532,10,16)
    y=para(c,'Each code page identifies its source file and line number. Long lines wrap with a continuation mark. This PDF is for review; use the accompanying project files to run or modify the application.',40,y-20,532,10,16)
    para(c,f'{len(files)} source files. Generated from the final local prototype.',40,y-29,532,10,16,MUTED)
    def footer():
        c.setStrokeColor(LINE);c.line(40,38,572,38);c.setFont('Vera',7);c.setFillColor(MUTED);c.drawString(40,25,'MedWatch | Source review | Fictional-data prototype');c.drawRightString(572,25,str(page))
    footer();c.showPage();page+=1
    for path in files:
        rel=str(path.relative_to(ROOT));lines=path.read_text().splitlines();y=0
        for lineno,line in enumerate(lines,1):
            line=line.replace('\t','    ')
            # All source is preserved; unsupported non-BMP glyphs are shown as explicit Unicode escapes.
            line=''.join(ch if ord(ch)<=0xffff else '\\u{'+format(ord(ch),'X')+'}' for ch in line)
            wrapped=textwrap.wrap(line,width=99,replace_whitespace=False,drop_whitespace=False,break_long_words=True,break_on_hyphens=False) or ['']
            for j,part in enumerate(wrapped):
                if y<55:
                    if y!=0:footer();c.showPage();page+=1
                    c.setFillColor(PALE);c.rect(0,736,612,56,fill=1,stroke=0);c.setFillColor(GREEN);c.setFont('VeraBold',10);c.drawString(40,760,rel[:89]);c.setFont('Vera',7);c.drawString(40,743,'SOURCE FILE  |  '+str(lineno)+' onward');y=717
                c.setFillColor(MUTED);c.setFont('VeraMono',8.1);c.drawRightString(57,y,str(lineno)if j==0 else '+')
                c.setFillColor(INK);c.drawString(66,y,part);y-=10.4
        footer();c.showPage();page+=1
    c.save()
    (ROOT/'docs/code-pdf-manifest.json').write_text(json.dumps({'files':[str(p.relative_to(ROOT))for p in files],'excluded':'Vendor dependencies, generated validator output, lockfile, binary assets, model weights','codePages':page-1},indent=2)+'\n')

if __name__=='__main__':
    description();code_pdf();print('Created project description and source code PDFs.')
