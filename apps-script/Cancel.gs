/**
 * Cancel.gs — ถอนใบลา / ขอยกเลิกวันลาที่อนุมัติไปแล้ว
 *
 * สองเส้นทาง เพราะสองสถานการณ์นี้ไม่เหมือนกัน:
 *
 *   1) ใบยังไม่มีใครกด (final_status = pending) → `withdrawLeave`
 *      ผู้ลาถอนเองได้ทันที ไม่ต้องขอใคร เพราะยังไม่มีใครอนุมัติอะไร
 *      โควตาที่จองไว้ (reserved) คืนกลับทันที
 *
 *   2) ใบอนุมัติครบแล้ว (final_status = approved) → `requestCancelLeave`
 *      ต้องขออนุมัติ "ตามขั้นตอนเดิม" (หัวหน้างาน → HR → ผู้บริหาร)
 *      ทำเป็น "ใบขอยกเลิก" ที่เป็นเรคคอร์ดของตัวเอง (record_type = 'cancel')
 *      ชี้กลับใบเดิมด้วย parent_leave_id แล้ววิ่งผ่านเครื่องอนุมัติตัวเดิมทั้งชุด
 *      — ได้การเตือนซ้ำ / cc HR / กันกดชนกัน ฟรีทั้งหมด ไม่ต้องเขียนใหม่
 *      อนุมัติครบ → ใบเดิมกลายเป็น cancelled + คืนโควตาที่หักไปแล้ว (used)
 */

/**
 * payload = { lineUserId, leave_id, reason? }
 * ถอนใบลาที่ยังไม่มีใครตัดสิน
 */
