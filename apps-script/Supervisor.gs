/**
 * Supervisor.gs — HR ผูก supervisor ↔ subordinate
 *
 * Actions:
 *   - pairSupervisor(payload)        ADMIN ผูก subordinate กับ supervisor
 *   - unpairSupervisor(payload)      ADMIN ลบ pair (set valid_to)
 *   - setSupervisorFlag(payload)     ADMIN toggle is_supervisor บน Users
 *   - getSupervisorFor(userId)       return supervisor user_id หรือ null (helper, ใช้ใน Approval)
 *   - listSupervisorPairs(payload)   ADMIN ดู pair ทั้งหมด (active)
 *
 * กฎ:
 *   - USER 1 คนมี supervisor active ได้ 1 คน (1-to-1)
 *   - เปลี่ยน supervisor → set old.valid_to = now, insert new row
 */

/** payload = { lineUserId, user_id, supervisor_user_id } */
function pairSupervisor(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id || !payload.supervisor_user_id) return { ok: false, error: 'missing_fields' };
  if (payload.user_id === payload.supervisor_user_id) return { ok: false, error: 'self_pair_not_allowed' };

  const subordinate = findUserByUserId_(payload.user_id);
  const supervisor = findUserByUserId_(payload.supervisor_user_id);
  if (!subordinate) return { ok: false, error: 'subordinate_not_found' };
  if (!supervisor) return { ok: false, error: 'supervisor_not_found' };

  // ensure supervisor flag = TRUE
  if (!(supervisor.is_supervisor === true || supervisor.is_supervisor === 'TRUE')) {
    setSupervisorFlag({
      lineUserId: payload.lineUserId,
      user_id: payload.supervisor_user_id,
      is_supervisor: true,
    });
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Supervisors');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iUser = hdr.indexOf('user_id');
  const iSup = hdr.indexOf('supervisor_user_id');
  const iValidTo = hdr.indexOf('valid_to');

  const now = nowBangkok();

  // invalidate old active pair ของ subordinate
  if (sh.getLastRow() >= 2) {
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][iUser] === payload.user_id && !data[i][iValidTo]) {
        if (data[i][iSup] === payload.supervisor_user_id) {
          return { ok: true, message: 'already_paired' };
        }
        sh.getRange(i + 2, iValidTo + 1).setValue(now);
      }
    }
  }

  // insert new row
  const pairId = nextPairId();
  const approver = findUserByLineId_(payload.lineUserId);
  sh.appendRow([
    pairId,
    payload.user_id,
    payload.supervisor_user_id,
    now,
    '',  // valid_to = empty → active
    approver ? approver.user_id : '(system)',
  ]);

  logInfo('pairSupervisor', 'paired', { pairId: pairId, sub: payload.user_id, sup: payload.supervisor_user_id });
  audit(payload.lineUserId, 'supervisor_pair', 'Supervisors', pairId, {
    user_id: payload.user_id, supervisor_user_id: payload.supervisor_user_id,
  });

  // push notify subordinate
  try {
    if (subordinate.line_user_id) {
      pushMessage(subordinate.line_user_id, buildSupervisorPairedCard(subordinate, supervisor));
    }
  } catch (e) {
    logWarn('pairSupervisor', 'push notify failed: ' + e.message);
  }

  return { ok: true, pairId: pairId };
}

/** payload = { lineUserId, user_id }  — invalidate active pair */
function unpairSupervisor(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Supervisors');
  if (sh.getLastRow() < 2) return { ok: true, message: 'no_pair' };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iUser = hdr.indexOf('user_id');
  const iValidTo = hdr.indexOf('valid_to');
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  let count = 0;
  const now = nowBangkok();
  for (let i = 0; i < data.length; i++) {
    if (data[i][iUser] === payload.user_id && !data[i][iValidTo]) {
      sh.getRange(i + 2, iValidTo + 1).setValue(now);
      count++;
    }
  }
  audit(payload.lineUserId, 'supervisor_unpair', 'Users', payload.user_id, { count: count });
  return { ok: true, unpaired: count };
}

/** payload = { lineUserId, user_id, is_supervisor: boolean } */
function setSupervisorFlag(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const user = findUserByUserId_(payload.user_id);
  if (!user) return { ok: false, error: 'user_not_found' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(user._rowNumber, hdr.indexOf('is_supervisor') + 1).setValue(!!payload.is_supervisor);

  audit(payload.lineUserId, 'set_supervisor_flag', 'Users', payload.user_id, { is_supervisor: !!payload.is_supervisor });
  return { ok: true };
}

/** helper: หา supervisor user_id ของ user คนนี้ (active) — return null ถ้าไม่มี */
function getSupervisorFor(userId) {
  if (!userId) return null;
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Supervisors');
  if (sh.getLastRow() < 2) return null;

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iUser = hdr.indexOf('user_id');
  const iSup = hdr.indexOf('supervisor_user_id');
  const iValidTo = hdr.indexOf('valid_to');
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][iUser] === userId && !data[i][iValidTo]) {
      return data[i][iSup];
    }
  }
  return null;
}

/** payload = { lineUserId } — ADMIN ดู pair ทั้งหมด active */
function listSupervisorPairs(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Supervisors');
  if (sh.getLastRow() < 2) return { ok: true, pairs: [] };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const iValidTo = hdr.indexOf('valid_to');

  const pairs = data
    .filter(function (row) { return !row[iValidTo]; })
    .map(function (row) {
      const obj = {};
      hdr.forEach(function (h, j) { obj[h] = row[j]; });
      const sub = findUserByUserId_(obj.user_id);
      const sup = findUserByUserId_(obj.supervisor_user_id);
      obj.subordinate_name = sub ? sub.display_name : '';
      obj.supervisor_name = sup ? sup.display_name : '';
      return obj;
    });

  return { ok: true, pairs: pairs };
}
