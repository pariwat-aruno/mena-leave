# Phase 7 — Triggers ✅

## Setup
- [ ] รัน `setupTriggers()` ใน Apps Script editor (อนุญาต OAuth ตอน prompt)
- [ ] Triggers panel (clock icon ซ้าย) มี 1 trigger:
  - function: `dailyTick`
  - event: Time-driven, Day timer, 0am-1am
  - timezone: Asia/Bangkok

## Manual test
- [ ] รัน `dailyTick()` ตรงๆ ใน editor — ไม่ error
- [ ] เช็ค Sheet `Logs` — มี info "dailyTick completed"
- [ ] รัน `expirePairingCodes()` ที่มี Pairing_Codes row expired — status เปลี่ยน expired

## Yearly reset
- [ ] รัน `resetQuotaYearly()` ตรงๆ:
  - ถ้าวันนี้ไม่ใช่ 1 ม.ค. → return skipped: true (ปกติ)
  - log ใน Sheet Logs
- [ ] (ทดสอบเต็มได้โดยตั้ง quota_reset_month + quota_reset_day = วันนี้ใน Settings ชั่วคราว)
  - run → LeaveQuota มี row ใหม่ของปีถัดไป สำหรับ user active ทุกคน
  - return created: N
  - คืน Settings เป็นค่าเดิม

## Monitoring
- [ ] ดู Apps Script execution log → trigger ทำงานทุกวัน ไม่ error
- [ ] ถ้า trigger fail consecutive 7 ครั้ง → Google จะส่ง email แจ้ง

## Cleanup (ถ้าต้อง re-setup)
```javascript
function deleteAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('all triggers deleted');
}
```
