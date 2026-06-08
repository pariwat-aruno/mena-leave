/**
 * Approval.gs — 3-stage approval flow (ใจกลางของระบบ)
 *
 * Actions:
 *   - approveLeave(payload)           รับ decision จาก LIFF approve.html
 *   - handleApprovalPostback_(ev)     รับ postback จาก flex button (ผ่าน WebApp.gs router)
 *   - getPendingForMe(payload)        return list ใบลาที่ user ต้องตัดสินใจ (auto stage-aware)
 *   - sendApprovalRequestStage_(...)  helper push flex หา approver of stage X
 *
 * 1st-wins: stage 2 + 3 มีหลาย approver (ADMIN/OWNER) — ใครกดก่อน ก็ปิด
 */

/**
 * payload = { lineUserId, leave_id, stage, decision: 'approve'|'reject', note? }
 *
 * Permission check per stage:
 *   stage 1: approver ต้องเป็น supervisor ของ leave.user_id (และต้อง active)
 *   stage 2: approver ต้องเป็น ADMIN active (1st wins)
 *   stage 3: approver ต้องเป็น OWNER active (1st wins)
 */
function approveLeave(payload) {
  payload = payload || {};
  if (!payload.lineUserId || !payload.leave_id || !payload.stage || !payload.decision) {
    return { ok: false, error: 'missing_fields' };
  }
  if (payload.decision !== 'approve' && payload.decision !== 'reject') {
    return { ok: false, error: 'invalid_decision' };
  }

  const stage = Number(payload.stage);
  if (stage < 1 || stage > 3) return { ok: false, error: 'invalid_stage' };

  const approver = findUserByLineId_(payload.lineUserId);
  if (!approver || approver.status !== 'active') return { ok: false, error: 'not_active' };

  const leave = findLeaveById_(payload.leave_id);
  if (!leave) return { ok: false, error: 'leave_not_found' };
  if (leave.final_status === 'approved' || leave.final_status === 'rejected') {
    return { ok: false, error: 'already_decided', message: 'ใบลานี้ตัดสินเรียบร้อยแล้ว' };
  }

  // === Permission check per stage ===
  if (stage === 1) {
    if (leave.stage1_status !== 'pending') {
      return { ok: false, error: 'stage1_not_pending', message: 'ใบลานี้ผ่านชั้น 1 ไปแล้ว' };
    }
    const supervisorId = getSupervisorFor(leave.user_id);
    if (supervisorId !== approver.user_id) {
      return { ok: false, error: 'forbidden', message: 'คุณไม่ใช่หัวหน้างานของผู้ลานี้' };
    }
  } else if (stage === 2) {
    if (leave.stage2_status !== 'pending') {
      return { ok: false, error: 'stage2_not_pending', message: 'ใบลานี้ผ่านชั้น 2 หรือถูกปฏิเสธไปแล้ว' };
    }
    if (!hasRole(approver.role, ROLES.ADMIN)) {
      return { ok: false, error: 'forbidden', message: 'เฉพาะ HR เท่านั้น' };
    }
  } else if (stage === 3) {
    if (leave.stage3_status !== 'pending') {
      return { ok: false, error: 'stage3_not_pending', message: 'ใบลานี้ตัดสินไปแล้ว' };
    }
    if (approver.role !== ROLES.OWNER) {
      return { ok: false, error: 'forbidden', message: 'เฉพาะผู้บริหารเท่านั้น' };
    }
  }

  // === Apply decision (with locking) ===
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: 'lock_failed', message: 'ระบบกำลังประมวลผล กรุณาลองอีกครั้ง' };
  }

  try {
    // re-read after lock
    const leaveAfterLock = findLeaveById_(payload.leave_id);
    if (!leaveAfterLock) return { ok: false, error: 'leave_not_found' };

    // re-check stage status under lock (กัน race: 2 admins กดพร้อมกัน)
    const stageStatusCol = 'stage' + stage + '_status';
    if (leaveAfterLock[stageStatusCol] !== 'pending') {
      return { ok: false, error: 'race_lost', message: 'มีผู้อื่นตัดสินใจไปแล้ว' };
    }

    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const row = leaveAfterLock._rowNumber;
    const newStatus = payload.decision === 'approve' ? 'approved' : 'rejected';

    sh.getRange(row, hdr.indexOf('stage' + stage + '_status') + 1).setValue(newStatus);
    sh.getRange(row, hdr.indexOf('stage' + stage + '_by') + 1).setValue(approver.user_id);
    sh.getRange(row, hdr.indexOf('stage' + stage + '_at') + 1).setValue(nowBangkok());
    if (payload.note) {
      sh.getRange(row, hdr.indexOf('stage' + stage + '_note') + 1).setValue(payload.note);
    }

    // === Determine next action ===
    const requester = findUserByUserId_(leaveAfterLock.user_id);

    if (payload.decision === 'reject') {
      // finalize as rejected
      sh.getRange(row, hdr.indexOf('final_status') + 1).setValue('rejected');
      // rollback quota
      rollbackQuota(leaveAfterLock.user_id, leaveAfterLock.leave_type, Number(leaveAfterLock.days));

      logInfo('approveLeave', 'rejected at stage ' + stage, { leaveId: payload.leave_id, by: approver.user_id });
      audit(payload.lineUserId, 'leave_reject_s' + stage, 'LeaveRequests', payload.leave_id, { note: payload.note });

      // notify ทุกคนที่เกี่ยวข้อง
      try {
        const rejectedCard = buildFinalRejectedCard(leaveAfterLock, requester, stage, approver.display_name, payload.note);
        // requester
        if (requester.line_user_id) pushMessage(requester.line_user_id, rejectedCard);
        // supervisor (if stage1 passed or stage 1 was the rejecter)
        const supId = getSupervisorFor(leaveAfterLock.user_id);
        if (supId && stage !== 1) {
          const sup = findUserByUserId_(supId);
          if (sup && sup.line_user_id) pushMessage(sup.line_user_id, rejectedCard);
        }
        // ADMIN (if stage 2 passed)
        if (stage > 2) pushToAllAdmins(rejectedCard);
        // OWNER (if stage 3 passed) — n/a since stage 3 finalize
      } catch (e) {
        logWarn('approveLeave reject', 'push failed: ' + e.message);
      }

      return { ok: true, decision: 'reject', final_status: 'rejected' };
    }

    // approve → move to next stage
    audit(payload.lineUserId, 'leave_approve_s' + stage, 'LeaveRequests', payload.leave_id);

    const nextStage = computeNextPendingStage_(leaveAfterLock, stage);

    if (nextStage === null) {
      // FINAL approved
      sh.getRange(row, hdr.indexOf('final_status') + 1).setValue('approved');
      commitQuota(leaveAfterLock.user_id, leaveAfterLock.leave_type, Number(leaveAfterLock.days));

      logInfo('approveLeave', 'final approved', { leaveId: payload.leave_id });

      // notify ผู้ลา + supervisor + ADMIN
      try {
        const finalLeave = findLeaveById_(payload.leave_id);
        const card = buildFinalApprovedCard(finalLeave, requester);
        if (requester.line_user_id) pushMessage(requester.line_user_id, card);
        const supId = getSupervisorFor(leaveAfterLock.user_id);
        if (supId) {
          const sup = findUserByUserId_(supId);
          if (sup && sup.line_user_id) pushMessage(sup.line_user_id, card);
        }
        pushToAllAdmins(card);
      } catch (e) {
        logWarn('approveLeave final', 'push failed: ' + e.message);
      }

      return { ok: true, decision: 'approve', final_status: 'approved' };
    }

    // intermediate approved → notify ผู้ลาว่าผ่านชั้น stage X + trigger next stage
    try {
      const updatedLeave = findLeaveById_(payload.leave_id);
      const stageNames = { 1: 'หัวหน้างาน', 2: 'HR', 3: 'ผู้บริหาร' };
      const updateCard = buildApprovalUpdateCard(
        updatedLeave, stage, approver.display_name,
        'รอ' + stageNames[nextStage]
      );
      if (requester.line_user_id) pushMessage(requester.line_user_id, updateCard);

      // trigger next stage flex
      sendApprovalRequestStage_(updatedLeave, requester, nextStage);
    } catch (e) {
      logWarn('approveLeave intermediate', 'push failed: ' + e.message);
    }

    return { ok: true, decision: 'approve', moved_to_stage: nextStage };

  } finally {
    lock.releaseLock();
  }
}

