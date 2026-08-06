/**
 * Trigger.gs — time-based triggers
 *
 * รัน setupTriggers() 1 ครั้ง — สร้าง:
 *   - dailyTick() ทุกวัน 00:00 (Asia/Bangkok)
 *     - expirePairingCodes()
 *     - resetQuotaYearly() (จะ self-check ว่าวันนี้คือวันรีเซ็ตหรือไม่)
 */
function setupTriggers() {
  // ลบ trigger เดิมที่เกี่ยวกับ function เดียวกัน (รันซ้ำแล้วไม่ได้ trigger ซ้อน)
  const managed = ['dailyTick', 'hourlyReminderTick'];
  const all = ScriptApp.getProjectTriggers();
  all.forEach(function (t) {
    if (managed.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('dailyTick')
    .timeBased().atHour(0).inTimezone('Asia/Bangkok').everyDays(1)
    .create();

  // เตือนผู้อนุมัติที่เงียบ — ตัวฟังก์ชันเช็คเองว่าอยู่ในเวลาทำงานไหม
  ScriptApp.newTrigger('hourlyReminderTick')
    .timeBased().everyHours(1)
    .create();

  console.log('✓ setupTriggers — dailyTick 00:00 (Asia/Bangkok) + hourlyReminderTick ทุกชั่วโมง');
}

function dailyTick() {
  try {
    expirePairingCodes();
  } catch (e) { logError('dailyTick', 'expirePairingCodes failed: ' + e.message); }

  try {
    resetQuotaYearly();
  } catch (e) { logError('dailyTick', 'resetQuotaYearly failed: ' + e.message); }

  logInfo('dailyTick', 'completed at ' + nowBangkok());
}
