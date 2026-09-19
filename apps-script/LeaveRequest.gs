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

  const actor = findUserByLineId_(payload.lineUserId);
  if (!actor) return { ok: false, error: 'user_not_found' };

  // === proxy: พนักงานพิเศษ/HR/ผู้บริหาร กดลาแทนคนอื่น ===
  let requester = actor;
  let proxyNote = '';
  if (payload.on_behalf_user_id && payload.on_behalf_user_id !== actor.user_id) {
    if (!canProxyLeave_(actor)) {
      return { ok: false, error: 'forbidden_proxy', message: 'คุณไม่มีสิทธิ์ลาแทนคนอื่น' };
    }
    const target = findUserByUserId_(payload.on_behalf_user_id);
    if (!target) return { ok: false, error: 'target_not_found', message: 'ไม่พบพนักงานที่ต้องการลาแทน' };
    if (target.status !== 'active') return { ok: false, error: 'target_inactive', message: 'พนักงานที่ต้องการลาแทนไม่พร้อมใช้งาน' };
    // ใบของผู้บริหารอนุมัติอัตโนมัติ — คนอื่นยื่นแทนไม่ได้ ไม่งั้นได้วันลาที่ไม่มีใครอนุมัติจริง
    if (target.role === ROLES.OWNER) {
      return { ok: false, error: 'forbidden_proxy', message: 'ลาแทนผู้บริหารไม่ได้ — ผู้บริหารต้องยื่นเอง' };
    }
    requester = target;
    proxyNote = ' (ลาแทนโดย ' + (actor.display_name || actor.user_id) + ')';
  }

  // === validate fields ===
  if (ALL_LEAVE_TYPES.indexOf(payload.leave_type) < 0) {
    return { ok: false, error: 'invalid_leave_type' };
  }
  const typeMeta = LEAVE_TYPE_META[payload.leave_type] || {};
  if (!payload.date_from || !payload.date_to) {
    return { ok: false, error: 'missing_dates' };
  }
  if (!payload.reason || String(payload.reason).trim().length < 3) {
    return { ok: false, error: 'reason_too_short', message: 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร' };
  }

  const cfg = getConfig();
  // โค้ดใหม่เขียนคอลัมน์ใหม่ — เติมหัวตารางให้เองก่อน ไม่ต้องรอใครกด setupDatabase()
  ensureSheetColumns_('LeaveRequests');

  // === ลาเป็นชั่วโมง === (วันเดียว + ช่วงเวลา → หักโควตาเป็นเศษของวัน)
  const isHourly = payload.leave_unit === 'hour';
  let hours = 0;
  if (isHourly) {
    if (!isHourlyLeaveType_(payload.leave_type, cfg)) {
      return { ok: false, error: 'hourly_not_allowed',
        message: leaveTypeLabel_(payload.leave_type) + 'ลาเป็นชั่วโมงไม่ได้ — กรุณาเลือกลาเป็นวัน' };
    }
    payload.date_to = payload.date_from;
    const hr = computeLeaveHours_(payload.time_from, payload.time_to, cfg);
    if (!hr.ok) return hr;
    hours = hr.hours;
  }

  // === validate GPS ===
  // เปิด GPS ไม่ได้ → ส่งใบลาได้ แต่ต้องระบุเหตุผล แล้วใบลาจะถูกติดธง
  // "ไม่มีพิกัดยืนยัน" ให้ผู้อนุมัติเห็นชัดทั้งในการ์ด LINE และหน้าอนุมัติ
  const hasGps = isFinite(Number(payload.gps_lat)) && isFinite(Number(payload.gps_lng));
  const gpsMissingReason = String(payload.gps_missing_reason || '').trim();
  if (cfg.gps_required && !hasGps && gpsMissingReason.length < GPS_MISSING_REASON_MIN) {
    return {
      ok: false,
      error: 'gps_missing_reason_required',
      message: 'เปิด GPS ไม่ได้ใช่ไหม — กรุณาระบุเหตุผลอย่างน้อย ' + GPS_MISSING_REASON_MIN + ' ตัวอักษร เพื่อส่งใบลาต่อ',
    };
  }

  // === compute days ===
  const countWeekends = cfg.count_weekends_as_leave === true || cfg.count_weekends_as_leave === 'TRUE';
  const workDays = workDaysIso_(cfg);
  const calendarDays = countLeaveDays(payload.date_from, payload.date_to, countWeekends, workDays);
  const days = isHourly && calendarDays > 0 ? hoursToLeaveDays_(hours, cfg) : calendarDays;
  if (days <= 0) {
    // แยกสองสาเหตุให้ชัด — "วันหยุดทั้งช่วง" ไม่ใช่ "กรอกวันที่ผิด"
    // ข้อความเดียวคลุมทั้งสองแบบ ทำให้คนอ่านแล้วไปนั่งแก้วันที่ทั้งที่วันที่ถูกอยู่แล้ว
    const validRange = !!ymdToUtcDate_(payload.date_from) && !!ymdToUtcDate_(payload.date_to) &&
                       ymdToUtcDate_(payload.date_to) >= ymdToUtcDate_(payload.date_from);
    return validRange
      ? { ok: false, error: 'all_days_non_working',
          message: 'วันที่เลือกเป็นวันหยุดของบริษัททั้งช่วง จึงไม่ต้องยื่นใบลา — ถ้าวันหยุดตั้งไว้ไม่ตรงกับจริง แจ้ง HR แก้ในหน้าจัดการได้' }
      : { ok: false, error: 'invalid_date_range', message: 'ช่วงวันที่ไม่ถูกต้อง' };
  }

  // === is_retroactive === (ลาย้อนหลังได้เฉพาะประเภทที่ allowRetro เช่น ลาป่วย/ลาคลอดฉุกเฉิน)
  const isRetro = new Date(payload.date_from + 'T00:00:00+07:00') < new Date(todayBangkok() + 'T00:00:00+07:00');
  if (isRetro && !typeMeta.allowRetro) {
    return { ok: false, error: 'retroactive_not_allowed',
      message: 'ลาย้อนหลังทำได้เฉพาะลาป่วย/ลาคลอดฉุกเฉินเท่านั้น' };
  }

  // === validate quota === (เฉพาะประเภทที่มีโควตา — ลาอื่นๆ ตามกฎหมายไม่หักโควตา)
  if (isQuotaLeaveType_(payload.leave_type)) {
    const year = yearOfYmd_(payload.date_from);
    let quota = getQuotaRow_(requester.user_id, year);
    if (!quota) {
      ensureQuotaRow_(requester.user_id, year);
      quota = getQuotaRow_(requester.user_id, year);
    }
    if (!quota) {
      return { ok: false, error: 'no_quota_row', message: 'ยังไม่มีโควตาวันลาของปี ' + year + ' กรุณาแจ้ง HR' };
    }
    const quotaShaped = shapeQuota_(quota);
    const available = quotaShaped[payload.leave_type].available;
    if (roundDays_(days) > roundDays_(available) + 1e-9) {
      return { ok: false, error: 'quota_exceeded',
        message: 'โควตา' + leaveTypeLabel_(payload.leave_type) + 'คงเหลือ ' + available + ' วัน ลาได้ไม่เกินนี้' };
    }
  }

  // === validate against rules === (จำนวนวันติดกัน + เอกสารแนบ)
  const hasAttachment = !!payload.attachment_base64;
  const ruleCheck = validateAgainstRules_(payload.leave_type, payload.date_from, payload.date_to, days, hasAttachment);
  if (!ruleCheck.ok) return ruleCheck;

  // === แจ้งล่วงหน้าไม่ทัน → ให้ติ๊ก "เป็นกรณีฉุกเฉิน" พร้อมเหตุผล แทนการบล็อกไม่ให้ส่ง ===
  const emergencyReason = String(payload.emergency_reason || '').trim();
  const advanceCheck = checkAdvanceNotice_(
    payload.leave_type,
    payload.date_from,
    payload.is_emergency === true || payload.is_emergency === 'TRUE',
    emergencyReason
  );
  if (!advanceCheck.ok) return advanceCheck;
  const isEmergency = advanceCheck.emergency === true;
  const docPending = ruleCheck.docPending === true;

  // === ใบลาซ้อนกับใบที่ยังรอ/อนุมัติแล้ว === (ลาชั่วโมงทำให้เกิดง่ายขึ้น: ลาทั้งวันแล้วยื่นลาชั่วโมงซ้ำ)
  const clash = findOverlappingLeave_(requester.user_id, payload.date_from, payload.date_to,
    isHourly ? payload.time_from : '', isHourly ? payload.time_to : '');
  if (clash) {
    return { ok: false, error: 'overlap',
      message: 'ช่วงนี้มีใบลาอยู่แล้ว (' + clash.leave_id + ' · ' + leaveTypeLabel_(clash.leave_type) + ' ' +
               leaveAmountText_(clash) + ') — ถ้าต้องการเปลี่ยน ให้ถอน/ขอยกเลิกใบเดิมก่อน' };
  }

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

  // === determine stage flow === (กติกาเดียวกับใบขอยกเลิก ดู computeInitialStages_)
  const flow = computeInitialStages_(requester);
  const stage1Required = flow.stage1Required;
  const stage1Status = flow.stage1Status;
  const stage2Status = flow.stage2Status;
  const stage3Status = flow.stage3Status;
  const firstApprovalStage = flow.firstApprovalStage;
  const finalStatus = flow.finalStatus;

  // === insert row ===
  const leaveId = nextLeaveId();
  const now = nowBangkok();
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');

  appendRowByHeader_(sh, {
    leave_id: leaveId,
    user_id: requester.user_id,
    leave_type: payload.leave_type,
    date_from: payload.date_from,
    date_to: payload.date_to,
    days: days,
    is_retroactive: isRetro,
    reason: payload.reason + proxyNote,
    gps_lat: Number(payload.gps_lat || 0) || '',
    gps_lng: Number(payload.gps_lng || 0) || '',
    gps_accuracy: Number(payload.gps_accuracy || 0) || '',
    attachment_url: attachmentUrl,
    stage1_required: stage1Required,
    stage1_status: stage1Status,
    stage1_at: stage1Status === 'skipped' ? now : '',
    stage2_status: stage2Status,
    stage2_at: stage2Status === 'skipped' ? now : '',
    stage3_status: stage3Status,
    stage3_at: requester.role === ROLES.OWNER ? now : '',
    stage3_note: requester.role === ROLES.OWNER ? 'auto-approved (OWNER)' : '',
    final_status: finalStatus,
    submitted_at: now,
    gps_missing_reason: hasGps ? '' : gpsMissingReason,
    is_emergency: isEmergency,
    emergency_reason: isEmergency ? (advanceCheck.reason || emergencyReason) : '',
    record_type: 'leave',
    parent_leave_id: '',
    last_reminded_at: '',
    reminder_count: 0,
    leave_unit: isHourly ? 'hour' : 'day',
    // ⭐ ขึ้นต้นด้วย ' ให้ชีตเก็บเป็นข้อความ — ถ้าชีตแปลงเป็นเวลา จะได้ Date ปี 1899
    //    ซึ่งเขตเวลาไทยยุคนั้นเพี้ยน +6:42 อ่านกลับมาเวลาเคลื่อน 17-18 นาที
    time_from: isHourly ? "'" + String(payload.time_from) : '',
    time_to: isHourly ? "'" + String(payload.time_to) : '',
    hours: isHourly ? hours : '',
    doc_pending: docPending,
    extra_attachments: '',
  });

  // === reserve quota === (เฉพาะประเภทที่มีโควตา — ลาอื่นๆ ไม่แตะ LeaveQuota)
  if (isQuotaLeaveType_(payload.leave_type)) {
    const quotaYear = quotaYearOf_({ date_from: payload.date_from });
    if (finalStatus === 'approved') {
      // OWNER auto-approve → commit ทันที
      commitQuota(requester.user_id, payload.leave_type, days, quotaYear);
    } else {
      reserveQuota(requester.user_id, payload.leave_type, days, quotaYear);
    }
  }

  logInfo('submitLeave', 'submitted', { leaveId: leaveId, userId: requester.user_id, days: days });
  audit(payload.lineUserId, 'leave_submit', 'LeaveRequests', leaveId, {
    leave_type: payload.leave_type, date_from: payload.date_from, date_to: payload.date_to, days: days,
  });

  // === push notifications + start approval flow ===
  const leave = findLeaveById_(leaveId);

  // confirm card → ผู้ที่กดส่ง (operator) + ผู้ลา (ถ้าลาแทน)
  try {
    const nextStageLabel = flow.ownerFirst && firstApprovalStage === 1
      ? 'รอผู้บริหารตรวจ' : stageWaitingLabel_(firstApprovalStage);
    pushMessage(payload.lineUserId, buildLeaveSubmittedCard(leave, nextStageLabel));
    // ลาแทน → แจ้งผู้ลาด้วย (ถ้าผูก LINE ไว้)
    if (proxyNote && requester.line_user_id && requester.line_user_id !== payload.lineUserId) {
      pushMessage(requester.line_user_id, buildLeaveSubmittedCard(leave, nextStageLabel));
    }
  } catch (e) {
    logWarn('submitLeave', 'push submitted card failed: ' + e.message);
  }

  // trigger first approval stage
  if (firstApprovalStage === 1) {
    sendApprovalRequestStage_(leave, requester, 1);

    // cc HR ให้รู้ตั้งแต่ต้นว่ามีใบลาเข้ามา รอหัวหน้าคนไหนอยู่
    // (ชั้น 2 ขึ้นไป HR ได้การ์ดขออนุมัติอยู่แล้ว ไม่ต้อง cc ซ้ำ)
    // ⭐ ผู้อนุมัติขั้นแรกเป็นผู้บริหาร → ยังไม่แจ้ง HR รอผู้บริหารอนุมัติก่อนค่อยแจ้ง (ลูกค้าสั่ง 19 ก.ย. 69)
    if (!flow.ownerFirst) {
      try {
        const sup = resolveStage1Approver_(requester.user_id);
        pushToAllAdmins(buildHrNoticeCard(leave, requester, sup, 'รอหัวหน้างานตรวจ'));
      } catch (e) {
        logWarn('submitLeave', 'cc HR failed: ' + e.message);
      }
    }
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

  return { ok: true, leave_id: leaveId, days: days, hours: hours, leave_unit: isHourly ? 'hour' : 'day',
           doc_pending: docPending, final_status: finalStatus };
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
    gps_missing_reason: leave.gps_missing_reason || '',
    is_emergency: leave.is_emergency === true || leave.is_emergency === 'TRUE',
    emergency_reason: leave.emergency_reason || '',
    record_type: leave.record_type || 'leave',
    parent_leave_id: leave.parent_leave_id || '',
    reminder_count: Number(leave.reminder_count || 0),
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
    leave_unit: leave.leave_unit || 'day',
    time_from: timeText_(leave.time_from),
    time_to: timeText_(leave.time_to),
    hours: Number(leave.hours || 0),
    amount_text: leaveAmountText_(leave),
    doc_pending: isTruthyCell_(leave.doc_pending),
    extra_attachments: parseExtraAttachments_(leave.extra_attachments),
    doc_request_status: leave.doc_request_status || '',
    doc_request_stage: Number(leave.doc_request_stage || 0),
    doc_request_note: leave.doc_request_note || '',
    doc_request_at: leave.doc_request_at || '',
    hr_fallback: isTruthyCell_(leave.hr_fallback),
  };
}
