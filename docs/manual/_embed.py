# -*- coding: utf-8 -*-
"""ฝังรูปจาก img/ ลงไฟล์ .src.html เป็น base64 → <เล่ม>-manual.html (ใช้ทำ PDF) · รายงานรูปที่หาไม่เจอ"""
import re, os, base64, io, sys
BOOKS = ['claim', 'employee', 'approver', 'hr']
total_missing = 0
for b in [x for x in BOOKS if len(sys.argv) < 2 or x in sys.argv[1:]]:
    src = io.open(b + '-manual.src.html', encoding='utf-8').read()
    found, missing = [], []
    def rep(m):
        p = m.group(1)
        if not os.path.exists(p):
            missing.append(p); return m.group(0)
        found.append(p)
        mime = 'image/png' if p.endswith('.png') else 'image/jpeg'
        return 'src="data:%s;base64,%s"' % (mime, base64.b64encode(open(p, 'rb').read()).decode())
    out = re.sub(r'src="(img/[^"]+)"', rep, src)
    io.open(b + '-manual.html', 'w', encoding='utf-8').write(out)
    total_missing += len(missing)
    print('%-9s embed %2d รูป  missing %d %s' % (b, len(found), len(missing), missing or ''))
sys.exit(1 if total_missing else 0)
