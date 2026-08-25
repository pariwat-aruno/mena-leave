#!/usr/bin/env python3
"""
สร้าง payload สำหรับ importEmployees จากไฟล์ Excel ทะเบียนพนักงานของลูกค้า

⭐ รหัสพนักงานใช้ของลูกค้าเอง (คอลัมน์ "รหัส") ไม่แปลงเป็นเลขใหม่
⭐ จับคู่ซ้ำด้วย emp_code ที่ normalize เป็นสตริงแล้วเสมอ — Sheet เก็บ 6818 เป็น "ตัวเลข"
   ถ้าเทียบ '6818' กับ 6818 ตรง ๆ จะไม่แมตช์ แล้วได้พนักงานซ้ำ 2 แถว
"""
import openpyxl, re, json, sys, os, unicodedata

SRC = sys.argv[1] if len(sys.argv) > 1 else '/Users/pariwat/Downloads/ฐานข้อมูลพนักงาน24.8.69.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/mena_import_payload.json'

# ตำแหน่ง → แผนก (ไฟล์ต้นฉบับไม่มีคอลัมน์แผนก)
DEPT_BY_POSITION = {
    'แพ็ค': 'แพ็ค',
    'หัวหน้าแผนกผลิตแพ็ค': 'แพ็ค',
    'ผลิตสบู่': 'ผลิต',
    'ผลิตครีม': 'ผลิต',
    'เจ้าหน้าที่ควบคุมเครื่องจักร': 'ผลิต',
    'วิศวกรการผลิต': 'ผลิต',
    'QC.': 'ควบคุมคุณภาพ',
    'ผู้ช่วย QC.': 'ควบคุมคุณภาพ',
    'หัวหน้าแผนกควบคุมคุณภาพ': 'ควบคุมคุณภาพ',
    'ชั่งวัตถุดิบ': 'ควบคุมคุณภาพ',
    'เจ้าหน้าที่คลังสินค้า': 'คลังสินค้า/ขนส่ง',
    'ขนส่ง': 'คลังสินค้า/ขนส่ง',
    'เจ้าหน้าที่ขนส่ง': 'คลังสินค้า/ขนส่ง',
    'หัวหน้าแผนกคลังสินค้า/ขนส่ง': 'คลังสินค้า/ขนส่ง',
    'เจ้าหน้าที่ธุรการ': 'สำนักงาน',
    'ธุรการสำนักงาน': 'สำนักงาน',
    'เจ้าหน้าที่จัดซื้อ': 'สำนักงาน',
    'เจ้าหน้าที่บัญชี': 'สำนักงาน',
    'เจ้าหน้าที่ซ่อมบำรุง': 'สำนักงาน',
    'เจ้าหน้าที่บุคคล': 'บุคคล',
    'แม่บ้าน': 'บุคคล',
    'ซัพพอร์ต': 'บุคคล',
    'เจ้าหน้าที่วิจัยและพัฒนาผลิตภัณฑ์': 'วิจัยและพัฒนา',
}

# สะกดผิดในไฟล์ต้นฉบับ → แก้ให้ (รายงานทุกตัวที่แก้ ไม่แก้เงียบ)
POSITION_FIXES = {'เจ้าหน้าที่จัดซี้อ': 'เจ้าหน้าที่จัดซื้อ'}

# ผู้บริหารที่ถูกอ้างเป็นผู้อนุมัติขั้น 1 แต่ไม่มีแถวในไฟล์ทะเบียน
# ⭐ อ่านจาก import.local.json ที่ไม่ขึ้น git — repo นี้เป็น public จึงห้ามมีชื่อคนจริงในโค้ด
LOCAL_CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'import.local.json')
if not os.path.exists(LOCAL_CFG):
    raise SystemExit(
        'ไม่พบ ' + LOCAL_CFG + '\n'
        'สร้างไฟล์นี้ก่อน (ไม่ขึ้น git) รูปแบบ:\n'
        '{"executives":[{"emp_code":"EXEC-01","display_name":"...","position":"ผู้บริหาร",'
        '"department":"ผู้บริหาร","role":"OWNER"}]}')
EXECUTIVES = json.load(open(LOCAL_CFG, encoding='utf-8'))['executives']

def sq(s):
    """บีบช่องว่างซ้อน + ตัดหัวท้าย (ไฟล์ต้นฉบับใช้ space คั่นชื่อ-นามสกุลหลายตัว)"""
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(s or ''))).strip()

