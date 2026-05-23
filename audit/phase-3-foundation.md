# Phase 3 — Apps Script foundation ✅

## clasp config
- [ ] `apps-script/.clasp.json` มี scriptId + rootDir = "."
- [ ] `apps-script/.claspignore` อยู่ครบ
- [ ] `apps-script/appsscript.json` มี `"timeZone": "Asia/Bangkok"`
- [ ] รัน `clasp push --force` สำเร็จ
- [ ] เปิด Apps Script editor (`clasp open-script`) เห็นไฟล์ครบ:

## ไฟล์ใน Apps Script
- [ ] Setup.gs
- [ ] Logger.gs
- [ ] Config.gs
- [ ] Utils.gs
- [ ] LineApi.gs
- [ ] DriveStore.gs
- [ ] FlexCard.gs
- [ ] Pairing.gs
- [ ] Register.gs
- [ ] Supervisor.gs
- [ ] Quota.gs
- [ ] Rules.gs
- [ ] LeaveRequest.gs
- [ ] Approval.gs
- [ ] Admin.gs
- [ ] Manual.gs
- [ ] Trigger.gs
- [ ] WebApp.gs

## Sanity test (ในศ Apps Script editor)
- [ ] รัน `setupAll()` — สร้าง Sheet + Drive + Settings + Properties ครบ
- [ ] รัน `bootstrapFirstOwner('U<พี่ปุ้ย-line-userId>')` — Users มี OWNER 1 row + LeaveQuota 1 row
- [ ] รัน `pushText('U<owner-id>', 'ทดสอบ')` — รับข้อความใน LINE = LineApi ทำงาน
- [ ] รัน `previewAllCardsToOwner()` — รับ flex card ทั้ง 11 type ใน LINE
- [ ] เช็ค Sheet `Logs` มี info entries
- [ ] เช็ค Sheet `Audit_Log` มี entries จาก bootstrap

## Role helpers
- [ ] `isOwner('U<owner-id>')` → true
- [ ] `isAdmin('U<owner-id>')` → true (OWNER inherits ADMIN)
- [ ] `isOwner('Uxxx-not-exist')` → false
