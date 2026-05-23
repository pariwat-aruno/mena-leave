/**
 * Register.gs — Visitor ลงทะเบียน → HR (ADMIN) approve → active
 *
 * Actions:
 *   - submitRegister(payload)       Visitor กรอกฟอร์ม register
 *   - approveRegister(payload)      ADMIN กด approve ใน flex
 *   - rejectRegister(payload)       ADMIN กด reject ใน flex
 *   - getMyStatus(payload)          ตรวจสถานะของ lineUserId (visitor / pending / active)
 */

/**
 * payload = { lineUserId, displayName, emp_code, phone, email, department, position }
 *
 * - ถ้าไม่มี Users row → สร้างใหม่ status=pending
 * - ถ้ามีอยู่แล้ว status=pending → ตอบ "รออนุมัติ"
 * - ถ้ามีอยู่ active → ตอบ "ลงทะเบียนแล้ว"
 * - push Flex card หา ADMIN ทุกคน
 */
function submitRegister(payload) {
  payload = payload || {};
  const lineUserId = payload.lineUserId;
  if (!lineUserId) return { ok: false, error: 'missing_line_user_id' };

  const existing = findUserByLineId_(lineUserId);
  if (existing) {
    if (existing.status === 'pending') {
      return { ok: true, status: 'pending', message: 'รอ HR อนุมัติ' };
    }
    if (existing.status === 'active') {
      return { ok: true, status: 'active', user: existing };
    }
    if (existing.status === 'inactive') {
      return { ok: false, error: 'inactive', message: 'บัญชีถูกระงับการใช้งาน กรุณาติดต่อ HR' };
    }
  }

  // create new Users row
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const userId = nextUserId();
  const now = nowBangkok();

  // [user_id, line_user_id, role, display_name, emp_code, phone, email, dept, position,
  //  is_supervisor, status, invited_by, created_at, approved_at, approved_by]
  sh.appendRow([
    userId,
    lineUserId,
    ROLES.USER,
    payload.displayName || '',
    payload.emp_code || '',
    payload.phone || '',
    payload.email || '',
    payload.department || '',
    payload.position || '',
    false,
    'pending',
    '(self-register)',
    now,
    '',
    '',
  ]);

  logInfo('submitRegister', 'new user pending', { userId: userId, lineUserId: lineUserId });
  audit(lineUserId, 'register_submit', 'Users', userId, { displayName: payload.displayName });

  // push flex หา ADMIN ทุกคน + OWNER ด้วย (กรณีไม่มี ADMIN ตอนแรก)
  const newUser = findUserByUserId_(userId);
  try {
    const card = buildRegisterPendingCard(newUser);
    pushToAllAdmins(card);
    pushToAllOwners(card);
  } catch (e) {
    logWarn('submitRegister', 'push to admin failed: ' + e.message);
  }

  return { ok: true, status: 'pending', userId: userId, message: 'ส่งคำขอลงทะเบียนแล้ว รอ HR อนุมัติ' };
}

/**
 * payload = { lineUserId, user_id }  (lineUserId = ADMIN ผู้กด)
 */
function approveRegister(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) {
    return { ok: false, error: 'forbidden' };
  }
  const userId = payload.user_id;
  if (!userId) return { ok: false, error: 'missing_user_id' };

  const user = findUserByUserId_(userId);
  if (!user) return { ok: false, error: 'user_not_found' };
  if (user.status === 'active') return { ok: true, message: 'already active' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName('Users');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  const approver = findUserByLineId_(payload.lineUserId);
  sh.getRange(user._rowNumber, hdr.indexOf('status') + 1).setValue('active');
  sh.getRange(user._rowNumber, hdr.indexOf('approved_at') + 1).setValue(nowBangkok());
  sh.getRange(user._rowNumber, hdr.indexOf('approved_by') + 1).setValue(approver ? approver.user_id : '');

  // create LeaveQuota row ตาม default
  ensureQuotaRow_(userId);

  logInfo('approveRegister', 'approved', { userId: userId, by: payload.lineUserId });
  audit(payload.lineUserId, 'register_approve', 'Users', userId);

  // push flex confirm หาผู้สมัคร
  try {
    if (user.line_user_id) {
      pushMessage(user.line_user_id, buildRegisterApprovedCard(findUserByUserId_(userId)));
    }
  } catch (e) {
    logWarn('approveRegister', 'push approved card failed: ' + e.message);
  }

  return { ok: true, message: 'อนุมัติเรียบร้อย' };
}

/**
 * payload = { lineUserId, user_id, note }
 */
function rejectRegister(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const userId = payload.user_id;
  if (!userId) return { ok: false, error: 'missing_user_id' };

  const user = findUserByUserId_(userId);
  if (!user) return { ok: false, error: 'user_not_found' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // ใช้ inactive แทนการลบ — เก็บ audit trail
  sh.getRange(user._rowNumber, hdr.indexOf('status') + 1).setValue('inactive');

  audit(payload.lineUserId, 'register_reject', 'Users', userId, { note: payload.note || '' });

  try {
    if (user.line_user_id) {
      pushMessage(user.line_user_id, buildRegisterRejectedCard(user, payload.note));
    }
  } catch (e) {
    logWarn('rejectRegister', 'push rejected card failed: ' + e.message);
  }

  return { ok: true, message: 'ปฏิเสธเรียบร้อย' };
}

/**
 * payload = { lineUserId }
 * return { status: 'visitor'|'pending'|'active', user? }
 */
function getMyStatus(payload) {
  payload = payload || {};
  if (!payload.lineUserId) return { ok: false, error: 'missing_line_user_id' };
  const user = findUserByLineId_(payload.lineUserId);
  if (!user) return { ok: true, status: 'visitor' };
  if (user.status === 'pending') return { ok: true, status: 'pending', user: publicUser_(user) };
  if (user.status === 'active') return { ok: true, status: 'active', user: publicUser_(user) };
  return { ok: true, status: user.status, user: publicUser_(user) };
}

/** trim sensitive fields ก่อน return หา client */
function publicUser_(user) {
  return {
    user_id: user.user_id,
    role: user.role,
    role_label: getRoleLabelTh(user.role, { isSupervisor: user.is_supervisor === true || user.is_supervisor === 'TRUE' }),
    display_name: user.display_name,
    emp_code: user.emp_code,
    department: user.department,
    position: user.position,
    is_supervisor: user.is_supervisor === true || user.is_supervisor === 'TRUE',
    status: user.status,
  };
}

/** create LeaveQuota row ตาม default (idempotent) — ใช้ทั้งใน approveRegister + bootstrapFirstOwner */
function ensureQuotaRow_(userId) {
  const year = new Date().getFullYear();
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveQuota');
  const quotaId = 'Q-' + year + '-' + userId;

  if (sh.getLastRow() >= 2) {
    const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === quotaId) return;
    }
  }

  const cfg = getConfig();
  sh.appendRow([
    quotaId, userId, year,
    Number(cfg.default_sick_total || 30), 0, 0,
    Number(cfg.default_personal_total || 6), 0, 0,
    Number(cfg.default_vacation_total || 10), 0, 0,
    nowBangkok(),
  ]);
}
