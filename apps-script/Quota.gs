/**
 * Quota.gs — โควตาวันลาต่อปีต่อคน
 *
 * State machine:
 *   submit          → reserved += days
 *   final_approved  → used += days, reserved -= days
 *   rejected        → reserved -= days
 *   yearly_reset    → new row ปีถัดไป
 *
 * Actions:
 *   - getMyQuota(payload)          User: ดู quota ของตัวเอง
 *   - setQuota(payload)            ADMIN: ตั้ง quota ของ user ใดๆ (ผ่าน Pending_Changes ถ้า ADMIN)
 *                                  OWNER: apply ตรง
 *   - reserveQuota(userId, type, days)  helper: ใช้ใน LeaveRequest.submitLeave
 *   - commitQuota(userId, type, days)   helper: ใช้ใน Approval (final approved)
 *   - rollbackQuota(userId, type, days) helper: ใช้ใน Approval (reject ใดๆ)
 *   - resetQuotaYearly()           cron 1 ม.ค.
 */

const LEAVE_TYPES = ['sick', 'personal', 'vacation'];

/** payload = { lineUserId, year? } */
function getMyQuota(payload) {
  payload = payload || {};
  if (!payload.lineUserId) return { ok: false, error: 'missing_line_user_id' };
  const user = findUserByLineId_(payload.lineUserId);
  if (!user) return { ok: false, error: 'not_registered' };

  const year = payload.year || new Date().getFullYear();
  const quota = getQuotaRow_(user.user_id, year);
  if (!quota) return { ok: false, error: 'no_quota_row' };

  return {
    ok: true,
    quota: shapeQuota_(quota),
  };
}

/** payload = { lineUserId, user_id, year, sick_total, personal_total, vacation_total } */
function setQuota(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const year = payload.year || new Date().getFullYear();
  const actor = findUserByLineId_(payload.lineUserId);

  // ADMIN (ไม่ใช่ OWNER) → ผ่าน Pending_Changes
  if (actor.role === ROLES.ADMIN) {
    const changeId = nextChangeId();
    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pending_Changes');
    sh.appendRow([
      changeId,
      actor.user_id,
      'LeaveQuota',
      'Q-' + year + '-' + payload.user_id,
      'update',
      JSON.stringify({
        user_id: payload.user_id, year: year,
        sick_total: Number(payload.sick_total),
        personal_total: Number(payload.personal_total),
        vacation_total: Number(payload.vacation_total),
      }),
      nowBangkok(),
      'pending',
      '', '', '',
    ]);
    audit(payload.lineUserId, 'propose_set_quota', 'Pending_Changes', changeId, payload);
    return { ok: true, mode: 'proposed', changeId: changeId, message: 'ส่งให้ผู้บริหารอนุมัติแล้ว' };
  }

  // OWNER → apply ตรง
  return applySetQuota_({
    user_id: payload.user_id, year: year,
    sick_total: Number(payload.sick_total),
    personal_total: Number(payload.personal_total),
    vacation_total: Number(payload.vacation_total),
  }, actor);
}

/** internal: apply ตรง — เรียกจาก OWNER หรือ approvePendingChange */
function applySetQuota_(data, actor) {
  const quota = getQuotaRow_(data.user_id, data.year);
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveQuota');

  if (!quota) {
    sh.appendRow([
      'Q-' + data.year + '-' + data.user_id,
      data.user_id, data.year,
      isFinite(data.sick_total)     ? data.sick_total     : 0, 0, 0,
      isFinite(data.personal_total) ? data.personal_total : 0, 0, 0,
      isFinite(data.vacation_total) ? data.vacation_total : 0, 0, 0,
      nowBangkok(),
    ]);
  } else {
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (isFinite(data.sick_total))     sh.getRange(quota._rowNumber, hdr.indexOf('sick_total') + 1).setValue(data.sick_total);
    if (isFinite(data.personal_total)) sh.getRange(quota._rowNumber, hdr.indexOf('personal_total') + 1).setValue(data.personal_total);
    if (isFinite(data.vacation_total)) sh.getRange(quota._rowNumber, hdr.indexOf('vacation_total') + 1).setValue(data.vacation_total);
    sh.getRange(quota._rowNumber, hdr.indexOf('updated_at') + 1).setValue(nowBangkok());
  }

  audit(actor && actor.line_user_id, 'set_quota', 'LeaveQuota', 'Q-' + data.year + '-' + data.user_id, data);

  // push notify ผู้ที่ถูกปรับ
  try {
    const user = findUserByUserId_(data.user_id);
    if (user && user.line_user_id) {
      const updated = getQuotaRow_(data.user_id, data.year);
      pushMessage(user.line_user_id, buildQuotaSetCard(user, shapeQuota_(updated)));
    }
  } catch (e) {
    logWarn('applySetQuota_', 'push notify failed: ' + e.message);
  }

  return { ok: true, mode: 'applied' };
}