/**
 * compute stage ถัดไปที่ status=pending — หรือ null ถ้าจบ
 * รอง: ถ้า stage ถัดไป=skipped ให้ skip ไป stage ถัดไป
 */
function computeNextPendingStage_(leave, justApprovedStage) {
  for (let s = justApprovedStage + 1; s <= 3; s++) {
    const status = leave['stage' + s + '_status'];
    if (status === 'pending') return s;
    if (status === 'skipped' || status === 'approved') continue;
  }
  return null;
}

/**
 * push flex card "ขออนุมัติชั้น X" หา approver ของ stage นั้น
 *
 * Stage 1: หัวหน้างานของ requester (จาก Supervisors sheet)
 * Stage 2: ADMIN ทุกคน
 * Stage 3: OWNER ทุกคน
 */
function sendApprovalRequestStage_(leave, requester, stage) {
  try {
    const card = buildApprovalRequestCard(leave, requester, stage);

    if (stage === 1) {
      const supId = getSupervisorFor(leave.user_id);
      if (!supId) {
        logWarn('sendApprovalRequestStage_', 'no supervisor for ' + leave.user_id);
        return;
      }
      const sup = findUserByUserId_(supId);
      if (sup && sup.line_user_id) {
        pushMessage(sup.line_user_id, card);
      }
    } else if (stage === 2) {
      pushToAllAdmins(card);
    } else if (stage === 3) {
      pushToAllOwners(card);
    }
  } catch (e) {
    logError('sendApprovalRequestStage_', 'push failed: ' + e.message, { leaveId: leave.leave_id, stage: stage });
  }
}

