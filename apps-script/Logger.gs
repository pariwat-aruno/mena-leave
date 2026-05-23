/**
 * Logger.gs — เขียน log ลง sheet `Logs` (I-009)
 *
 * usage:
 *   logInfo('submitLeave', 'leave submitted', { leaveId: 'LV-...' });
 *   logError('approveLeave', 'permission denied', { userId: 'EMP-...' });
 *
 * timestamp: Asia/Bangkok ISO 8601
 */

function logInfo(fnName, message, payload) {
  return appendLog_('info', fnName, message, payload);
}

function logWarn(fnName, message, payload) {
  return appendLog_('warn', fnName, message, payload);
}

function logError(fnName, message, payload) {
  console.error('[' + fnName + '] ' + message, payload);
  return appendLog_('error', fnName, message, payload);
}

function appendLog_(level, fnName, message, payload) {
  try {
    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!sheetId) {
      console.error('SHEET_ID not set — cannot log');
      return;
    }
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Logs');
    if (!sh) {
      console.error('sheet Logs not found');
      return;
    }
    sh.appendRow([
      nowBangkok(),
      level,
      String(fnName || ''),
      String(message || ''),
      payload == null ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    ]);
  } catch (err) {
    console.error('appendLog_ failed:', err && err.message ? err.message : err);
  }
}

/**
 * Audit log — บันทึกทุก action ที่กระทบ data
 * เพิ่ม row ใน Sheet `Audit_Log`
 *
 * usage:
 *   audit(actorUserId, 'approve_leave_s1', 'LeaveRequests', 'LV-XXX', { decision: 'approve' });
 */
function audit(actorUserId, action, targetEntity, targetId, payload, ipOrGps) {
  try {
    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!sheetId) return;
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Audit_Log');
    if (!sh) return;

    let actorRole = '';
    try {
      const user = findUserByUserId_(actorUserId);
      actorRole = (user && user.role) || '';
    } catch (e) {}

    const auditId = 'AUD-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHHmmss') +
                    '-' + Math.floor(Math.random() * 1000);
    sh.appendRow([
      auditId,
      nowBangkok(),
      String(actorUserId || ''),
      actorRole,
      String(action || ''),
      String(targetEntity || ''),
      String(targetId || ''),
      payload == null ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload)),
      String(ipOrGps || ''),
    ]);
  } catch (err) {
    console.error('audit failed:', err && err.message ? err.message : err);
  }
}
