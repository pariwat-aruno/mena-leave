# Phase 1 — Sheet + Drive setup ✅

> AI agent ใช้ checklist นี้ตรวจหลัง user รัน `setupAll()`

## Sheet structure
- [ ] เปิด Sheet ที่ created ได้สำเร็จ
- [ ] มี tab ครบ 10 tab: `Users` / `Supervisors` / `LeaveRequests` / `LeaveQuota` / `LeaveRules` / `Pairing_Codes` / `Pending_Changes` / `Audit_Log` / `Logs` / `Settings`
- [ ] ทุก tab มี header แถวแรก
- [ ] ทุก tab freeze row 1
- [ ] ไม่มี tab Sheet1 หลงเหลือ

## Headers
- [ ] `Users` 15 cols ตรงกับ CONTEXT.md § 4 (user_id ถึง approved_by)
- [ ] `LeaveRequests` 27 cols ครบ (รวม stage1/2/3_status/by/at/note + final_status)
- [ ] `LeaveQuota` 13 cols (รวม sick/personal/vacation × 3 (total/used/reserved))
- [ ] `Supervisors` 6 cols
- [ ] `LeaveRules` 9 cols
- [ ] `Pairing_Codes` 9 cols
- [ ] `Pending_Changes` 11 cols
- [ ] `Audit_Log` 9 cols
- [ ] `Logs` 5 cols
- [ ] `Settings` 3 cols

## Settings seed
- [ ] Settings มี 19 rows (ทุก key default ตาม `SETTINGS_DEFAULTS`)
- [ ] `brand_name = MENA COSMETICS`
- [ ] `approval_levels = 3`
- [ ] `gps_required = TRUE`
- [ ] `default_sick_total = 30`
- [ ] `default_personal_total = 6`
- [ ] `default_vacation_total = 10`

## Rules seed
- [ ] LeaveRules มี 3 rows: sick / personal / vacation
- [ ] sick มี `doc_required_above_days = 3`
- [ ] personal มี `advance_notice_days = 3`
- [ ] vacation มี `advance_notice_days = 7`

## Drive
- [ ] Drive folder `mena-leave - Storage` มีอยู่
- [ ] sub-folder `leave-proofs` มีอยู่
- [ ] Sharing permission = anyone with link (เช็ค: visit URL ไม่ต้อง login)

## Properties
- [ ] Script Properties มี `SHEET_ID` set (ไม่ว่าง)
- [ ] มี `DRIVE_FOLDER_ID` set
- [ ] มี `DRIVE_FOLDER_LEAVE_PROOFS` set

## Verify command
รันใน Apps Script editor:
```javascript
function verifyPhase1() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('SHEET_ID missing');
  const ss = SpreadsheetApp.openById(sheetId);
  const expected = ['Users','Supervisors','LeaveRequests','LeaveQuota','LeaveRules',
                    'Pairing_Codes','Pending_Changes','Audit_Log','Logs','Settings'];
  expected.forEach(n => {
    const sh = ss.getSheetByName(n);
    if (!sh) throw new Error('missing tab: ' + n);
    if (sh.getLastRow() < 1) throw new Error('empty headers: ' + n);
  });
  console.log('✅ phase 1 verified');
}
```
