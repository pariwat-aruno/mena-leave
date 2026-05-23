/**
 * LeaveRequest.gs — submit ใบลา + ดูประวัติ
 *
 * Actions:
 *   - submitLeave(payload)        ส่งใบลา (USER)
 *   - getMyHistory(payload)       ประวัติของผู้ลา (USER)
 *   - getOneRequest(payload)      detail leave 1 ใบ
 */

/**
 * payload = {
 *   lineUserId, leave_type, date_from, date_to, reason,
 *   gps_lat, gps_lng, gps_accuracy,
 *   attachment_base64?, attachment_filename?
 * }
 *
 * Process:
 *   1. validate user (active)
 *   2. validate fields
 *   3. validate GPS (required by Settings)
 *   4. compute days (skip weekends per Settings)
 *   5. validate quota (available >= days)
 *   6. validate against rules (advance_notice, max_consec, doc_required)
 *   7. validate is_retroactive (date_from < today) → only sick allowed
 *   8. upload attachment → Drive (if any)
 *   9. insert LeaveRequests row
 *   10. reserve quota
 *   11. determine stage flow (based on requester role + is_supervisor)
 *   12. push flex to first approver / auto-approve if OWNER
 */
function submitLeave(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };

  const requester = findUserByLineId_(payload.lineUserId);
  if (!requester) return { ok: false, error: 'user_not_found' };

  // === validate fields ===
  if (LEAVE_TYPES.indexOf(payload.leave_type) < 0) {
    return { ok: false, error: 'invalid_leave_type' };
  }
  if (!payload.date_from || !payload.date_to) {
    return { ok: false, error: 'missing_dates' };
  }
  if (!payload.reason || String(payload.reason).trim().length < 3) {
    return { ok: false, error: 'reason_too_short', message: 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร' };
  }

  const cfg = getConfig();

  // === validate GPS ===
  if (cfg.gps_required) {
    if (!isFinite(Number(payload.gps_lat)) || !isFinite(Number(payload.gps_lng))) {
      return { ok: false, error: 'gps_required', message: 'กรุณาเปิด GPS เพื่อยืนยันสถานที่ตอนส่งใบลา' };
    }
  }

  // === compute days ===
  const countWeekends = cfg.count_weekends_as_leave === true || cfg.count_weekends_as_leave === 'TRUE';
  const days = countLeaveDays(payload.date_from, payload.date_to, countWeekends);
  if (days <= 0) {
    return { ok: false, error: 'invalid_date_range', message: 'ช่วงวันที่ไม่ถูกต้อง' };
  }

  // === is_retroactive ===
  const isRetro = new Date(payload.date_from + 'T00:00:00+07:00') < new Date(todayBangkok() + 'T00:00:00+07:00');
  if (isRetro && payload.leave_type !== 'sick') {
    return { ok: false, error: 'retroactive_only_sick',
      message: 'ลาย้อนหลังทำได้เฉพาะลาป่วยฉุกเฉินเท่านั้น' };
  }

  // === validate quota ===
  const year = new Date(payload.date_from + 'T00:00:00+07:00').getFullYear();
  let quota = getQuotaRow_(requester.user_id, year);
  if (!quota) {
    ensureQuotaRow_(requester.user_id);
    quota = getQuotaRow_(requester.user_id, year);
  }
  const quotaShaped = shapeQuota_(quota);
  const available = quotaShaped[payload.leave_type].available;
  if (days > available) {
    return { ok: false, error: 'quota_exceeded',
      message: 'โควตา' + leaveTypeLabel_(payload.leave_type) + 'คงเหลือ ' + available + ' วัน ลาได้ไม่เกินนี้' };
  }

  // === validate against rules ===
  const hasAttachment = !!payload.attachment_base64;
  const ruleCheck = validateAgainstRules_(payload.leave_type, payload.date_from, payload.date_to, days, hasAttachment);
  if (!ruleCheck.ok) return ruleCheck;

  // === upload attachment ===
  let attachmentUrl = '';
  if (payload.attachment_base64) {
    try {
      const filename = (payload.attachment_filename || ('leave-' + Date.now() + '.jpg'))
        .replace(/[^a-zA-Z0-9.\-_]/g, '_');
      attachmentUrl = uploadImage(payload.attachment_base64, filename, 'leave-proofs');
    } catch (err) {
      logError('submitLeave', 'attachment upload failed: ' + err.message, { userId: requester.user_id });
      return { ok: false, error: 'attachment_upload_failed', message: 'อัพโหลดไฟล์แนบไม่สำเร็จ ลองอีกครั้ง' };
    }
  }

  // === determine stage flow ===
  const isSupervisor = requester.is_supervisor === true || requester.is_supervisor === 'TRUE';
  let stage1Required, stage1Status, stage2Status, stage3Status;
  let firstApprovalStage;

  if (requester.role === ROLES.OWNER) {
    // auto-approve
    stage1Required = false; stage1Status = 'skipped';
    stage2Status = 'skipped'; stage3Status = 'approved';
    firstApprovalStage = 0;  // auto
  } else if (requester.role === ROLES.ADMIN) {
    stage1Required = false; stage1Status = 'skipped';
    stage2Status = 'skipped'; stage3Status = 'pending';
    firstApprovalStage = 3;
  } else if (isSupervisor) {
    stage1Required = false; stage1Status = 'skipped';
    stage2Status = 'pending'; stage3Status = 'pending';
    firstApprovalStage = 2;
  } else {
    // ปกติ: USER
    const supervisorId = getSupervisorFor(requester.user_id);
    if (!supervisorId) {
      // ไม่มี supervisor → skip stage 1 ตรงไป stage 2
      stage1Required = false; stage1Status = 'skipped';
      stage2Status = 'pending'; stage3Status = 'pending';
      firstApprovalStage = 2;
    } else {
      stage1Required = true; stage1Status = 'pending';
      stage2Status = 'pending'; stage3Status = 'pending';
      firstApprovalStage = 1;
    }
  }

  // === insert row ===
  const leaveId = nextLeaveId();
  const now = nowBangkok();
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');

  let finalStatus = 'pending';
  if (requester.role === ROLES.OWNER) finalStatus = 'approved';

  sh.appendRow([
    leaveId,
    requester.user_id,
    payload.leave_type,
    payload.date_from,
    payload.date_to,
    days,
    isRetro,
    payload.reason,
    Number(payload.gps_lat || 0) || '',
    Number(payload.gps_lng || 0) || '',
    Number(payload.gps_accuracy || 0) || '',
    attachmentUrl,
    stage1Required,
    stage1Status, '', stage1Status === 'skipped' ? now : '', '',
    stage2Status, '', stage2Status === 'skipped' ? now : '', '',
    stage3Status, '', requester.role === ROLES.OWNER ? now : '', requester.role === ROLES.OWNER ? 'auto-approved (OWNER)' : '',
    finalStatus,
    now,
  ]);

  // === reserve quota ===
  if (finalStatus === 'approved') {
    // OWNER auto-approve → commit ทันที
    commitQuota(requester.user_id, payload.leave_type, days);
  } else {
    reserveQuota(requester.user_id, payload.leave_type, days);
  }

  logInfo('submitLeave', 'submitted', { leaveId: leaveId, userId: requester.user_id, days: days });
  audit(payload.lineUserId, 'leave_submit', 'LeaveRequests', leaveId, {
    leave_type: payload.leave_type, date_from: payload.date_from, date_to: payload.date_to, days: days,
  });

  // === push notifications + start approval flow ===
  const leave = findLeaveById_(leaveId);

  // confirm card → ผู้ลา
  try {
    const nextStageLabel = firstApprovalStage === 0 ? 'อนุมัติอัตโนมัติ (เจ้าของลาเอง)' :
                           firstApprovalStage === 1 ? 'หัวหน้างานตรวจ' :
                           firstApprovalStage === 2 ? 'HR ตรวจ' :
                                                       'เจ้าของตรวจ';
    pushMessage(payload.lineUserId, buildLeaveSubmittedCard(leave, nextStageLabel));
  } catch (e) {
    logWarn('submitLeave', 'push submitted card failed: ' + e.message);
  }

  // trigger first approval stage
  if (firstApprovalStage === 1) {
    sendApprovalRequestStage_(leave, requester, 1);
  } else if (firstApprovalStage === 2) {
    sendApprovalRequestStage_(leave, requester, 2);
  } else if (firstApprovalStage === 3) {
    sendApprovalRequestStage_(leave, requester, 3);
  } else if (firstApprovalStage === 0) {
    // OWNER auto-approved — push final approved
    try {
      pushMessage(payload.lineUserId, buildFinalApprovedCard(leave, requester));
    } catch (e) {}
  }

  return { ok: true, leave_id: leaveId, days: days, final_status: finalStatus };
}