def bare(s):
    """ชื่อสำหรับจับคู่ — ตัดคำนำหน้าและช่องว่างทั้งหมดออก"""
    s = re.sub(r'\s+', '', sq(s))
    for p in ('นางสาว', 'นาย', 'นาง', 'คุณ'):
        if s.startswith(p):
            return s[len(p):]
    return s

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb[wb.sheetnames[0]]

raw, warnings = [], []
for n, r in enumerate(ws.iter_rows(min_row=2, values_only=True), 3):
    code, name = sq(r[1]), sq(r[2])
    if not code and not name:
        continue
    if not code or not name:
        warnings.append(f'แถว {n}: ข้อมูลไม่ครบ (รหัส="{code}" ชื่อ="{name}") — ข้ามแถวนี้')
        continue
    pos = sq(r[3])
    if pos in POSITION_FIXES:
        warnings.append(f'แถว {n} ({code}): แก้คำสะกด "{pos}" → "{POSITION_FIXES[pos]}"')
        pos = POSITION_FIXES[pos]
    raw.append({'row': n, 'code': code, 'name': name, 'pos': pos, 'a1': sq(r[4])})

# ---- ตรวจซ้ำ ----
for key, label in (('code', 'รหัสซ้ำ'), (None, 'ชื่อซ้ำ')):
    seen = {}
    for x in raw:
        k = x['code'] if key else bare(x['name'])
        seen.setdefault(k, []).append(x['row'])
    for k, rows in seen.items():
        if len(rows) > 1:
            warnings.append(f'{label}: "{k}" อยู่แถว {rows}')

# ---- map ชื่อ → รหัส สำหรับหาหัวหน้า ----
by_name = {bare(x['name']): x['code'] for x in raw}
by_name.update({bare(e['display_name']): e['emp_code'] for e in EXECUTIVES})

sup_codes = set()
for x in raw:
    k = bare(x['a1'])
    if not k:
        warnings.append(f'แถว {x["row"]} ({x["code"]}): ไม่ระบุผู้อนุมัติขั้น 1')
        x['sup'] = ''
        continue
    if k not in by_name:
        warnings.append(f'แถว {x["row"]} ({x["code"]}): หาหัวหน้า "{x["a1"]}" ไม่เจอในรายชื่อ')
        x['sup'] = ''
        continue
    x['sup'] = by_name[k]
    sup_codes.add(x['sup'])

exec_codes = [e['emp_code'] for e in EXECUTIVES]
staff_sups = sorted(sup_codes - set(exec_codes))

rows = []
for e in EXECUTIVES:
    rows.append({**e, 'supervisor_emp_code': '', 'executive_emp_codes': []})
for x in raw:
    unknown = x['pos'] not in DEPT_BY_POSITION
    if unknown:
        warnings.append(f'แถว {x["row"]} ({x["code"]}): ตำแหน่ง "{x["pos"]}" ยังไม่ได้จัดแผนก — เว้นว่างไว้')
    rows.append({
        'emp_code': x['code'],
        'display_name': sq(x['name']),
        'position': x['pos'],
        'department': DEPT_BY_POSITION.get(x['pos'], ''),
        'role': 'SUPERVISOR' if x['code'] in staff_sups else 'USER',
        'supervisor_emp_code': x['sup'],
        'executive_emp_codes': exec_codes,
    })

json.dump({'rows': rows}, open(OUT, 'w'), ensure_ascii=False, indent=1)

# ---- รายงาน ----
from collections import Counter
print(f'พนักงานในไฟล์ {len(raw)} คน + ผู้บริหาร {len(EXECUTIVES)} คน = {len(rows)} แถว\n')
print('--- แผนก ---')
for d, c in Counter(r['department'] or '(ไม่ระบุ)' for r in rows).most_common():
    print(f'{c:3d}  {d}')
print('\n--- หัวหน้างาน (role SUPERVISOR) ---')
for c in staff_sups:
    r = next(x for x in rows if x['emp_code'] == c)
    print(f'  {c}  {r["display_name"]:34s} {r["position"]:28s} ลูกทีม {sum(1 for y in rows if y["supervisor_emp_code"] == c)} คน')
print('\n--- ผู้บริหาร (role OWNER) ---')
for e in EXECUTIVES:
    print(f'  {e["emp_code"]}  {e["display_name"]:34s} ลูกทีมตรง {sum(1 for y in rows if y["supervisor_emp_code"] == e["emp_code"])} คน')
print(f'\n--- ข้อสังเกต {len(warnings)} ข้อ ---' if warnings else '\n--- ไม่มีข้อสังเกต ---')
for w in warnings:
    print(' •', w)
print(f'\nเขียน payload → {OUT}')