/**
 * payload = { lineUserId }
 * return { ok, pending: [...] } — ใบลาที่ user ต้องตัดสินใจ ตาม role
 *   - หัวหน้างาน (USER + is_supervisor=TRUE): stage 1 ของลูกน้องตัวเอง
 *   - ADMIN: stage 2 (pending ทั้งหมด)
 *   - OWNER: stage 3 (pending ทั้งหมด)
 *   (OWNER เห็น stage 2 ที่ ADMIN ยังไม่ตัดสินด้วยก็ได้ — ที่นี่ไม่รวม กัน confuse)
 */
function getPendingForMe(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };

  const user = findUserByLineId_(payload.lineUserId);
  const isSup = isSupervisorUser_(user);

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (sh.getLastRow() < 2) return { ok: true, pending: [] };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const pending = [];

  data.forEach(function (row) {
    const obj = {};
    hdr.forEach(function (h, j) { obj[h] = row[j]; });
    if (obj.final_status === 'approved' || obj.final_status === 'rejected') return;

    // stage 1
    if (isSup && obj.stage1_status === 'pending') {
      const supId = getSupervisorFor(obj.user_id);
      if (supId === user.user_id) {
        pending.push(shapePendingItem_(obj, 1));
      }
    }
    // stage 2
    if (hasRole(user.role, ROLES.ADMIN) && obj.stage2_status === 'pending' && obj.stage1_status !== 'pending') {
      // คือผ่าน stage 1 (approved/skipped) แล้ว เหลือ stage 2 pending
      // exclude case where requester is the admin themselves
      if (obj.user_id !== user.user_id) {
        pending.push(shapePendingItem_(obj, 2));
      }
    }
    // stage 3
    if (user.role === ROLES.OWNER && obj.stage3_status === 'pending' && obj.stage2_status !== 'pending') {
      if (obj.user_id !== user.user_id) {
        pending.push(shapePendingItem_(obj, 3));
      }
    }
  });

  // sort: submitted_at asc (รอนานสุดก่อน)
  pending.sort(function (a, b) { return String(a.submitted_at).localeCompare(String(b.submitted_at)); });

  return { ok: true, pending: pending };
}