/** payload = { lineUserId, limit?, offset? } */
function getMyHistory(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };

  const user = findUserByLineId_(payload.lineUserId);
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (sh.getLastRow() < 2) return { ok: true, requests: [] };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iUser = hdr.indexOf('user_id');
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  const requests = data
    .filter(function (row) { return row[iUser] === user.user_id; })
    .map(function (row) {
      const obj = {};
      hdr.forEach(function (h, j) { obj[h] = row[j]; });
      return shapeLeavePublic_(obj);
    })
    .sort(function (a, b) { return String(b.submitted_at).localeCompare(String(a.submitted_at)); });

  const limit = Number(payload.limit || 50);
  const offset = Number(payload.offset || 0);
  return { ok: true, requests: requests.slice(offset, offset + limit), total: requests.length };
}

function getOneRequest(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };
  const leaveId = payload.leave_id;
  if (!leaveId) return { ok: false, error: 'missing_leave_id' };

  const leave = findLeaveById_(leaveId);
  if (!leave) return { ok: false, error: 'not_found' };

  // permission: ผู้ลาเอง / supervisor / ADMIN / OWNER เท่านั้น
  const user = findUserByLineId_(payload.lineUserId);
  const isOwnerOrAdmin = hasRole(user.role, ROLES.ADMIN);
  const isOwnLeave = leave.user_id === user.user_id;
  const isSupOfRequester = getSupervisorFor(leave.user_id) === user.user_id;
  if (!isOwnerOrAdmin && !isOwnLeave && !isSupOfRequester) {
    return { ok: false, error: 'forbidden' };
  }

  return { ok: true, leave: shapeLeavePublic_(leave, true) };
}