function withdrawLeave(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };
  if (!payload.leave_id) return { ok: false, error: 'missing_leave_id' };

  const actor = findUserByLineId_(payload.lineUserId);
  if (!actor || actor.status !== 'active') return { ok: false, error: 'not_active' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { ok: false, error: 'lock_failed', message: 'ระบบกำลังประมวลผล กรุณาลองอีกครั้ง' }; }

  try {
    const leave = findLeaveById_(payload.leave_id);
    if (!leave) return { ok: false, error: 'leave_not_found' };

    // ผู้ลาเอง หรือ HR/ผู้บริหาร (เผื่อกรอกผิดแล้วเจ้าตัวติดต่อไม่ได้)
    const isOwnLeave = leave.user_id === actor.user_id;
    if (!isOwnLeave && !hasRole(actor.role, ROLES.ADMIN)) {
      return { ok: false, error: 'forbidden', message: 'ถอนได้เฉพาะใบลาของตัวเอง' };
    }
    if ((leave.record_type || 'leave') !== 'leave') {
      return { ok: false, error: 'not_a_leave', message: 'ใบนี้เป็นใบขอยกเลิก ไม่ใช่ใบลา' };
    }
    if (leave.final_status !== 'pending') {
      return { ok: false, error: 'not_pending',
        message: 'ใบลานี้ตัดสินไปแล้ว ถอนเองไม่ได้ — ถ้าอนุมัติแล้วให้กด "ขอยกเลิกวันลา"' };
    }

    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
    const now = nowBangkok();
    const note = String(payload.reason || '').trim() || 'ผู้ลาถอนใบลาเอง';

    const patch = { final_status: 'withdrawn' };
    // ชั้นที่ยังค้างอยู่ ปิดให้หมด ไม่งั้นยังโผล่ในหน้ารออนุมัติ
    [1, 2, 3].forEach(function (s) {
      if (leave['stage' + s + '_status'] === 'pending') {
        patch['stage' + s + '_status'] = 'withdrawn';
        patch['stage' + s + '_at'] = now;
        patch['stage' + s + '_note'] = note;
      }
    });
    updateRowByHeader_(sh, leave._rowNumber, patch);

    // คืนโควตาที่จองไว้ — เข้าปีของวันลา ไม่ใช่ปีที่กดถอน
    if (isQuotaLeaveType_(leave.leave_type)) {
      rollbackQuota(leave.user_id, leave.leave_type, Number(leave.days), quotaYearOf_(leave));
    }

    logInfo('withdrawLeave', 'withdrawn', { leaveId: payload.leave_id, by: actor.user_id });
    audit(payload.lineUserId, 'leave_withdraw', 'LeaveRequests', payload.leave_id, { note: note });

    // แจ้งคนที่กำลังถือใบนี้อยู่ ไม่งั้นเขาจะกดแล้วเจอ error เฉย ๆ
    try {
      const requester = findUserByUserId_(leave.user_id) || {};
      const card = buildLeaveWithdrawnCard(leave, requester, actor.display_name, note);
      if (requester.line_user_id && requester.line_user_id !== payload.lineUserId) {
        pushMessage(requester.line_user_id, card);
      }
      pushMessage(payload.lineUserId, card);
      notifyPendingApprovers_(leave, card);
    } catch (e) {
      logWarn('withdrawLeave', 'push failed: ' + e.message);
    }

    return { ok: true, final_status: 'withdrawn' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * payload = { lineUserId, leave_id, reason }
 * ขอยกเลิกวันลาที่อนุมัติไปแล้ว — สร้างใบขอยกเลิกวิ่งสายอนุมัติเดิม
 */
function requestCancelLeave(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };
  if (!payload.leave_id) return { ok: false, error: 'missing_leave_id' };

  const reason = String(payload.reason || '').trim();
  if (reason.length < 5) {
    return { ok: false, error: 'reason_too_short', message: 'กรุณาระบุเหตุผลที่ขอยกเลิก อย่างน้อย 5 ตัวอักษร' };
  }

  const actor = findUserByLineId_(payload.lineUserId);
  if (!actor || actor.status !== 'active') return { ok: false, error: 'not_active' };

  const parent = findLeaveById_(payload.leave_id);
  if (!parent) return { ok: false, error: 'leave_not_found' };

  const isOwnLeave = parent.user_id === actor.user_id;
  if (!isOwnLeave && !hasRole(actor.role, ROLES.ADMIN)) {
    return { ok: false, error: 'forbidden', message: 'ขอยกเลิกได้เฉพาะใบลาของตัวเอง' };
  }
  if ((parent.record_type || 'leave') !== 'leave') {
    return { ok: false, error: 'not_a_leave', message: 'ใบนี้เป็นใบขอยกเลิกอยู่แล้ว' };
  }
  if (parent.final_status !== 'approved') {
    return { ok: false, error: 'not_approved',
      message: parent.final_status === 'pending'
        ? 'ใบลานี้ยังไม่มีใครอนุมัติ — กด "ถอนใบลา" ได้เลย ไม่ต้องขออนุมัติ'
        : 'ใบลานี้ไม่ได้อยู่ในสถานะอนุมัติแล้ว' };
  }

  // มีใบขอยกเลิกค้างอยู่แล้วหรือยัง — กดซ้ำไม่ควรได้ใบซ้อน
  const existing = findCancelRequestsFor_(parent.leave_id).filter(function (c) {
    return c.final_status === 'pending';
  });
  if (existing.length) {
    return { ok: false, error: 'cancel_already_pending',
      message: 'ใบขอยกเลิกของใบลานี้ส่งไปแล้ว กำลังรออนุมัติอยู่ (' + existing[0].leave_id + ')' };
  }

  const requester = findUserByUserId_(parent.user_id);
  if (!requester) return { ok: false, error: 'requester_not_found' }
  // ใบขอยกเลิกของผู้บริหารผ่านอัตโนมัติ — HR ยื่นแทนแล้วคืนโควตาได้ทันทีโดยไม่มีใครอนุมัติ
  if (requester.role === ROLES.OWNER && !isOwnLeave) {
    return { ok: false, error: 'forbidden', message: 'ขอยกเลิกวันลาของผู้บริหารได้เฉพาะผู้บริหารคนนั้นเอง' };
  };

  ensureSheetColumns_('LeaveRequests');
  const flow = computeInitialStages_(requester);
  const cancelId = nextLeaveId();
  const now = nowBangkok();
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');

  // ยกเลิกวันที่ผ่านไปแล้ว = คืนโควตาทั้งที่หยุดจริงไปแล้ว — ให้ผู้อนุมัติเห็นแล้วตัดสินเอง
  const startsInPast = new Date(shapeDateOnly_(parent.date_from) + 'T00:00:00+07:00') <=
                       new Date(todayBangkok() + 'T00:00:00+07:00');

  appendRowByHeader_(sh, {
    leave_id: cancelId,
    user_id: parent.user_id,
    leave_type: parent.leave_type,
    date_from: shapeDateOnly_(parent.date_from),
    date_to: shapeDateOnly_(parent.date_to),
    days: Number(parent.days),
    is_retroactive: startsInPast,
    reason: reason + (actor.user_id !== parent.user_id ? ' (ยื่นแทนโดย ' + (actor.display_name || actor.user_id) + ')' : ''),
    attachment_url: '',
    stage1_required: flow.stage1Required,
    stage1_status: flow.stage1Status,
    stage1_at: flow.stage1Status === 'skipped' ? now : '',
    stage2_status: flow.stage2Status,
    stage2_at: flow.stage2Status === 'skipped' ? now : '',
    stage3_status: flow.stage3Status,
    stage3_at: flow.firstApprovalStage === 0 ? now : '',
    stage3_note: flow.firstApprovalStage === 0 ? 'auto-approved (ผู้บริหารทำรายการเอง)' : '',
    final_status: flow.finalStatus,
    submitted_at: now,
    gps_missing_reason: '',
    is_emergency: false,
    emergency_reason: '',
    record_type: 'cancel',
    parent_leave_id: parent.leave_id,
    last_reminded_at: '',
    reminder_count: 0,
    // ยกเลิกลาเป็นชั่วโมง — ผู้อนุมัติต้องเห็นช่วงเวลาเดิม ไม่ใช่ "0.25 วัน"
    leave_unit: parent.leave_unit || 'day',
    time_from: parent.time_from ? "'" + timeText_(parent.time_from) : '',
    time_to: parent.time_to ? "'" + timeText_(parent.time_to) : '',
    hours: parent.hours || '',
  });

  logInfo('requestCancelLeave', 'submitted', { cancelId: cancelId, parent: parent.leave_id });
  audit(payload.lineUserId, 'leave_cancel_request', 'LeaveRequests', cancelId, {
    parent_leave_id: parent.leave_id, reason: reason,
  });

  const cancelRow = findLeaveById_(cancelId);

  // อนุมัติครบตั้งแต่ต้น (ผู้บริหารทำรายการเอง) → ปิดใบเดิมเลย
  if (flow.firstApprovalStage === 0) {
    applyCancelToParent_(cancelRow);
    try {
      pushMessage(payload.lineUserId, buildCancelResultCard(cancelRow, parent, requester, true));
    } catch (e) {}
    return { ok: true, cancel_id: cancelId, final_status: 'approved' };
  }

  try {
    pushMessage(payload.lineUserId,
      buildCancelSubmittedCard(cancelRow, parent, stageWaitingLabel_(flow.firstApprovalStage)));
    if (requester.line_user_id && requester.line_user_id !== payload.lineUserId) {
      pushMessage(requester.line_user_id,
        buildCancelSubmittedCard(cancelRow, parent, stageWaitingLabel_(flow.firstApprovalStage)));
    }
  } catch (e) {
    logWarn('requestCancelLeave', 'push submitted card failed: ' + e.message);
  }

  sendApprovalRequestStage_(cancelRow, requester, flow.firstApprovalStage);

  // cc HR เหมือนใบลาปกติ — HR ต้องรู้ว่ามีคนขอยกเลิกวันลาที่อนุมัติไปแล้ว
  if (flow.firstApprovalStage === 1) {
    try {
      const sup = resolveStage1Approver_(requester.user_id);
      pushToAllAdmins(buildHrNoticeCard(cancelRow, requester, sup, 'รอหัวหน้างานตรวจ (ใบขอยกเลิก)'));
    } catch (e) {
      logWarn('requestCancelLeave', 'cc HR failed: ' + e.message);
    }
  }

  return { ok: true, cancel_id: cancelId, final_status: 'pending', starts_in_past: startsInPast };
}

/**
 * ใบขอยกเลิกผ่านครบทุกชั้นแล้ว → ปิดใบลาต้นทาง + คืนโควตาที่หักไปจริง
 * เรียกจาก Approval.gs ตอน final approved ของเรคคอร์ด record_type = 'cancel'
 */
function applyCancelToParent_(cancelRow) {
  const parent = findLeaveById_(cancelRow.parent_leave_id);
  if (!parent) {
    logError('applyCancelToParent_', 'ไม่พบใบลาต้นทาง', { cancelId: cancelRow.leave_id, parent: cancelRow.parent_leave_id });
    return { ok: false, error: 'parent_not_found' };
  }
  if (parent.final_status === 'cancelled') {
    return { ok: true, already: true };
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  updateRowByHeader_(sh, parent._rowNumber, {
    final_status: 'cancelled',
  });

  // ใบเดิมอนุมัติแล้ว = โควตาถูกหักเข้า used ไปแล้ว → คืนกลับเข้าปีของใบลานั้น
  if (isQuotaLeaveType_(parent.leave_type)) {
    uncommitQuota(parent.user_id, parent.leave_type, Number(parent.days), quotaYearOf_(parent));
  }

  logInfo('applyCancelToParent_', 'ใบลาถูกยกเลิก', {
    parent: parent.leave_id, cancelId: cancelRow.leave_id, days: parent.days,
  });

  try {
    const requester = findUserByUserId_(parent.user_id) || {};
    const card = buildCancelResultCard(cancelRow, parent, requester, true);
    if (requester.line_user_id) pushMessage(requester.line_user_id, card);
    pushToAllAdmins(card);
  } catch (e) {
    logWarn('applyCancelToParent_', 'push failed: ' + e.message);
  }

  return { ok: true };
}

/** ใบขอยกเลิกของใบลาใบนี้ (ทุกสถานะ) */
function findCancelRequestsFor_(parentLeaveId) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (sh.getLastRow() < 2) return [];
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iType = hdr.indexOf('record_type');
  const iParent = hdr.indexOf('parent_leave_id');
  if (iType < 0 || iParent < 0) return [];

  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .filter(function (r) { return r[iType] === 'cancel' && r[iParent] === parentLeaveId; })
    .map(function (r) {
      const obj = {};
      hdr.forEach(function (h, j) { obj[h] = r[j]; });
      return obj;
    });
}

/** แจ้งคนที่กำลังถือใบนี้อยู่ (ชั้นที่ยัง pending) */
function notifyPendingApprovers_(leave, messages) {
  if (leave.stage1_status === 'pending') {
    const sup = resolveStage1Approver_(leave.user_id);
    if (sup && sup.line_user_id) pushMessage(sup.line_user_id, messages);
  } else if (leave.stage2_status === 'pending') {
    pushToAllAdmins(messages);
  } else if (leave.stage3_status === 'pending') {
    const res = pushToExecutivesOf_(leave.user_id, messages);
    // ผู้บริหารในสายยังรับใบไม่ได้ → ใบอยู่ในมือ HR
    if (res && res.hrFallback) pushToAllAdmins(messages);
  }
}

/** วันที่จาก Sheet อาจกลับมาเป็น Date object — บังคับเป็น yyyy-MM-dd เสมอ */
function shapeDateOnly_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}
