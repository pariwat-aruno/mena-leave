/**
 * Rules.gs — เงื่อนไขการลา + endpoint สำหรับ "ดูเงื่อนไข" ก่อนทำรายการ
 *
 * Actions:
 *   - getRules(payload)               return rules active ทั้งหมด (LIFF request.html — Step 1)
 *   - getApprovalConditions(payload)  user เปิด request.html → return quota คงเหลือ + rules
 *   - upsertRule(payload)             ADMIN/OWNER แก้ rule (ADMIN ผ่าน Pending_Changes)
 */

/** getRules — สำหรับโชว์ในหน้า request.html step 1 + admin.html */
function getRules(payload) {
  payload = payload || {};
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRules');
  if (sh.getLastRow() < 2) return { ok: true, rules: [] };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const iActive = hdr.indexOf('is_active');

  const rules = data
    .filter(function (row) {
      const v = row[iActive];
      return v === true || v === 'TRUE' || v === 'true';
    })
    .map(function (row) {
      const obj = {};
      hdr.forEach(function (h, j) { obj[h] = row[j]; });
      return obj;
    });

  return { ok: true, rules: rules };
}

/**
 * payload = { lineUserId }
 * return { ok, quota, rules }
 * — รวมข้อมูลที่ user ต้องเห็นในหน้า "เงื่อนไขการลา" (step 1 ของ request.html)
 */
function getApprovalConditions(payload) {
  payload = payload || {};
  if (!payload.lineUserId) return { ok: false, error: 'missing_line_user_id' };
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };

  const quotaRes = getMyQuota(payload);
  const rulesRes = getRules(payload);
  const cfg = getConfig();

  return {
    ok: true,
    quota: quotaRes.quota,
    rules: rulesRes.rules,
    // หน้าจอต้องใช้ค่าเดียวกับที่ backend ตรวจ — ห้ามเขียนเลขตายไว้ในหน้าจอ
    emergency_reason_min: Number(cfg.emergency_reason_min || 10),
    gps_missing_reason_min: GPS_MISSING_REASON_MIN,
    // วันทำงานของบริษัท — หน้าจอต้องนับวันลาด้วยปฏิทินชุดเดียวกับ backend
    // ไม่งั้นสรุปก่อนส่งบอก 1 วัน แต่ระบบหักจริงคนละเลข
    work_days: workDaysIso_(cfg),
    count_weekends_as_leave: cfg.count_weekends_as_leave === true || cfg.count_weekends_as_leave === 'TRUE',
  };
}

/** payload = { lineUserId, rule_id?, leave_type, advance_notice_days, max_consecutive_days, doc_required_above_days, note, is_active } */
function upsertRule(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const actor = findUserByLineId_(payload.lineUserId);

  // ADMIN (ไม่ใช่ OWNER) → ผ่าน Pending_Changes
  if (actor.role === ROLES.ADMIN) {
    const changeId = nextChangeId();
    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pending_Changes');
    sh.appendRow([
      changeId, actor.user_id, 'LeaveRules', payload.rule_id || '(new)',
      payload.rule_id ? 'update' : 'create',
      JSON.stringify(payload),
      nowBangkok(), 'pending', '', '', '',
    ]);
    audit(payload.lineUserId, 'propose_rule', 'Pending_Changes', changeId, payload);
    return { ok: true, mode: 'proposed', changeId: changeId };
  }

  // OWNER → apply ตรง
  return applyUpsertRule_(payload, actor);
}

function applyUpsertRule_(data, actor) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRules');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  if (data.rule_id) {
    // update
    if (sh.getLastRow() >= 2) {
      const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
      const iId = hdr.indexOf('rule_id');
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][iId] === data.rule_id) {
          const rowNum = i + 2;
          if (data.leave_type)               sh.getRange(rowNum, hdr.indexOf('leave_type') + 1).setValue(data.leave_type);
          if (isFinite(data.advance_notice_days))     sh.getRange(rowNum, hdr.indexOf('advance_notice_days') + 1).setValue(Number(data.advance_notice_days));
          if (isFinite(data.max_consecutive_days))    sh.getRange(rowNum, hdr.indexOf('max_consecutive_days') + 1).setValue(Number(data.max_consecutive_days));
          if (isFinite(data.doc_required_above_days)) sh.getRange(rowNum, hdr.indexOf('doc_required_above_days') + 1).setValue(Number(data.doc_required_above_days));
          if (data.note != null)             sh.getRange(rowNum, hdr.indexOf('note') + 1).setValue(data.note);
          if (data.is_active != null)        sh.getRange(rowNum, hdr.indexOf('is_active') + 1).setValue(!!data.is_active);
          if (data.allow_emergency != null && hdr.indexOf('allow_emergency') >= 0) {
            sh.getRange(rowNum, hdr.indexOf('allow_emergency') + 1).setValue(!!data.allow_emergency);
          }
          sh.getRange(rowNum, hdr.indexOf('updated_at') + 1).setValue(nowBangkok());
          sh.getRange(rowNum, hdr.indexOf('updated_by') + 1).setValue(actor ? actor.user_id : '');
          break;
        }
      }
    }
  } else {
    // create
    const newId = nextRuleId_();
    sh.appendRow([
      newId,
      data.leave_type || 'all',
      Number(data.advance_notice_days || 0),
      Number(data.max_consecutive_days || 0),
      Number(data.doc_required_above_days || 0),
      data.note || '',
      data.is_active === false ? false : true,
      nowBangkok(),
      actor ? actor.user_id : '',
      data.allow_emergency === false ? false : true,
    ]);
  }

  audit(actor && actor.line_user_id, 'upsert_rule', 'LeaveRules', data.rule_id || '(new)', data);
  return { ok: true, mode: 'applied' };
}

