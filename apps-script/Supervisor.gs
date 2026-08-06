/**
 * Supervisor.gs — ผูกหัวหน้างานกับพนักงาน (หน้าจัดการเดิม)
 *
 * ⚠️ ข้อมูลจริงย้ายไปอยู่ tab `Approvers` (ดู ApprovalChain.gs) แล้ว
 * ไฟล์นี้เหลือไว้เป็น "หน้าร้าน" ของ action เดิมที่ admin.html เรียกอยู่
 * ห้ามนิยาม getSupervisorFor ซ้ำที่นี่ — Apps Script รวมทุกไฟล์เป็น scope เดียว
 * ชื่อซ้ำจะทับกันเงียบ ๆ แล้วไล่บั๊กไม่เจอ
 *
 * Actions:
 *   - pairSupervisor(payload)        ผูกพนักงาน 1 คนกับหัวหน้างาน 1 คน
 *   - unpairSupervisor(payload)      ถอดหัวหน้างานออก
 *   - setSupervisorFlag(payload)     toggle is_supervisor บน Users
 *   - listSupervisorPairs(payload)   ดูคู่ที่ใช้อยู่ทั้งหมด
 */

/** payload = { lineUserId, user_id, supervisor_user_id } */
function pairSupervisor(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id || !payload.supervisor_user_id) return { ok: false, error: 'missing_fields' };

  const before = getSupervisorFor(payload.user_id);
  if (before === payload.supervisor_user_id) {
    return { ok: true, message: 'already_paired' };
  }

  const res = setApprovalChain({
    lineUserId: payload.lineUserId,
    user_id: payload.user_id,
    supervisor_user_id: payload.supervisor_user_id,
  });
  if (!res.ok) return res;

  audit(payload.lineUserId, 'supervisor_pair', 'Approvers', payload.user_id, {
    user_id: payload.user_id, supervisor_user_id: payload.supervisor_user_id,
  });
  return { ok: true };
}

/** payload = { lineUserId, user_id } — ถอดหัวหน้างานออก */
function unpairSupervisor(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const before = getSupervisorFor(payload.user_id);
  if (!before) return { ok: true, message: 'no_pair' };

  const res = setApprovalChain({
    lineUserId: payload.lineUserId,
    user_id: payload.user_id,
    supervisor_user_id: '',
  });
  if (!res.ok) return res;

  audit(payload.lineUserId, 'supervisor_unpair', 'Approvers', payload.user_id, { was: before });
  return { ok: true, unpaired: 1 };
}

/** payload = { lineUserId, user_id, is_supervisor: boolean } */
function setSupervisorFlag(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const user = findUserByUserId_(payload.user_id);
  if (!user) return { ok: false, error: 'user_not_found' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(user._rowNumber, hdr.indexOf('is_supervisor') + 1).setValue(!!payload.is_supervisor);

  audit(payload.lineUserId, 'set_supervisor_flag', 'Users', payload.user_id, { is_supervisor: !!payload.is_supervisor });
  return { ok: true };
}

/** payload = { lineUserId } — คู่หัวหน้างานที่ใช้อยู่ทั้งหมด */
function listSupervisorPairs(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const idx = loadUsersIndex_();
  const pairs = readApprovers_().rows
    .filter(function (r) { return !r.valid_to && Number(r.level) === APPROVER_LEVEL_SUPERVISOR; })
    .map(function (r) {
      const sub = idx.byId[r.user_id];
      const sup = idx.byId[r.approver_user_id];
      return {
        pair_id: r.chain_id,
        user_id: r.user_id,
        supervisor_user_id: r.approver_user_id,
        valid_from: r.valid_from,
        valid_to: r.valid_to,
        created_by: r.created_by,
        subordinate_name: sub ? sub.display_name : '',
        supervisor_name: sup ? sup.display_name : '',
      };
    });

  return { ok: true, pairs: pairs };
}
