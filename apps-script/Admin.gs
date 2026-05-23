/**
 * Admin.gs — endpoint สำหรับ admin.html
 *
 * Actions:
 *   - getAdminDashboard(payload)         ADMIN/OWNER สรุประบบ
 *   - getAllUsers(payload)               ADMIN/OWNER list users (filter active/inactive/pending)
 *   - getAllLeaves(payload)              ADMIN/OWNER list leaves (filters)
 *   - setUserStatus(payload)             ADMIN: active/inactive (offboard)
 *   - inviteUser(payload)                ADMIN/OWNER: create pairing code + send invite
 *   - inviteOwner(payload)               OWNER only: I-016 add OWNER ใหม่ทันที
 *   - listPendingChanges(payload)        OWNER: ดู Pending_Changes ทั้งหมด
 *   - approvePendingChange(payload)      OWNER: approve → apply
 *   - rejectPendingChange(payload)       OWNER: reject
 *   - updateSettings(payload)            ADMIN propose / OWNER apply Sheet Settings keys
 */

function getAdminDashboard(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(sheetId);

  // pending registers
  const usersSh = ss.getSheetByName('Users');
  let pendingRegisters = 0;
  let activeUsers = 0;
  if (usersSh.getLastRow() >= 2) {
    const data = usersSh.getRange(2, 1, usersSh.getLastRow() - 1, usersSh.getLastColumn()).getValues();
    const hdr = usersSh.getRange(1, 1, 1, usersSh.getLastColumn()).getValues()[0];
    const iStatus = hdr.indexOf('status');
    data.forEach(function (row) {
      if (row[iStatus] === 'pending') pendingRegisters++;
      else if (row[iStatus] === 'active') activeUsers++;
    });
  }

  // pending leaves
  const leavesSh = ss.getSheetByName('LeaveRequests');
  let pendingLeaves = 0, approvedLeaves = 0, rejectedLeaves = 0;
  if (leavesSh.getLastRow() >= 2) {
    const data = leavesSh.getRange(2, 1, leavesSh.getLastRow() - 1, leavesSh.getLastColumn()).getValues();
    const hdr = leavesSh.getRange(1, 1, 1, leavesSh.getLastColumn()).getValues()[0];
    const iFinal = hdr.indexOf('final_status');
    data.forEach(function (row) {
      if (row[iFinal] === 'pending') pendingLeaves++;
      else if (row[iFinal] === 'approved') approvedLeaves++;
      else if (row[iFinal] === 'rejected') rejectedLeaves++;
    });
  }

  // pending changes
  const changesSh = ss.getSheetByName('Pending_Changes');
  let pendingChanges = 0;
  if (changesSh.getLastRow() >= 2) {
    const data = changesSh.getRange(2, 1, changesSh.getLastRow() - 1, changesSh.getLastColumn()).getValues();
    const hdr = changesSh.getRange(1, 1, 1, changesSh.getLastColumn()).getValues()[0];
    const iStatus = hdr.indexOf('status');
    data.forEach(function (row) { if (row[iStatus] === 'pending') pendingChanges++; });
  }

  return {
    ok: true,
    summary: {
      active_users: activeUsers,
      pending_registers: pendingRegisters,
      pending_leaves: pendingLeaves,
      approved_leaves_this_month: approvedLeaves,
      rejected_leaves_this_month: rejectedLeaves,
      pending_changes: pendingChanges,
    },
  };
}

function getAllUsers(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  if (sh.getLastRow() < 2) return { ok: true, users: [] };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const status = payload.status;  // optional filter

  const users = data
    .map(function (row) {
      const obj = {};
      hdr.forEach(function (h, j) { obj[h] = row[j]; });
      return obj;
    })
    .filter(function (u) {
      if (!status) return true;
      return u.status === status;
    })
    .map(function (u) {
      return {
        user_id: u.user_id,
        line_user_id: u.line_user_id,
        role: u.role,
        role_label: getRoleLabelTh(u.role, { isSupervisor: u.is_supervisor === true || u.is_supervisor === 'TRUE' }),
        display_name: u.display_name,
        emp_code: u.emp_code,
        department: u.department,
        position: u.position,
        is_supervisor: u.is_supervisor === true || u.is_supervisor === 'TRUE',
        status: u.status,
        created_at: u.created_at,
      };
    });

  return { ok: true, users: users };
}

function getAllLeaves(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (sh.getLastRow() < 2) return { ok: true, leaves: [] };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  let leaves = data.map(function (row) {
    const obj = {};
    hdr.forEach(function (h, j) { obj[h] = row[j]; });
    return obj;
  });

  // filters
  if (payload.user_id) {
    leaves = leaves.filter(function (l) { return l.user_id === payload.user_id; });
  }
  if (payload.leave_type) {
    leaves = leaves.filter(function (l) { return l.leave_type === payload.leave_type; });
  }
  if (payload.final_status) {
    leaves = leaves.filter(function (l) { return l.final_status === payload.final_status; });
  }
  if (payload.date_from) {
    leaves = leaves.filter(function (l) {
      const d = typeof l.date_from === 'object'
        ? Utilities.formatDate(l.date_from, 'Asia/Bangkok', 'yyyy-MM-dd')
        : l.date_from;
      return d >= payload.date_from;
    });
  }
  if (payload.date_to) {
    leaves = leaves.filter(function (l) {
      const d = typeof l.date_to === 'object'
        ? Utilities.formatDate(l.date_to, 'Asia/Bangkok', 'yyyy-MM-dd')
        : l.date_to;
      return d <= payload.date_to;
    });
  }

  leaves = leaves.map(function (l) { return shapeLeavePublic_(l, true); });
  leaves.sort(function (a, b) { return String(b.submitted_at).localeCompare(String(a.submitted_at)); });

  return { ok: true, leaves: leaves.slice(0, Number(payload.limit || 100)), total: leaves.length };
}

