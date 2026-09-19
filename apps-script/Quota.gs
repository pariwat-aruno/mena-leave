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

// ประเภทลาที่ "มีโควตา" (หักจาก LeaveQuota sheet)
const LEAVE_TYPES = ['sick', 'personal', 'vacation'];

// "ลาอื่น ๆ" — ลาตามกฎหมายแรงงาน ไม่หักโควตา sick/personal/vacation
// บังคับแค่การแจ้งล่วงหน้าตาม meta.advance (ลาคลอดยกเว้นกรณีฉุกเฉิน)
const OTHER_LEAVE_TYPES = ['maternity', 'paternity', 'sterilization', 'military', 'training', 'ordination'];

const ALL_LEAVE_TYPES = LEAVE_TYPES.concat(OTHER_LEAVE_TYPES);

// นิยามกลางของทุกประเภทลา — label + วันแจ้งล่วงหน้า + อนุญาตลาย้อนหลัง(ฉุกเฉิน) + มีโควตาไหม
// ใช้ร่วมทั้งระบบ (leaveTypeLabel_ ใน FlexCard.gs อ่านจากตัวนี้ผ่าน global scope)
const LEAVE_TYPE_META = {
  sick:          { label: 'ลาป่วย',                quota: true,  advance: 0,  allowRetro: true },
  personal:      { label: 'ลากิจ',                 quota: true,  advance: 3,  allowRetro: false },
  vacation:      { label: 'ลาพักร้อน',             quota: true,  advance: 7,  allowRetro: false },
  maternity:     { label: 'ลาคลอด',                quota: false, advance: 3,  allowRetro: true },
  paternity:     { label: 'ลาช่วยภรรยาดูแลบุตร',   quota: false, advance: 7,  allowRetro: false },
  sterilization: { label: 'ลาเพื่อทำหมัน',         quota: false, advance: 7,  allowRetro: false },
  military:      { label: 'ลาเพื่อรับราชการทหาร',  quota: false, advance: 7,  allowRetro: false },
  training:      { label: 'ลาเพื่อรับการฝึกอบรม',  quota: false, advance: 3,  allowRetro: false },
  ordination:    { label: 'ลาอุปสมบท',             quota: false, advance: 15, allowRetro: false },
};

/** ประเภทลานี้หักโควตาไหม (sick/personal/vacation = true) */
function isQuotaLeaveType_(t) {
  return LEAVE_TYPES.indexOf(t) >= 0;
}

