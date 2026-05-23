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

  return {
    ok: true,
    quota: quotaRes.quota,
    rules: rulesRes.rules,
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

/** validate ใบลาตาม rule + return { ok, error?, warning? } */
function validateAgainstRules_(leaveType, dateFrom, dateTo, days, hasAttachment) {
  const rulesRes = getRules();
  const rules = rulesRes.rules || [];
  // หา rule ของ leaveType ก่อน fallback to 'all'
  const rule = rules.filter(function (r) { return r.leave_type === leaveType; })[0] ||
               rules.filter(function (r) { return r.leave_type === 'all'; })[0];
  if (!rule) return { ok: true };

  // advance_notice_days
  const advance = Number(rule.advance_notice_days || 0);
  if (advance > 0) {
    const today = new Date(todayBangkok() + 'T00:00:00+07:00');
    const start = new Date(dateFrom + 'T00:00:00+07:00');
    const diffDays = Math.floor((start - today) / (24 * 3600 * 1000));
    if (diffDays < advance) {
      // อนุญาตยังไง: sick ลาย้อนหลังได้ — backend ตรวจอีกชั้นใน LeaveRequest
      // ที่นี่แค่ enforce กฎ advance สำหรับ personal/vacation
      if (leaveType !== 'sick') {
        return { ok: false, error: 'advance_notice_violation',
          message: 'ลาประเภทนี้ต้องแจ้งล่วงหน้าอย่างน้อย ' + advance + ' วัน' };
      }
    }
  }

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
