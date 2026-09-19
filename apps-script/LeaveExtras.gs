/**
 * LeaveExtras.gs — ลาเป็นชั่วโมง + แนบเอกสารทีหลัง + ผู้อนุมัติขอเอกสารเพิ่ม
 *
 * Actions:
 *   - addLeaveAttachment(payload)   ผู้ลาแนบรูปเพิ่ม (ใบรับรองแพทย์ที่ได้มาทีหลัง / ตามที่ผู้อนุมัติขอ)
 *
 * Helper ที่ระบบอื่นเรียก:
 *   - hourlyLeaveConfig_()          ค่าตั้งลาเป็นชั่วโมงจาก Settings (มีค่าสำรองเสมอ)
 *   - computeLeaveHours_(f, t)      ชั่วโมงลาสุทธิ (หักพักเที่ยง)
 *   - leaveAmountText_(leave)       "2 ชม. (13:00-15:00)" หรือ "3 วัน" — ใช้ในการ์ด/หน้าจอ
 *   - parseExtraAttachments_(v)     อ่านคอลัมน์ extra_attachments (JSON) แบบไม่พัง
 *
 * ⭐ ลาเป็นชั่วโมงเก็บ days เป็นเศษของวัน (hours / hours_per_day) — โควตายังเป็นหน่วย "วัน" ชุดเดียว
 *    ไม่แยกโควตาชั่วโมงอีกก้อน ไม่งั้นลาป่วยครึ่งวันกับลาป่วยทั้งวันหักคนละกอง
 */

const EXTRA_ATTACHMENTS_MAX = 10;