function setUserStatus(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id || !payload.status) return { ok: false, error: 'missing_fields' };
  if (['active', 'inactive', 'pending'].indexOf(payload.status) < 0) {
    return { ok: false, error: 'invalid_status' };
  }

  const user = findUserByUserId_(payload.user_id);
  if (!user) return { ok: false, error: 'user_not_found' };

  // ห้าม ADMIN inactivate OWNER
  const actor = findUserByLineId_(payload.lineUserId);
  if (user.role === ROLES.OWNER && actor.role !== ROLES.OWNER) {
    return { ok: false, error: 'forbidden_owner_only' };
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(user._rowNumber, hdr.indexOf('status') + 1).setValue(payload.status);

  // ถ้า inactivate และเป็น supervisor → invalidate Supervisors pair
  if (payload.status === 'inactive' && (user.is_supervisor === true || user.is_supervisor === 'TRUE')) {
    invalidateSupervisorPairsOf_(payload.user_id);
  }

  audit(payload.lineUserId, 'set_user_status', 'Users', payload.user_id, { status: payload.status });
  return { ok: true };
}

function invalidateSupervisorPairsOf_(supervisorUserId) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Supervisors');
  if (sh.getLastRow() < 2) return;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iSup = hdr.indexOf('supervisor_user_id');
  const iValidTo = hdr.indexOf('valid_to');
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const now = nowBangkok();
  for (let i = 0; i < data.length; i++) {
    if (data[i][iSup] === supervisorUserId && !data[i][iValidTo]) {
      sh.getRange(i + 2, iValidTo + 1).setValue(now);
    }
  }
}

/**
 * payload = { lineUserId, display_name, emp_code, phone?, email?, department?, position?, is_supervisor?, role? }
 * - role default = USER
 * - สร้าง Users row status=invited + pairing code + ส่ง invite message
 */
function inviteUser(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.display_name || !payload.emp_code) return { ok: false, error: 'missing_fields' };

  const role = payload.role || ROLES.USER;
  if ([ROLES.USER, ROLES.ADMIN].indexOf(role) < 0) {
    return { ok: false, error: 'invalid_role' };
  }
  // ห้าม ADMIN เชิญ OWNER (ใช้ inviteOwner สำหรับ OWNER)
  // ห้าม ADMIN เชิญ ADMIN → ผ่าน Pending_Changes แทน (out of scope phase 1 — for now allow)

  const actor = findUserByLineId_(payload.lineUserId);
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const userId = nextUserId();
  const now = nowBangkok();

  sh.appendRow([
    userId,
    '',  // line_user_id — จะใส่ตอน redeem
    role,
    payload.display_name,
    payload.emp_code,
    payload.phone || '',
    payload.email || '',
    payload.department || '',
    payload.position || '',
    !!payload.is_supervisor,
    'invited',
    actor.user_id,
    now, '', '',
  ]);

  // create pairing code
  const codeRes = createPairingCode(userId, actor.user_id);
  audit(payload.lineUserId, 'invite_user', 'Users', userId, { role: role, emp_code: payload.emp_code });

  return {
    ok: true,
    user_id: userId,
    pairing_code: codeRes.code,
    expires_at: codeRes.expiresAt,
    invite_text: buildInviteText_(payload.display_name, codeRes.code, codeRes.expiresAt),
  };
}

/** I-016 — OWNER invite OWNER ใหม่ทันที (ไม่ผ่าน approval) */
function inviteOwner(payload) {
  payload = payload || {};
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.display_name) return { ok: false, error: 'missing_fields' };

  const actor = findUserByLineId_(payload.lineUserId);
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const userId = nextUserId();
  const now = nowBangkok();

  sh.appendRow([
    userId, '', ROLES.OWNER,
    payload.display_name,
    payload.emp_code || ('OWNER-' + userId.replace('EMP-', '')),
    payload.phone || '', payload.email || '',
    payload.department || '', payload.position || '',
    true, // owners default is_supervisor=true
    'invited',
    actor.user_id,
    now, '', '',
  ]);

  const codeRes = createPairingCode(userId, actor.user_id);
  audit(payload.lineUserId, 'invite_owner', 'Users', userId, { display_name: payload.display_name });

  return {
    ok: true,
    user_id: userId,
    pairing_code: codeRes.code,
    expires_at: codeRes.expiresAt,
    invite_text: buildInviteText_(payload.display_name, codeRes.code, codeRes.expiresAt),
  };
}

