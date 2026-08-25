#!/usr/bin/env python3
"""
ยิง payload เข้า importEmployees บน Web App จริง

  python3 scripts/run_import.py            # พรีวิว (ไม่เขียนอะไร)
  python3 scripts/run_import.py --commit   # เขียนจริง

⭐ POST ด้วย curl -L ใช้ไม่ได้กับ Apps Script (redirect ทำ body หาย) — ต้อง urllib
⭐ Web App คืน 404 แบบสุ่มเป็นครั้งคราว จึง retry ก่อนสรุปว่าพัง
"""
import urllib.request, urllib.error, json, sys, time, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://script.google.com/macros/s/AKfycbwhvhNvpUJ2LrOCsQ35JA9OpqOR55rBfYoiayWZcqFxo754Os-YXEfmbUNEhOJ_cYN_/exec'
OWNER_LINE_ID = 'Ub47d6b519be013dbe6e83c4fbd079c56'   # พี่ปุ้ย (ผู้บริหาร)

def call(action, payload, tries=4):
    body = json.dumps({'action': action, 'payload': payload}).encode()
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(URL, data=body,
                                         headers={'Content-Type': 'text/plain;charset=utf-8'})
            return json.loads(urllib.request.urlopen(req, timeout=300).read().decode())
        except Exception as e:
            last = e
            print(f'  ลองใหม่ครั้งที่ {i+1} ({e})', file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise SystemExit(f'ยิงไม่สำเร็จหลังลอง {tries} ครั้ง: {last}')

commit = '--commit' in sys.argv
rows = json.load(open(os.path.join(BASE, 'scripts/mena_import_payload.json')))['rows']

print(f'{"เขียนจริง" if commit else "พรีวิว (ไม่เขียน)"} — {len(rows)} แถว')
r = call('importEmployees', {'lineUserId': OWNER_LINE_ID, 'rows': rows, 'dry_run': not commit})

if not r.get('ok'):
    print('ไม่สำเร็จ:', json.dumps(r, ensure_ascii=False, indent=2))
    raise SystemExit(1)

s = r['summary']
print(f"\n  สร้างใหม่      {s['create']} คน")
print(f"  แก้ของเดิม     {s['update']} คน")
print(f"  ไม่เปลี่ยน     {s['unchanged']} คน")
print(f"  ติดธงหัวหน้า   {s['supervisor_flag_add']} คน")
print(f"  เพิ่มสายอนุมัติ {s['chain_add']} แถว")
print(f"  ปิดสายเก่า     {s['chain_close']} แถว")
if s['problems']:
    print(f"\n  ข้อสังเกต {len(s['problems'])} ข้อ")
    for p in s['problems']:
        print('   •', p)

if not commit and r.get('plan'):
    ups = [p for p in r['plan'] if p['action'] == 'update']
    if ups:
        print('\n  แถวเดิมที่จะถูกแก้:')
        for p in ups:
            print(f"   • {p['emp_code']} {p['display_name']} ({p['user_id']}) → "
                  + ', '.join(f'{k}={v}' for k, v in p['changes'].items()))
    print('\n  พอใจแล้วสั่งต่อ: python3 scripts/run_import.py --commit')