function hhmmToMin_(v) {
  if (v instanceof Date) v = Utilities.formatDate(v, 'Asia/Bangkok', 'HH:mm');
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function minToHhmm_(n) {
  return padLeft_(Math.floor(n / 60), 2) + ':' + padLeft_(n % 60, 2);
}

/** ค่าตั้งลาเป็นชั่วโมง — Settings ยังไม่มีแถวก็ใช้ค่าสำรองได้ */
function hourlyLeaveConfig_(cfg) {
  const c = cfg || getConfig();
  const hpd = Number(c.hours_per_day);
  const types = String(c.hourly_leave_types == null || c.hourly_leave_types === ''
    ? 'sick,personal,vacation' : c.hourly_leave_types)
    .split(',').map(function (s) { return String(s).trim(); }).filter(Boolean);
  const ws = hhmmToMin_(c.work_start);
  const we = hhmmToMin_(c.work_end);
  const ls = hhmmToMin_(c.lunch_start == null ? '12:00' : c.lunch_start);
  const le = hhmmToMin_(c.lunch_end == null ? '13:00' : c.lunch_end);
  return {
    hoursPerDay: hpd > 0 ? hpd : 8,
    types: types,
    workStart: ws == null ? 8 * 60 + 30 : ws,
    workEnd: we == null ? 17 * 60 + 30 : we,
    lunchStart: ls,
    lunchEnd: le,
  };
}

function isHourlyLeaveType_(leaveType, cfg) {
  return hourlyLeaveConfig_(cfg).types.indexOf(leaveType) >= 0;
}

/**
 * ชั่วโมงลาสุทธิ = ช่วงที่เลือก − ช่วงที่ทับพักเที่ยง
 * return { ok, hours, minutes } | { ok:false, error, message }
 */
function computeLeaveHours_(timeFrom, timeTo, cfg) {
  const hc = hourlyLeaveConfig_(cfg);
  const f = hhmmToMin_(timeFrom);
  const t = hhmmToMin_(timeTo);
  if (f == null || t == null) {
    return { ok: false, error: 'invalid_time', message: 'กรุณาเลือกเวลาเริ่มและเวลาสิ้นสุดให้ครบ' };
  }
  if (t <= f) {
    return { ok: false, error: 'invalid_time_range', message: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' };
  }
  if (f < hc.workStart || t > hc.workEnd) {
    return { ok: false, error: 'outside_work_hours',
      message: 'ลาเป็นชั่วโมงได้เฉพาะในเวลางาน ' + minToHhmm_(hc.workStart) + '-' + minToHhmm_(hc.workEnd) + ' น.' };
  }
  let minutes = t - f;
  if (hc.lunchStart != null && hc.lunchEnd != null && hc.lunchEnd > hc.lunchStart) {
    const overlap = Math.min(t, hc.lunchEnd) - Math.max(f, hc.lunchStart);
    if (overlap > 0) minutes -= overlap;
  }
  if (minutes < 30) {
    return { ok: false, error: 'too_short', message: 'ลาเป็นชั่วโมงได้ขั้นต่ำ 30 นาที (ไม่นับช่วงพักเที่ยง)' };
  }
  const hours = Math.round(minutes / 60 * 100) / 100;
  if (hours >= hc.hoursPerDay) {
    return { ok: false, error: 'use_full_day',
      message: 'ลาเกิน ' + hc.hoursPerDay + ' ชั่วโมงเท่ากับเต็มวัน — เลือก "ลาเป็นวัน" แทน' };
  }
  return { ok: true, hours: hours, minutes: minutes };
}

/** ชั่วโมง → วันสำหรับหักโควตา (ปัด 4 ตำแหน่ง กันเศษทศนิยมสะสม) */
function hoursToLeaveDays_(hours, cfg) {
  const hpd = hourlyLeaveConfig_(cfg).hoursPerDay;
  return Math.round(Number(hours) / hpd * 10000) / 10000;
}

function isHourLeave_(leave) {
  return String((leave && leave.leave_unit) || '') === 'hour';
}

/** เวลาในเซลล์ → 'HH:mm' (ตัด ' นำหน้าที่ใช้บังคับเป็นข้อความ) */
function timeText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', 'HH:mm');
  return String(v || '').replace(/^'/, '');
}

/** ข้อความจำนวนลา — ลาชั่วโมงห้ามโชว์ "0.25 วัน" ให้คนงง */
function leaveAmountText_(leave) {
  if (isHourLeave_(leave)) {
    const tf = timeText_(leave.time_from);
    const tt = timeText_(leave.time_to);
    return Number(leave.hours || 0) + ' ชม.' + (tf && tt ? ' (' + tf + '-' + tt + ' น.)' : '');
  }
  return Number(leave.days || 0) + ' วัน';
}

/** อ่าน extra_attachments — ค่าเพี้ยน/ว่าง คืน [] ไม่ throw */
function parseExtraAttachments_(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const arr = JSON.parse(String(v));
    return Array.isArray(arr) ? arr.filter(function (a) { return a && a.url; }) : [];
  } catch (e) {
    return [];
  }
}

function isTruthyCell_(v) {
  return v === true || v === 'TRUE' || v === 'true';
}

/**
 * ผู้ลาแนบรูปเพิ่มให้ใบลาเดิม
 * payload = { lineUserId, leave_id, attachment_base64, attachment_filename?, note? }
 *
 * ใครแนบได้: เจ้าของใบลา · คนที่ลาแทนได้ (พนักงานพิเศษ/HR/ผู้บริหาร)
 * ใบสถานะไหนแนบได้: รออนุมัติ + อนุมัติแล้ว (ใบรับรองแพทย์มักได้หลังหายป่วย)
 * แนบแล้ว: ปลดธง "รอเอกสาร" · ถ้าผู้อนุมัติขอไว้ → แจ้งผู้อนุมัติคนนั้นว่าเอกสารมาแล้ว · HR ได้สำเนาเสมอ
 */
function addLeaveAttachment(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };
  if (!payload.leave_id) return { ok: false, error: 'missing_leave_id' };
  if (!payload.attachment_base64) {
    return { ok: false, error: 'missing_file', message: 'กรุณาเลือกรูปที่จะแนบ' };
  }

  const actor = findUserByLineId_(payload.lineUserId);
  if (!actor || actor.status !== 'active') return { ok: false, error: 'not_active' };

  ensureSheetColumns_('LeaveRequests');

  const leave0 = findLeaveById_(payload.leave_id);
  if (!leave0) return { ok: false, error: 'not_found', message: 'ไม่พบใบลานี้' };
  if ((leave0.record_type || 'leave') !== 'leave') {
    return { ok: false, error: 'not_leave', message: 'แนบเอกสารได้เฉพาะใบลา' };
  }
  // แนบแทนได้เฉพาะ HR/ผู้บริหาร (รับรูปจากคนที่ไม่มีไลน์) — พนักงานพิเศษลาแทนได้ แต่ไม่ควรแก้หลักฐานใบของทั้งบริษัท
  const isOwnLeave = leave0.user_id === actor.user_id;
  if (!isOwnLeave && !hasRole(actor.role, ROLES.ADMIN)) {
    return { ok: false, error: 'forbidden', message: 'แนบเอกสารได้เฉพาะใบลาของตัวเอง' };
  }
  if (['pending', 'approved'].indexOf(leave0.final_status) < 0) {
    return { ok: false, error: 'closed', message: 'ใบลานี้ปิดไปแล้ว แนบเอกสารเพิ่มไม่ได้' };
  }
  if (parseExtraAttachments_(leave0.extra_attachments).length >= EXTRA_ATTACHMENTS_MAX) {
    return { ok: false, error: 'too_many', message: 'แนบเพิ่มได้สูงสุด ' + EXTRA_ATTACHMENTS_MAX + ' รูปต่อใบลา' };
  }

  // อัปโหลดก่อนล็อก — ช้าที่สุดของทั้งฟังก์ชัน ไม่ควรถือล็อกค้างไว้
  let url = '';
  try {
    const filename = (payload.attachment_filename || ('leave-extra-' + Date.now() + '.jpg'))
      .replace(/[^a-zA-Z0-9.\-_]/g, '_');
    url = uploadImage(payload.attachment_base64, filename, 'leave-proofs');
  } catch (err) {
    logError('addLeaveAttachment', 'upload failed: ' + err.message, { leaveId: payload.leave_id });
    return { ok: false, error: 'attachment_upload_failed', message: 'อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: 'lock_failed', message: 'ระบบกำลังประมวลผล กรุณาลองอีกครั้ง' };
  }

  let leave;
  let wasRequested = false;
  try {
    leave = findLeaveById_(payload.leave_id);
    // ตรวจซ้ำใต้ล็อก — ระหว่างอัปโหลดใบอาจถูกปฏิเสธ/ถอน/แนบครบจำนวนไปแล้ว
    if (!leave || ['pending', 'approved'].indexOf(leave.final_status) < 0) {
      return { ok: false, error: 'closed', message: 'ใบลานี้ปิดไปแล้ว แนบเอกสารเพิ่มไม่ได้' };
    }
    const list = parseExtraAttachments_(leave.extra_attachments);
    if (list.length >= EXTRA_ATTACHMENTS_MAX) {
      return { ok: false, error: 'too_many', message: 'แนบเพิ่มได้สูงสุด ' + EXTRA_ATTACHMENTS_MAX + ' รูปต่อใบลา' };
    }
    list.push({
      url: url,
      at: nowBangkok(),
      by: actor.user_id,
      note: String(payload.note || '').trim().slice(0, 100),
    });
    wasRequested = leave.doc_request_status === 'requested';

    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
    const patch = { extra_attachments: JSON.stringify(list), doc_pending: false };
    if (wasRequested) {
      patch.doc_request_status = 'submitted';
      // ผู้อนุมัติได้เอกสารแล้ว — เริ่มนับเวลาเงียบใหม่จากตอนนี้ (ว่าง = นับจากตอนเข้าชั้น = เตือนทันที)
      patch.last_reminded_at = nowBangkok();
    }
    updateRowByHeader_(sh, leave._rowNumber, patch);
  } finally {
    lock.releaseLock();
  }

  audit(payload.lineUserId, 'leave_add_attachment', 'LeaveRequests', payload.leave_id, { url: url });
  logInfo('addLeaveAttachment', 'แนบเอกสารเพิ่ม', { leaveId: payload.leave_id, by: actor.user_id, requested: wasRequested });

  // === แจ้งคนที่ต้องรู้ ===
  try {
    const fresh = findLeaveById_(payload.leave_id);
    const requester = findUserByUserId_(fresh.user_id) || actor;
    const card = buildDocAddedCard(fresh, requester, url, wasRequested, String(payload.note || '').trim().slice(0, 100));
    const sentTo = {};
    const sendOnce = function (u) {
      if (u && u.line_user_id && u.status === 'active' && !sentTo[u.line_user_id] && u.user_id !== actor.user_id) {
        sentTo[u.line_user_id] = true;
        pushMessage(u.line_user_id, card);
      }
    };
    if (wasRequested && fresh.doc_request_by) sendOnce(findUserByUserId_(fresh.doc_request_by));
    // ใบยังรออนุมัติ → คนที่ถือใบอยู่ตอนนี้ต้องเห็นเอกสารใหม่ด้วย (ไม่ใช่แค่ HR)
    if (fresh.final_status === 'pending') {
      if (fresh.stage1_status === 'pending') {
        sendOnce(resolveStage1Approver_(fresh.user_id));
      } else if (fresh.stage2_status !== 'pending' && fresh.stage3_status === 'pending') {
        getExecutivesFor(fresh.user_id).users.forEach(sendOnce);
      }
    }
    // HR เก็บเอกสารประกอบการลา — ได้สำเนาทุกครั้ง
    getUsersByRole_(ROLES.ADMIN).forEach(sendOnce);
  } catch (e) {
    logWarn('addLeaveAttachment', 'แจ้งเตือนไม่สำเร็จ: ' + e.message);
  }

  return { ok: true, url: url, request_cleared: wasRequested };
}

function ymdOf_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

/**
 * หาใบลา (รอ/อนุมัติแล้ว) ของคนนี้ที่ช่วงวันทับกัน — ลาชั่วโมงสองใบวันเดียวกันต้องทับเวลาด้วยถึงนับว่าซ้อน
 * ใบเต็มวันครอบทุกช่วงเวลาของวันนั้น
 * @return {Object|null} แถวใบลาที่ชน
 */
function findOverlappingLeave_(userId, dateFrom, dateTo, timeFrom, timeTo) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (sh.getLastRow() < 2) return null;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const newIsHour = !!(timeFrom && timeTo);
  const nf = hhmmToMin_(timeFrom);
  const nt = hhmmToMin_(timeTo);
  for (let i = 0; i < data.length; i++) {
    const r = {};
    hdr.forEach(function (h, j) { r[h] = data[i][j]; });
    if (r.user_id !== userId) continue;
    if ((r.record_type || 'leave') !== 'leave') continue;
    if (['pending', 'approved'].indexOf(r.final_status) < 0) continue;
    const f = ymdOf_(r.date_from);
    const t = ymdOf_(r.date_to);
    if (!(f <= dateTo && t >= dateFrom)) continue;
    if (newIsHour && isHourLeave_(r)) {
      const tf = hhmmToMin_(timeText_(r.time_from));
      const tt = hhmmToMin_(timeText_(r.time_to));
      if (tf != null && tt != null && !(tf < nt && tt > nf)) continue;   // เวลาไม่ทับ = ลาได้ทั้งสองช่วง
    }
    return r;
  }
  return null;
}