/** I-018 — ข้อความเชิญพร้อมส่ง (admin.html มีปุ่ม "คัดลอกข้อความ" + "ส่ง LINE") */
function buildInviteText_(name, code, expiresAt) {
  return [
    'คุณ' + name + ' ได้รับเชิญเข้าใช้งานระบบลางาน MENA',
    '',
    'ขั้นตอน:',
    '1. เพิ่ม @966nnfkr เป็นเพื่อน (LINE OA)',
    '2. กดเมนู "ส่งใบลา" → กดไปหน้าลงทะเบียน',
    '3. ใช้รหัสนี้ลงทะเบียน: ' + code,
    '',
    'รหัสหมดอายุ: ' + formatThaiDateTime(expiresAt),
  ].join('\n');
}

// ========== Pending_Changes (OWNER review) ==========

function listPendingChanges(payload) {
  payload = payload || {};
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pending_Changes');
  if (sh.getLastRow() < 2) return { ok: true, changes: [] };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const iStatus = hdr.indexOf('status');

  const changes = data
    .map(function (row) {
      const obj = {};
      hdr.forEach(function (h, j) { obj[h] = row[j]; });
      return obj;
    })
    .filter(function (c) { return c.status === 'pending'; });

  return { ok: true, changes: changes };
}

function approvePendingChange(payload) {
  payload = payload || {};
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.change_id) return { ok: false, error: 'missing_change_id' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pending_Changes');
  if (sh.getLastRow() < 2) return { ok: false, error: 'not_found' };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  let row = null, rowNum = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i][hdr.indexOf('change_id')] === payload.change_id) {
      row = {};
      hdr.forEach(function (h, j) { row[h] = data[i][j]; });
      rowNum = i + 2;
      break;
    }
  }
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') return { ok: false, error: 'not_pending' };

  const actor = findUserByLineId_(payload.lineUserId);
  const data2 = JSON.parse(row.payload_json || '{}');

  // dispatch by target_entity
  let applyRes;
  if (row.target_entity === 'LeaveQuota') {
    applyRes = applySetQuota_(data2, actor);
  } else if (row.target_entity === 'LeaveRules') {
    applyRes = applyUpsertRule_(data2, actor);
  } else if (row.target_entity === 'Settings') {
    applyRes = applyUpdateSettings_(data2, actor);
  } else {
    return { ok: false, error: 'unsupported_entity' };
  }

  sh.getRange(rowNum, hdr.indexOf('status') + 1).setValue('approved');
  sh.getRange(rowNum, hdr.indexOf('decided_by') + 1).setValue(actor.user_id);
  sh.getRange(rowNum, hdr.indexOf('decided_at') + 1).setValue(nowBangkok());

  audit(payload.lineUserId, 'approve_pending_change', 'Pending_Changes', payload.change_id);
  return { ok: true, applied: applyRes };
}

function rejectPendingChange(payload) {
  payload = payload || {};
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.change_id) return { ok: false, error: 'missing_change_id' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pending_Changes');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === payload.change_id) {
      sh.getRange(i + 2, hdr.indexOf('status') + 1).setValue('rejected');
      const actor = findUserByLineId_(payload.lineUserId);
      sh.getRange(i + 2, hdr.indexOf('decided_by') + 1).setValue(actor ? actor.user_id : '');
      sh.getRange(i + 2, hdr.indexOf('decided_at') + 1).setValue(nowBangkok());
      sh.getRange(i + 2, hdr.indexOf('decision_note') + 1).setValue(payload.note || '');
      audit(payload.lineUserId, 'reject_pending_change', 'Pending_Changes', payload.change_id, { note: payload.note });
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

// ========== Settings update ==========

/** payload = { lineUserId, updates: { key: value, ... } } */
function updateSettings(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.updates || typeof payload.updates !== 'object') return { ok: false, error: 'missing_updates' };

  const actor = findUserByLineId_(payload.lineUserId);

  if (actor.role === ROLES.ADMIN) {
    // ADMIN → propose
    const changeId = nextChangeId();
    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pending_Changes');
    sh.appendRow([
      changeId, actor.user_id, 'Settings', '(multi)', 'update',
      JSON.stringify(payload.updates),
      nowBangkok(), 'pending', '', '', '',
    ]);
    audit(payload.lineUserId, 'propose_settings', 'Pending_Changes', changeId, payload.updates);
    return { ok: true, mode: 'proposed', changeId: changeId };
  }

  return applyUpdateSettings_(payload.updates, actor);
}

function applyUpdateSettings_(updates, actor) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Settings');
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();

  Object.keys(updates).forEach(function (key) {
    const value = updates[key];
    let foundRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === key) { foundRow = i + 2; break; }
    }
    if (foundRow > 0) {
      sh.getRange(foundRow, 2).setValue(value);
    } else {
      sh.appendRow([key, value, '(user-added)']);
    }
  });

  clearConfigCache();
  audit(actor && actor.line_user_id, 'update_settings', 'Settings', '(multi)', updates);
  return { ok: true, mode: 'applied' };
}
