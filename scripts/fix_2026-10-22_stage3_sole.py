#!/usr/bin/env python3
"""
ลูกค้าแจ้ง 19 ต.ค. 69 — ขั้น 3 ให้คุณสุธิมาคนเดียว แต่หน้าฐานข้อมูลพนักงานยังมีคุณสุรศักดิ์ 38 คน

สาเหตุ: โค้ด "ผู้บริหารขั้น 3 คนเดียว" ขึ้นระบบแล้ว แต่ Settings `stage3_sole_approver` ยังว่าง
→ ระบบยังใช้ผังรายคนเดิม (สุธิมา + สุรศักดิ์)

ทางแก้: ตั้ง stage3_sole_approver = EXEC-01 (รหัสพนักงานคุณสุธิมา EMP-0014) ครั้งเดียว ครอบทุกคน
⭐ ไม่ลบผังรายคนทีละคน — setApprovalChain ยิงการ์ดไลน์แจ้งพนักงานทุกครั้ง = 38 ข้อความ (โควตา OA เคยหมด)

  python3 scripts/fix_2026-10-22_stage3_sole.py            # ดูก่อน (ไม่เขียน)
  python3 scripts/fix_2026-10-22_stage3_sole.py --commit   # เขียนจริง แล้วอ่านกลับมาตรวจ
"""
import urllib.request, json, sys, time

URL = 'https://script.google.com/macros/s/AKfycbwhvhNvpUJ2LrOCsQ35JA9OpqOR55rBfYoiayWZcqFxo754Os-YXEfmbUNEhOJ_cYN_/exec'
OWNER_LINE_ID = 'Ub47d6b519be013dbe6e83c4fbd079c56'   # พี่ปุ้ย (ผู้บริหาร)
SUTHIMA_ID = 'EMP-0014'
SUTHIMA_CODE = 'EXEC-01'


def call(action, payload, tries=4):
    body = json.dumps({'action': action, 'payload': dict(payload, lineUserId=OWNER_LINE_ID)}).encode()
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(URL, data=body, headers={'Content-Type': 'text/plain;charset=utf-8'})
            return json.loads(urllib.request.urlopen(req, timeout=300).read().decode())
        except Exception as e:
            last = e
            time.sleep(3 * (i + 1))
    raise SystemExit(f'ยิง {action} ไม่สำเร็จ: {last}')


d = call('getEmployeeDirectory', {})
if not d.get('ok'):
    raise SystemExit(f'อ่านทะเบียนไม่ได้: {d}')

# ด่านกันพลาด: รหัส EXEC-01 ต้องชี้ไปที่คุณสุธิมาคนเดียว และผูกไลน์แล้ว
rows = [e for e in d['employees'] if str(e['emp_code']).strip() == SUTHIMA_CODE and e['status'] != 'inactive']
if len(rows) != 1 or rows[0]['user_id'] != SUTHIMA_ID or rows[0]['role'] != 'OWNER' or not rows[0]['has_line']:
    raise SystemExit(f'หยุด: รหัส {SUTHIMA_CODE} ไม่ได้ชี้ไปที่คุณสุธิมาคนเดียวที่ผูกไลน์แล้ว — {rows}')

with_surasak = [e for e in d['employees'] if 'EMP-0015' in e['executive_user_ids']]
print(f'ตอนนี้ stage3_sole = {d.get("stage3_sole")}')
print(f'พนักงานที่ผังรายคนยังมีคุณสุรศักดิ์: {len(with_surasak)} คน')

if '--commit' not in sys.argv:
    print('\nโหมดดูก่อน — ใส่ --commit เพื่อเขียนจริง')
    sys.exit(0)

r = call('updateSettings', {'updates': {'stage3_sole_approver': SUTHIMA_CODE}})
print('updateSettings →', r)
if not r.get('ok') or r.get('mode') != 'applied':
    raise SystemExit('หยุด: ตั้งค่าไม่สำเร็จ')

after = call('getEmployeeDirectory', {}).get('stage3_sole') or {}
print('อ่านกลับ stage3_sole →', after)
if after.get('user_id') != SUTHIMA_ID:
    raise SystemExit('❌ อ่านกลับแล้วยังไม่ใช่คุณสุธิมา')
print('✅ ขั้น 3 = คุณสุธิมาคนเดียว ทุกคนแล้ว — หน้าฐานข้อมูลพนักงานช่องผู้บริหารจะขึ้นชื่อคุณสุธิมาอย่างเดียว')