function shapePendingItem_(leave, myStage) {
  const requester = findUserByUserId_(leave.user_id) || {};
  return {
    leave_id: leave.leave_id,
    my_stage: myStage,
    requester_name: requester.display_name,
    requester_dept: requester.department,
    requester_position: requester.position,
    leave_type: leave.leave_type,
    leave_type_label: leaveTypeLabel_(leave.leave_type),
    date_from: typeof leave.date_from === 'object' ? Utilities.formatDate(leave.date_from, 'Asia/Bangkok', 'yyyy-MM-dd') : leave.date_from,
    date_to: typeof leave.date_to === 'object' ? Utilities.formatDate(leave.date_to, 'Asia/Bangkok', 'yyyy-MM-dd') : leave.date_to,
    days: Number(leave.days),
    is_retroactive: leave.is_retroactive === true || leave.is_retroactive === 'TRUE',
    reason: leave.reason,
    attachment_url: leave.attachment_url,
    gps_lat: leave.gps_lat, gps_lng: leave.gps_lng,
    submitted_at: leave.submitted_at,
    stage1_status: leave.stage1_status,
    stage2_status: leave.stage2_status,
    stage3_status: leave.stage3_status,
  };
}

// ========== Postback handler (LINE webhook) ==========

/**
 * เรียกจาก WebApp.gs::handleLineEvent_
 * data จาก flex button: "action=approve_leave&id=LV-...&stage=N&decision=approve"
 *                       "action=approve_register&user_id=EMP-..."
 *                       "action=reject_register&user_id=EMP-..."
 *                       "action=open_my_requests"
 *                       "action=open_manual"
 */
function handlePostback_(ev) {
  const data = parseQueryString_(ev.postback && ev.postback.data || '');
  const lineUserId = ev.source && ev.source.userId;
  const replyToken = ev.replyToken;

  try {
    if (data.action === 'approve_leave') {
      const res = approveLeave({
        lineUserId: lineUserId,
        leave_id: data.id,
        stage: Number(data.stage),
        decision: data.decision,
      });
      if (res.ok) {
        const msg = data.decision === 'approve' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธเรียบร้อย';
        replyText(replyToken, msg);
      } else {
        replyText(replyToken, res.message || ('ไม่สำเร็จ: ' + res.error));
      }
    } else if (data.action === 'approve_register') {
      const res = approveRegister({ lineUserId: lineUserId, user_id: data.user_id });
      replyText(replyToken, res.ok ? 'อนุมัติเรียบร้อย' : (res.message || res.error));
    } else if (data.action === 'reject_register') {
      const res = rejectRegister({ lineUserId: lineUserId, user_id: data.user_id });
      replyText(replyToken, res.ok ? 'ปฏิเสธเรียบร้อย' : (res.message || res.error));
    } else if (data.action === 'open_my_requests' || data.action === 'open_manual') {
      // no reply needed — LIFF link จะเปิดเอง
    } else {
      logWarn('handlePostback_', 'unknown action: ' + data.action);
    }
  } catch (err) {
    logError('handlePostback_', err.message, { data: data });
    try { replyText(replyToken, 'เกิดข้อผิดพลาด: ' + err.message); } catch (e) {}
  }
}

function parseQueryString_(s) {
  const result = {};
  if (!s) return result;
  s.split('&').forEach(function (pair) {
    const i = pair.indexOf('=');
    if (i < 0) { result[pair] = ''; return; }
    const k = decodeURIComponent(pair.substring(0, i));
    const v = decodeURIComponent(pair.substring(i + 1));
    result[k] = v;
  });
  return result;
}
