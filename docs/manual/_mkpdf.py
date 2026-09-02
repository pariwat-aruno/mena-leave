# -*- coding: utf-8 -*-
"""ห่อไฟล์ artifact (ซึ่งเป็นชิ้นส่วน ไม่มี <html>/<head>) ให้เป็นเอกสารเต็มสำหรับพิมพ์ แล้วสั่ง Chrome ทำ PDF
   ⭐ ต้องมี <meta charset="utf-8"> เสมอ — ไม่งั้นภาษาไทยกลายเป็นขยะเฉพาะตอนเปิดผ่านเบราว์เซอร์"""
import sys, os, subprocess, io
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PRINT_CSS = """
<style>
@page { size: A4; margin: 14mm 12mm 16mm; }
:root { color-scheme: light; }
html, body { background:#fff !important; }
body { font-size: 11.5pt; }
.wrap { max-width:none; padding:0 }
nav.toc { display:none }          /* สารบัญแบบคลิกไม่มีประโยชน์บนกระดาษ */
header.top { padding-top:0 }
section { padding-top: 22px; break-inside:auto }
.sec-head { break-after: avoid }
ol.steps>li, figure { break-inside: avoid }
.item, .alert { break-inside: auto }
h1,h2,h3 { break-after: avoid }
figure img { max-height: 112mm; width:auto; max-width:100%; object-fit: contain; object-position: left top; margin:0 auto }
.figs.two { grid-template-columns:1fr 1fr; display:grid; gap:10px }
  .tbl-wrap { break-inside: avoid }
  section#s6 figure { margin-top:10px }
table { font-size: 10pt }
th, td { padding: 7px 9px }
.tiles { break-inside: avoid }
a { color: inherit; text-decoration: none }
.chain { white-space: pre-wrap; overflow: visible; font-size: 9.5pt; line-height:1.9 }
.tbl-wrap { overflow: visible }
table { min-width: 0 !important }
footer { break-before: avoid }
</style>
"""
def build(src, out):
    frag = io.open(src, encoding='utf-8').read()
    doc = ('<!doctype html><html lang="th"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=1100">' + frag_head(frag) + PRINT_CSS +
           '</head><body>' + frag_body(frag) + '</body></html>')
    tmp = out + '.src.html'
    io.open(tmp, 'w', encoding='utf-8').write(doc)
    subprocess.run([CHROME, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                    '--print-to-pdf=' + out, '--virtual-time-budget=20000',
                    '--run-all-compositor-stages-before-draw', '--no-sandbox',
                    'file://' + os.path.abspath(tmp)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(tmp)
    return os.path.getsize(out)

def frag_head(frag):
    """ดึง <title>/<link>/<style> ที่อยู่ต้นไฟล์ไปไว้ใน head"""
    head = []
    for tag in ('<title>', '<link', '<style>'):
        pass
    import re
    for m in re.finditer(r'<title>.*?</title>|<link[^>]*>|<style>.*?</style>', frag, re.S):
        head.append(m.group(0))
    return ''.join(head)

def frag_body(frag):
    import re
    return re.sub(r'<title>.*?</title>|<link[^>]*>|<style>.*?</style>', '', frag, flags=re.S)

if __name__ == '__main__':
    import sys
    ALL = [('claim-manual.html', 'คู่มือผูกบัญชี-ระบบลางานMENA.pdf')]
    pick = sys.argv[1:] 
    for src, out in [x for x in ALL if not pick or x[0] in pick]:
        n = build(src, out)
        print('%-24s → %s  (%.1f MB)' % (src, out, n/1048576))
