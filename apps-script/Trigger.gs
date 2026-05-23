/**
 * Trigger.gs — time-based triggers
 *
 * รัน setupTriggers() 1 ครั้ง — สร้าง:
 *   - dailyTick() ทุกวัน 00:00 (Asia/Bangkok)
 *     - expirePairingCodes()
 *     - resetQuotaYearly() (จะ self-check ว่าวันนี้คือวันรีเซ็ตหรือไม่)
 */
function setupTriggers() {
  // ลบ trigger เดิมที่เกี่ยวกับ function เดียวกัน
  const all = ScriptApp.getProjectTriggers();
  all.forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'dailyTick') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('dailyTick')
    .timeBased().atHour(0).inTimezone('Asia/Bangkok').everyDays(1)
    .create();

  console.log('✓ setupTriggers — dailyTick scheduled 00:00 (Asia/Bangkok) daily');
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