/** helper */
function findLeaveById_(leaveId) {
  if (!leaveId) return null;
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (sh.getLastRow() < 2) return null;

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === leaveId) {
      const row = {};
      hdr.forEach(function (h, j) { row[h] = data[i][j]; });
      row._rowNumber = i + 2;
      return row;
    }
  }
  return null;
}

function shapeLeavePublic_(leave, includeSensitive) {
  return {
    leave_id: leave.leave_id,
    user_id: leave.user_id,
    leave_type: leave.leave_type,
    leave_type_label: leaveTypeLabel_(leave.leave_type),
    date_from: typeof leave.date_from === 'object' ? Utilities.formatDate(leave.date_from, 'Asia/Bangkok', 'yyyy-MM-dd') : leave.date_from,
    date_to: typeof leave.date_to === 'object' ? Utilities.formatDate(leave.date_to, 'Asia/Bangkok', 'yyyy-MM-dd') : leave.date_to,
    days: Number(leave.days),
    is_retroactive: leave.is_retroactive === true || leave.is_retroactive === 'TRUE',
    reason: leave.reason,
    gps_lat: includeSensitive ? leave.gps_lat : null,
    gps_lng: includeSensitive ? leave.gps_lng : null,
    attachment_url: leave.attachment_url,
    stage1_status: leave.stage1_status,
    stage1_by: leave.stage1_by,
    stage1_at: leave.stage1_at,
    stage1_note: leave.stage1_note,
    stage2_status: leave.stage2_status,
    stage2_by: leave.stage2_by,
    stage2_at: leave.stage2_at,
    stage2_note: leave.stage2_note,
    stage3_status: leave.stage3_status,
    stage3_by: leave.stage3_by,
    stage3_at: leave.stage3_at,
    stage3_note: leave.stage3_note,
    final_status: leave.final_status,
    submitted_at: leave.submitted_at,
  };
}
