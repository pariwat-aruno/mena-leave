#!/usr/bin/env python3
"""
แก้ข้อมูลบน prod ตามที่ลูกค้าแจ้ง 19 ก.ย. 69 — รันซ้ำได้ (idempotent)

  python3 scripts/fix_2026-09-19_surasak.py            # ดูก่อน (ไม่เขียน)
  python3 scripts/fix_2026-09-19_surasak.py --commit   # เขียนจริง

ทำ 3 อย่าง:
  1. ปิดแถวซ้ำของคุณสุรศักดิ์ EMP-0070..0075 (รหัส 4501 ซ้ำ 6 แถว เกิดจากกดเชิญซ้ำ)
     — แถวพวกนี้ไม่มีใครอ้างในสายอนุมัติเลย (ตรวจแล้ว) และไม่เคยผูกไลน์
  2. ตั้งรหัสพนักงานของแถวผู้บริหารตัวจริง EMP-0015 จาก EXEC-02 → 4501
     คุณสุรศักดิ์จะผูกบัญชีเองได้ด้วย รหัส 4501 + ชื่อ-นามสกุล → เข้าเป็นผู้บริหาร
     (ต้อง deploy Apps Script เวอร์ชันที่มี updateEmployeeProfile ก่อน)
  3. ตำแหน่งชั่งวัตถุดิบ 3 คน → ผู้บริหารในสาย = คุณสุรศักดิ์ (EMP-0015) คนเดียว

⭐ POST ด้วย urllib (curl -L ทำ body หาย) · Web App ตอบ 404 สุ่มได้ จึง retry
"""
import urllib.request, json, sys, time

URL = 'https://script.google.com/macros/s/AKfycbwhvhNvpUJ2LrOCsQ35JA9OpqOR55rBfYoiayWZcqFxo754Os-YXEfmbUNEhOJ_cYN_/exec'
OWNER_LINE_ID = 'Ub47d6b519be013dbe6e83c4fbd079c56'   # พี่ปุ้ย (ผู้บริหาร)

DUP_ROWS = ['EMP-0070', 'EMP-0071', 'EMP-0072', 'EMP-0073', 'EMP-0074', 'EMP-0075']
SURASAK = 'EMP-0015'
SURASAK_CODE = '4501'
WEIGHING_STAFF = ['EMP-0037', 'EMP-0045', 'EMP-0063']   # ตำแหน่งชั่งวัตถุดิบ


def call(action, payload, tries=4):
    payload = dict(payload, lineUserId=OWNER_LINE_ID)
    body = json.dumps({'action': action, 'payload': payload}).encode()
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(URL, data=body, headers={'Content-Type': 'text/plain;charset=utf-8'})
            return json.loads(urllib.request.urlopen(req, timeout=300).read().decode())
        except Exception as e:
            last = e
            time.sleep(3 * (i + 1))
    raise SystemExit(f'ยิง {action} ไม่สำเร็จ: {last}')


commit = '--commit' in sys.argv
d = call('getEmployeeDirectory', {'include_inactive': True})
if not d.get('ok'):
    raise SystemExit(f'อ่านทะเบียนไม่ได้: {d}')
by = {e['user_id']: e for e in d['employees']}

# ด่านกันพลาด: แถวซ้ำต้องไม่ถูกอ้างในสายอนุมัติ และต้องไม่เคยผูกไลน์
refs = set()
for e in d['employees']:
    refs.update(e['executive_user_ids'])
    if e['supervisor_user_id']:
        refs.add(e['supervisor_user_id'])
for uid in DUP_ROWS:
    e = by.get(uid)
    if not e:
        continue
    if uid in refs or e['has_line']:
        raise SystemExit(f'หยุด: {uid} ถูกอ้างในสายอนุมัติหรือผูกไลน์แล้ว — ต้องตรวจด้วยคนก่อน')

print('เขียนจริง' if commit else 'ดูก่อน (ไม่เขียน)')

print('\n1) ปิดแถวซ้ำ')
for uid in DUP_ROWS:
    e = by.get(uid)
    if not e or e['status'] == 'inactive':
        print(f'   {uid}: ปิดอยู่แล้ว / ไม่มี — ข้าม')
        continue
    print(f"   {uid} {e['emp_code']} {e['display_name']} ({e['status']}) → inactive")
    if commit:
        print('     ', call('setUserStatus', {'user_id': uid, 'status': 'inactive'}))

print('\n2) รหัสพนักงานผู้บริหาร')
s = by[SURASAK]
if str(s['emp_code']) == SURASAK_CODE:
    print(f'   {SURASAK} รหัส {SURASAK_CODE} อยู่แล้ว — ข้าม')
else:
    print(f"   {SURASAK} {s['display_name']} ({s['role']}) รหัส {s['emp_code']} → {SURASAK_CODE}")
    if commit:
        r = call('updateEmployeeProfile', {'user_id': SURASAK, 'emp_code': SURASAK_CODE})
        print('     ', r)
        if r.get('error') == 'exception' or 'unknown' in json.dumps(r):
            print('      ⚠️ prod ยังไม่มีคำสั่งนี้ — deploy Apps Script เวอร์ชันใหม่ก่อนแล้วรันซ้ำ')

print('\n3) ผู้บริหารในสายของตำแหน่งชั่งวัตถุดิบ')
for uid in WEIGHING_STAFF:
    e = by[uid]
    if e['executive_user_ids'] == [SURASAK]:
        print(f"   {uid} {e['display_name']}: เป็นคุณสุรศักดิ์คนเดียวอยู่แล้ว — ข้าม")
        continue
    print(f"   {uid} {e['display_name']} ({e['position']}): {e['executive_names']} → ['{s['display_name']}']")
    if commit:
        print('     ', call('setApprovalChain', {'user_id': uid, 'executive_user_ids': [SURASAK]}))

if not commit:
    print('\nพอใจแล้วสั่ง: python3 scripts/fix_2026-09-19_surasak.py --commit')