function nextRuleId_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRules');
  if (sh.getLastRow() < 2) return 'R-0001';
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  let maxN = 0;
  ids.forEach(function (row) {
    const m = String(row[0]).match(/^R-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return 'R-' + padLeft_(maxN + 1, 4);
}

/** หา rule ของประเภทลานี้ — ไม่มีก็ใช้ rule กลาง 'all' */
function findRuleFor_(leaveType) {
  const rules = (getRules().rules) || [];
  return rules.filter(function (r) { return r.leave_type === leaveType; })[0] ||
         rules.filter(function (r) { return r.leave_type === 'all'; })[0] ||
         null;
}

/** จำนวนวันที่ต้องแจ้งล่วงหน้าของประเภทลานี้ (หน้าจัดการแก้ได้ ไม่มีค่าตายในโค้ด) */
function advanceNoticeDaysFor_(leaveType) {
  const rule = findRuleFor_(leaveType);
  if (rule && rule.advance_notice_days !== '' && isFinite(Number(rule.advance_notice_days))) {
    return Number(rule.advance_notice_days);
  }
  const meta = LEAVE_TYPE_META[leaveType] || {};
  return Number(meta.advance || 0);
}

/** ประเภทนี้ยื่นไม่ทันแล้วติ๊ก "ฉุกเฉิน" เพื่อส่งต่อได้ไหม (default: ได้) */
function allowsEmergencyFor_(leaveType) {
  const rule = findRuleFor_(leaveType);
  if (!rule) return true;
  const v = rule.allow_emergency;
  if (v === '' || v === null || typeof v === 'undefined') return true;
  return !(v === false || v === 'FALSE' || v === 'false');
}

/**
 * ตรวจกำหนดแจ้งล่วงหน้า — จุดเดียวของทั้งระบบ
 *
 * ยื่นไม่ทัน ไม่ได้แปลว่าห้ามลา:
 *   ติ๊ก "เป็นกรณีฉุกเฉิน" + ระบุเหตุผล → ส่งได้ แล้วใบลาติดธงให้ผู้อนุมัติเห็นว่าเป็นเคสเร่งด่วน
 *   (เว้นแต่ประเภทนั้นตั้ง allow_emergency = FALSE ไว้)
 *
 * return { ok, emergency, advance_notice_days?, days_notice?, error?, message? }
 */
function checkAdvanceNotice_(leaveType, dateFrom, isEmergency, emergencyReason) {
  const advance = advanceNoticeDaysFor_(leaveType);
  if (advance <= 0) return { ok: true, emergency: false };

  const today0 = new Date(todayBangkok() + 'T00:00:00+07:00');
  const start0 = new Date(dateFrom + 'T00:00:00+07:00');
  const daysNotice = Math.floor((start0 - today0) / (24 * 3600 * 1000));
  if (daysNotice >= advance) return { ok: true, emergency: false };

  const meta = LEAVE_TYPE_META[leaveType] || {};
  const label = meta.label || leaveType;

  if (!allowsEmergencyFor_(leaveType)) {
    return { ok: false, error: 'advance_notice_violation',
      message: label + 'ต้องเขียนใบลาล่วงหน้าอย่างน้อย ' + advance + ' วัน' };
  }

  if (!(isEmergency === true || isEmergency === 'TRUE')) {
    return { ok: false, error: 'emergency_required',
      message: label + 'ต้องเขียนใบลาล่วงหน้าอย่างน้อย ' + advance + ' วัน — ถ้าจำเป็นเร่งด่วนจริง ให้ติ๊ก "เป็นกรณีฉุกเฉิน" แล้วระบุเหตุผล',
      advance_notice_days: advance, days_notice: daysNotice };
  }

  const minLen = Number(getConfig().emergency_reason_min || 10);
  if (String(emergencyReason || '').trim().length < minLen) {
    return { ok: false, error: 'emergency_reason_too_short',
      message: 'กรุณาระบุเหตุผลที่ต้องลาเร่งด่วน อย่างน้อย ' + minLen + ' ตัวอักษร',
      advance_notice_days: advance };
  }

  return { ok: true, emergency: true, advance_notice_days: advance, days_notice: daysNotice };
}

/**
 * validate ใบลาตาม rule ที่เหลือ (จำนวนวันติดกัน + เอกสารแนบ)
 * กำหนดแจ้งล่วงหน้าไม่อยู่ที่นี่แล้ว — ดู checkAdvanceNotice_
 */
function validateAgainstRules_(leaveType, dateFrom, dateTo, days, hasAttachment) {
  const rule = findRuleFor_(leaveType);
  if (!rule) return { ok: true };

  // max_consecutive_days
  const maxConsec = Number(rule.max_consecutive_days || 0);
  if (maxConsec > 0 && days > maxConsec) {
    return { ok: false, error: 'max_consecutive_violation',
      message: 'ลาประเภทนี้ลาติดกันได้สูงสุด ' + maxConsec + ' วัน' };
  }

  // doc_required_above_days
  const docAbove = Number(rule.doc_required_above_days || 0);
  if (docAbove > 0 && days >= docAbove && !hasAttachment) {
    return { ok: false, error: 'doc_required',
      message: 'ลา ' + days + ' วัน ต้องแนบเอกสาร (ใบรับรองแพทย์/ฯลฯ)' };
  }

  return { ok: true };
}