// ========== Helpers (called by LeaveRequest + Approval) ==========

function reserveQuota(userId, leaveType, days) {
  return adjustQuota_(userId, leaveType, { reserved: days });
}

function commitQuota(userId, leaveType, days) {
  return adjustQuota_(userId, leaveType, { used: days, reserved: -days });
}

function rollbackQuota(userId, leaveType, days) {
  return adjustQuota_(userId, leaveType, { reserved: -days });
}

function adjustQuota_(userId, leaveType, deltas) {
  if (LEAVE_TYPES.indexOf(leaveType) < 0) {
    throw new Error('invalid leave_type: ' + leaveType);
  }
  const year = new Date().getFullYear();
  let quota = getQuotaRow_(userId, year);
  if (!quota) {
    // ensure row exists with defaults
    ensureQuotaRow_(userId);
    quota = getQuotaRow_(userId, year);
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveQuota');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  if (deltas.used != null) {
    const col = leaveType + '_used';
    const cur = Number(quota[col] || 0);
    const next = Math.max(0, cur + Number(deltas.used));
    sh.getRange(quota._rowNumber, hdr.indexOf(col) + 1).setValue(next);
  }
  if (deltas.reserved != null) {
    const col = leaveType + '_reserved';
    const cur = Number(quota[col] || 0);
    const next = Math.max(0, cur + Number(deltas.reserved));
    sh.getRange(quota._rowNumber, hdr.indexOf(col) + 1).setValue(next);
  }
  sh.getRange(quota._rowNumber, hdr.indexOf('updated_at') + 1).setValue(nowBangkok());
}

/** helper อ่าน quota row */
function getQuotaRow_(userId, year) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveQuota');
  const last = sh.getLastRow();
  if (last < 2) return null;

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iUser = hdr.indexOf('user_id');
  const iYear = hdr.indexOf('year');
  const data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][iUser] === userId && Number(data[i][iYear]) === Number(year)) {
      const row = {};
      hdr.forEach(function (h, j) { row[h] = data[i][j]; });
      row._rowNumber = i + 2;
      return row;
    }
  }
  return null;
}

/** ขยาย quota row → object พร้อม available ของแต่ละ type */
function shapeQuota_(quota) {
  const t = {};
  LEAVE_TYPES.forEach(function (lt) {
    const total = Number(quota[lt + '_total'] || 0);
    const used = Number(quota[lt + '_used'] || 0);
    const reserved = Number(quota[lt + '_reserved'] || 0);
    t[lt] = {
      total: total,
      used: used,
      reserved: reserved,
      available: Math.max(0, total - used - reserved),
    };
  });
  return {
    user_id: quota.user_id,
    year: Number(quota.year),
    sick: t.sick,
    personal: t.personal,
    vacation: t.vacation,
  };
}

/** cron 1 ม.ค. — สร้าง row ปีใหม่จาก default Settings (ไม่ carry vacation by default) */
function resetQuotaYearly() {
  const today = new Date();
  const cfg = getConfig();
  const resetMonth = Number(cfg.quota_reset_month || 1);
  const resetDay = Number(cfg.quota_reset_day || 1);

  if (today.getMonth() + 1 !== resetMonth || today.getDate() !== resetDay) {
    logInfo('resetQuotaYearly', 'not reset day — skip');
    return { ok: true, skipped: true };
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(sheetId);
  const usersSh = ss.getSheetByName('Users');
  const quotaSh = ss.getSheetByName('LeaveQuota');
  const year = today.getFullYear();

  if (usersSh.getLastRow() < 2) return { ok: true, created: 0 };

  const uHdr = usersSh.getRange(1, 1, 1, usersSh.getLastColumn()).getValues()[0];
  const uIId = uHdr.indexOf('user_id');
  const uIStatus = uHdr.indexOf('status');
  const users = usersSh.getRange(2, 1, usersSh.getLastRow() - 1, usersSh.getLastColumn()).getValues();

  let created = 0;
  users.forEach(function (row) {
    if (row[uIStatus] !== 'active') return;
    const userId = row[uIId];
    const existing = getQuotaRow_(userId, year);
    if (existing) return;
    quotaSh.appendRow([
      'Q-' + year + '-' + userId, userId, year,
      Number(cfg.default_sick_total || 30), 0, 0,
      Number(cfg.default_personal_total || 6), 0, 0,
      Number(cfg.default_vacation_total || 10), 0, 0,
      nowBangkok(),
    ]);
    created++;
  });

  logInfo('resetQuotaYearly', 'created ' + created + ' row for year ' + year);
  audit('(system)', 'quota_yearly_reset', 'LeaveQuota', String(year), { created: created });

  return { ok: true, created: created };
}