/** payload = { lineUserId, year? } */
function getMyQuota(payload) {
  payload = payload || {};
  if (!payload.lineUserId) return { ok: false, error: 'missing_line_user_id' };
  const user = findUserByLineId_(payload.lineUserId);
  if (!user) return { ok: false, error: 'not_registered' };

  const year = payload.year || currentYearBangkok_();
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

  const year = payload.year || currentYearBangkok_();
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

/**
 * ทุกตัวรับ year ของ "วันลา" ได้ — ไม่ส่งมาจะใช้ปีปัจจุบัน
 * ยื่นเดือนธันวาคมเพื่อลาเดือนมกราคม ต้องหักโควตาปีหน้า ไม่ใช่ปีที่กดส่ง
 */
function reserveQuota(userId, leaveType, days, year) {
  return adjustQuota_(userId, leaveType, { reserved: days }, year);
}

function commitQuota(userId, leaveType, days, year) {
  return adjustQuota_(userId, leaveType, { used: days, reserved: -days }, year);
}

function rollbackQuota(userId, leaveType, days, year) {
  return adjustQuota_(userId, leaveType, { reserved: -days }, year);
}

/** ปีของโควตาที่ใบลาใบนี้ต้องไปหัก — อิงวันเริ่มลา */
function quotaYearOf_(leave) {
  const from = leave && leave.date_from;
  if (!from) return currentYearBangkok_();
  const ymd = (from instanceof Date)
    ? Utilities.formatDate(from, 'Asia/Bangkok', 'yyyy-MM-dd')
    : String(from).slice(0, 10);
  return yearOfYmd_(ymd);
}

/**
 * คืนวันลาที่ "หักไปแล้ว" (used) — ใช้ตอนยกเลิกใบลาที่อนุมัติครบแล้ว
 * ต้องส่ง year ของใบลามาด้วย ไม่งั้นยกเลิกใบของปีที่แล้วจะไปคืนโควตาปีนี้
 */
function uncommitQuota(userId, leaveType, days, year) {
  return adjustQuota_(userId, leaveType, { used: -days }, year);
}

function adjustQuota_(userId, leaveType, deltas, forYear) {
  if (LEAVE_TYPES.indexOf(leaveType) < 0) {
    throw new Error('invalid leave_type: ' + leaveType);
  }
  const year = Number(forYear) || currentYearBangkok_();
  let quota = getQuotaRow_(userId, year);
  if (!quota) {
    // ensure row exists with defaults
    ensureQuotaRow_(userId, year);
    quota = getQuotaRow_(userId, year);
  }
  if (!quota) {
    // ปีเก่าที่ไม่มีแถวโควตาแล้ว — ปรับไม่ได้ ต้องดังไว้ใน log ไม่ใช่เงียบแล้วเลขเพี้ยน
    logError('adjustQuota_', 'ไม่มีแถวโควตาให้ปรับ', { userId: userId, leaveType: leaveType, year: year, deltas: deltas });
    return;
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveQuota');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  if (deltas.used != null) {
    const col = leaveType + '_used';
    const cur = Number(quota[col] || 0);
    const next = roundDays_(Math.max(0, cur + Number(deltas.used)));
    sh.getRange(quota._rowNumber, hdr.indexOf(col) + 1).setValue(next);
  }
  if (deltas.reserved != null) {
    const col = leaveType + '_reserved';
    const cur = Number(quota[col] || 0);
    const next = roundDays_(Math.max(0, cur + Number(deltas.reserved)));
    sh.getRange(quota._rowNumber, hdr.indexOf(col) + 1).setValue(next);
  }
  sh.getRange(quota._rowNumber, hdr.indexOf('updated_at') + 1).setValue(nowBangkok());
}

/** ปัดจำนวนวันเป็น 4 ตำแหน่ง (หน่วยเล็กสุดของลาชั่วโมง = 1/10000 วัน) */
function roundDays_(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
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
      // ปัดทศนิยม 4 ตำแหน่ง — ลาเป็นชั่วโมงทำให้เกิดเศษ 0.1+0.2 แล้วคนใช้วันที่เหลือพอดีไม่ได้
      available: roundDays_(Math.max(0, total - used - reserved)),
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
  // ⭐ อ่านวันที่ตามเวลาไทยเสมอ — trigger ยิงเที่ยงคืนไทย ถ้าอ่านด้วย today.getDate()
  // จะได้วันตาม timezone ของโปรเจกต์ ซึ่งอาจยังเป็น "เมื่อวาน" → เงื่อนไขไม่มีวันตรง
  // = reset โควตาปีใหม่ไม่ทำงานเลย แบบเงียบ ๆ (log บอกว่า skip ทุกวัน)
  const todayYmd = todayBangkok();
  const cfg = getConfig();
  const resetMonth = Number(cfg.quota_reset_month || 1);
  const resetDay = Number(cfg.quota_reset_day || 1);

  if (Number(todayYmd.slice(5, 7)) !== resetMonth || Number(todayYmd.slice(8, 10)) !== resetDay) {
    logInfo('resetQuotaYearly', 'not reset day — skip');
    return { ok: true, skipped: true };
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(sheetId);
  const usersSh = ss.getSheetByName('Users');
  const quotaSh = ss.getSheetByName('LeaveQuota');
  const year = Number(todayYmd.slice(0, 4));

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
