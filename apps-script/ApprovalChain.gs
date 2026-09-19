/**
 * ApprovalChain.gs — ผังอำนาจอนุมัติ (ใครอนุมัติใบลาของใคร)
 *
 * เดิม: หัวหน้างานเก็บใน tab `Supervisors` (1 ต่อ 1) และผู้บริหาร "ทุกคน" เห็นใบลาทุกใบ
 * ใหม่: เก็บรวมใน tab `Approvers` — 1 แถว = ผู้อนุมัติ 1 คน ของพนักงาน 1 คน ในชั้นหนึ่ง
 *   level 1 = หัวหน้างาน   — พนักงาน 1 คนมีได้ 1 คน
 *   level 3 = ผู้บริหาร     — พนักงาน 1 คนมีได้หลายคน
 *   level 2 = HR            — ไม่เก็บที่นี่ HR ทุกคนเห็นทุกใบตามเดิม
 *
 * Actions (ผ่าน WebApp router):
 *   - getEmployeeDirectory(payload)  ฐานข้อมูลพนักงาน + หัวหน้า + ผู้บริหาร
 *   - getApprovalChain(payload)      ผังอำนาจของพนักงาน 1 คน (หรือทั้งหมด)
 *   - setApprovalChain(payload)      ตั้งหัวหน้า + ผู้บริหาร (หลายคน) ให้พนักงาน 1 คน
 *   - getMyOrgLine(payload)          "สายงานของฉัน" — ผู้บริหาร/หัวหน้าดูว่าใครอยู่ใต้ตัวเอง
 *
 * Helper ที่ระบบอื่นเรียก:
 *   - getSupervisorFor(userId)       → user_id ของหัวหน้างาน หรือ null
 *   - getExecutivesFor(userId)       → { users, fallback } ผู้บริหารที่ต้องอนุมัติชั้น 3
 */

const APPROVER_LEVEL_SUPERVISOR = 1;
const APPROVER_LEVEL_EXECUTIVE = 3;

// ========== primitives ==========

function approversSheet_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Approvers');
  if (!sh) throw new Error('ยังไม่มี tab Approvers — รัน setupDatabase() ก่อน');
  return sh;
}

function nextChainId_() {
  const sh = approversSheet_();
  const last = sh.getLastRow();
  if (last < 2) return 'APV-0001';
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let maxN = 0;
  ids.forEach(function (row) {
    const m = String(row[0]).match(/^APV-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return 'APV-' + padLeft_(maxN + 1, 4);
}

/** อ่านทุกแถวใน Approvers เป็น object + _rowNumber */
function readApprovers_() {
  const sh = approversSheet_();
  if (sh.getLastRow() < 2) return { rows: [], hdr: sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], sh: sh };
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const rows = data.map(function (r, i) {
    const obj = {};
    hdr.forEach(function (h, j) { obj[h] = r[j]; });
    obj._rowNumber = i + 2;
    return obj;
  });
  return { rows: rows, hdr: hdr, sh: sh };
}

/** แถวที่ยังใช้อยู่ (valid_to ว่าง) ของพนักงานคนนี้ ในชั้นที่ระบุ */
function listActiveApprovers_(userId, level) {
  if (!userId) return [];
  return readApprovers_().rows
    .filter(function (r) {
      return r.user_id === userId && Number(r.level) === Number(level) && !r.valid_to;
    })
    .map(function (r) { return r.approver_user_id; });
}

/**
 * index ของ Users อ่านครั้งเดียว — กันการวน findUserByUserId_ ทีละคน (ช้ามากเมื่อคนเยอะ)
 * return { byId, byLine, list }
 */
function loadUsersIndex_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const out = { byId: {}, byLine: {}, list: [] };
  if (sh.getLastRow() < 2) return out;

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  data.forEach(function (r, i) {
    const obj = {};
    hdr.forEach(function (h, j) { obj[h] = r[j]; });
    obj._rowNumber = i + 2;
    out.list.push(obj);
    if (obj.user_id) out.byId[obj.user_id] = obj;
    if (obj.line_user_id) out.byLine[obj.line_user_id] = obj;
  });
  return out;
}

// ========== helper ที่ระบบอื่นเรียก ==========

/**
 * หัวหน้างานของพนักงานคนนี้ (active) — return user_id หรือ null
 * อ่านจาก tab Approvers (ย้ายมาจาก Supervisor.gs)
 */
function getSupervisorFor(userId) {
  const ids = listActiveApprovers_(userId, APPROVER_LEVEL_SUPERVISOR);
  if (!ids.length) return null;
  // กติกา 1 ต่อ 1 — ถ้ามีหลายแถวค้าง ใช้ตัวแรกและเตือนไว้ใน log
  if (ids.length > 1) {
    logWarn('getSupervisorFor', 'พบหัวหน้างานค้างมากกว่า 1 คน', { userId: userId, count: ids.length });
  }
  return ids[0];
}

/**
 * ผู้บริหารที่ต้องอนุมัติชั้น 3 ของพนักงานคนนี้
 *
 * ถ้ายังไม่เคยผูกสายงานไว้ → คืนผู้บริหารทุกคน + fallback=true
 * (จงใจ: ไม่ผูกสาย ไม่ควรแปลว่าใบลาค้างตายไม่มีใครอนุมัติได้ — แต่ต้องเห็นใน log ว่ายังไม่ได้ตั้ง)
 *
 * return { users: [userRow], fallback: boolean }
 */
function getExecutivesFor(userId, usersIndex) {
  const idx = usersIndex || loadUsersIndex_();
  const ids = listActiveApprovers_(userId, APPROVER_LEVEL_EXECUTIVE);
  return executiveRouteFrom_(ids, idx, userId);
}

/**
 * ตัดสินเส้นทางชั้นผู้บริหาร จากรายชื่อผู้บริหารที่ผูกไว้ในสาย
 *
 *   ผูกไว้ + มีคนรับได้จริง (active · ผู้บริหาร · ผูกไลน์แล้ว) → ส่งเฉพาะคนในสาย
 *   ผูกไว้ แต่ไม่มีใครรับได้ (ยังไม่ผูกไลน์/ลาออก)           → ส่ง HR แทน (hrFallback)
 *   ไม่เคยผูกสายเลย                                          → ผู้บริหารทุกคน (กันใบค้างตาย)
 *
 * ⭐ เดิมกรณี "ผูกไว้แต่รับไม่ได้" โยนให้ผู้บริหารทุกคน → ใบลาแผนกที่ผูกกับคุณสุรศักดิ์
 *    ไปโผล่ที่ผู้บริหารคนอื่นที่ไม่เกี่ยว (ลูกค้าแจ้ง 19 ก.ย. 69) — ตอนนี้ให้ HR รับแทน
 *
 * return { users, fallback, hrFallback }
 */
function executiveRouteFrom_(ids, idx, userIdForLog) {
  const reachable = function (u) {
    return u && u.status === 'active' && u.role === ROLES.OWNER && !!u.line_user_id;
  };
  const linked = (ids || []).map(function (id) { return idx.byId[id]; }).filter(reachable);
  if (linked.length) return { users: linked, fallback: false, hrFallback: false };

  if (ids && ids.length) {
    if (userIdForLog) {
      logWarn('getExecutivesFor', 'ผู้บริหารในสายยังรับใบไม่ได้ (ยังไม่ผูกไลน์/ปิดบัญชี) — ส่ง HR แทน',
        { userId: userIdForLog, linkedIds: ids });
    }
    return { users: [], fallback: true, hrFallback: true };
  }

  const all = idx.list.filter(reachable);
  return { users: all, fallback: true, hrFallback: all.length === 0 };
}

/**
 * หัวหน้างานที่ "รับใบลาได้จริง" — ต้อง active และผูก LINE ไว้
 * ลาออก/ปิดบัญชี/ยังไม่ผูกไลน์ → คืน null เพื่อให้ใบลาข้ามไปให้ HR แทนที่จะค้างตาย
 */
function resolveStage1Approver_(userId, usersIndex) {
  const supId = getSupervisorFor(userId);
  if (!supId) return null;
  const idx = usersIndex || loadUsersIndex_();
  const sup = idx.byId[supId];
  if (!sup || sup.status !== 'active') {
    logWarn('resolveStage1Approver_', 'หัวหน้างานที่ผูกไว้ใช้งานไม่ได้ — ข้ามไปชั้น HR',
      { userId: userId, supervisorUserId: supId });
    return null;
  }
  return sup;
}

/**
 * ปิดแถวผังอำนาจที่คนนี้เป็น "ผู้อนุมัติ" — ใช้ตอนลดระดับ (ไม่ใช่หัวหน้า/ผู้บริหารแล้ว)
 * level ว่าง = ปิดทุกชั้น
 */
function invalidateApproverLinksOf_(approverUserId, level) {
  if (!approverUserId) return 0;
  const state = readApprovers_();
  const iValidTo = state.hdr.indexOf('valid_to');
  const now = nowBangkok();
  let count = 0;
  state.rows.forEach(function (r) {
    if (r.approver_user_id !== approverUserId || r.valid_to) return;
    if (level != null && Number(r.level) !== Number(level)) return;
    state.sh.getRange(r._rowNumber, iValidTo + 1).setValue(now);
    count++;
  });
  if (count) {
    logInfo('invalidateApproverLinksOf_', 'ปิดสายอนุมัติ ' + count + ' แถว',
      { approverUserId: approverUserId, level: level == null ? 'ทุกชั้น' : level });
  }
  return count;
}

/** ผู้บริหารคนนี้มีสิทธิ์อนุมัติใบลาของพนักงานคนนี้ไหม */
function isExecutiveOf_(approverUserId, requesterUserId, usersIndex) {
  const res = getExecutivesFor(requesterUserId, usersIndex);
  return res.users.some(function (u) { return u.user_id === approverUserId; });
}

// ========== endpoints ==========

/**
 * payload = { lineUserId, include_inactive? }
 * ฐานข้อมูลพนักงาน: รหัส / ชื่อ / หัวหน้างาน / ผู้บริหาร (หลายคน)
 */
function getEmployeeDirectory(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

  const idx = loadUsersIndex_();
  const chain = readApprovers_().rows.filter(function (r) { return !r.valid_to; });

  const supOf = {};
  const execOf = {};
  chain.forEach(function (r) {
    if (Number(r.level) === APPROVER_LEVEL_SUPERVISOR) {
      supOf[r.user_id] = r.approver_user_id;
    } else if (Number(r.level) === APPROVER_LEVEL_EXECUTIVE) {
      if (!execOf[r.user_id]) execOf[r.user_id] = [];
      execOf[r.user_id].push(r.approver_user_id);
    }
  });

  const nameOf = function (id) {
    const u = idx.byId[id];
    return u ? (u.display_name || id) : '';
  };

  // ⭐ ซ่อนเฉพาะบัญชีที่ "ปิด" เท่านั้น — invited/pending คือพนักงานจริงที่ยังรอพาเข้าระบบ
  //    เดิมกรอง status==='active' ทำให้คนที่นำเข้ามาทั้งบริษัทหายจากหน้าจอ
  //    รวมถึงปุ่มออกรหัสจับคู่ = ไม่มีทางพาใครเข้าระบบได้เลย
  const includeInactive = payload.include_inactive === true;
  const employees = idx.list
    .filter(function (u) { return includeInactive || u.status !== 'inactive'; })
    .map(function (u) {
      const execIds = execOf[u.user_id] || [];
      return {
        user_id: u.user_id,
        emp_code: u.emp_code || '',
        display_name: u.display_name || '',
        department: u.department || '',
        position: u.position || '',
        role: u.role,
        role_label: getRoleLabelTh(u.role, { isSupervisor: isSupervisorUser_(u) }),
        is_supervisor: isSupervisorUser_(u),
        status: u.status,
        has_line: !!u.line_user_id,
        supervisor_user_id: supOf[u.user_id] || '',
        supervisor_name: supOf[u.user_id] ? nameOf(supOf[u.user_id]) : '',
        executive_user_ids: execIds,
        executive_names: execIds.map(nameOf),
      };
    })
    .sort(function (a, b) { return String(a.user_id).localeCompare(String(b.user_id)); });

  // ตัวเลือกสำหรับ dropdown ในหน้าจอ
  const supervisorOptions = idx.list
    .filter(function (u) { return u.status !== 'inactive' && (isSupervisorUser_(u) || hasRole(u.role, ROLES.SUPERVISOR)); })
    .map(function (u) { return { user_id: u.user_id, display_name: u.display_name, role_label: getRoleLabelTh(u.role) }; });

  const executiveOptions = idx.list
    .filter(function (u) { return u.status !== 'inactive' && u.role === ROLES.OWNER; })
    .map(function (u) { return { user_id: u.user_id, display_name: u.display_name, role_label: getRoleLabelTh(u.role) }; });

  return {
    ok: true,
    employees: employees,
    supervisor_options: supervisorOptions,
    executive_options: executiveOptions,
  };
}

/** payload = { lineUserId, user_id } — ผังอำนาจของพนักงาน 1 คน */
function getApprovalChain(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const idx = loadUsersIndex_();
  const target = idx.byId[payload.user_id];
  if (!target) return { ok: false, error: 'user_not_found' };

  const supId = getSupervisorFor(payload.user_id);
  const execIds = listActiveApprovers_(payload.user_id, APPROVER_LEVEL_EXECUTIVE);

  return {
    ok: true,
    user_id: target.user_id,
    display_name: target.display_name,
    role: target.role,
    supervisor_user_id: supId || '',
    executive_user_ids: execIds,
  };
}

/**
 * payload = { lineUserId, user_id, supervisor_user_id?, executive_user_ids?: [] }
 *
 * ตั้งผังอำนาจให้พนักงาน 1 คน — ส่งมาเท่าไหร่คือ "ชุดใหม่ทั้งชุด"
 *   supervisor_user_id = '' → ถอดหัวหน้างานออก
 *   executive_user_ids = [] → ถอดผู้บริหารออกทั้งหมด
 *   ไม่ส่ง key มาเลย       → ไม่แตะชั้นนั้น
 */
function setApprovalChain(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const idx = loadUsersIndex_();
  const target = idx.byId[payload.user_id];
  if (!target) return { ok: false, error: 'user_not_found' };

  const actor = idx.byLine[payload.lineUserId];
  const touchSupervisor = Object.prototype.hasOwnProperty.call(payload, 'supervisor_user_id');
  const touchExecutives = Object.prototype.hasOwnProperty.call(payload, 'executive_user_ids');

  // === ตรวจก่อนแตะข้อมูล ===
  const supId = touchSupervisor ? String(payload.supervisor_user_id || '') : null;
  if (supId) {
    if (supId === payload.user_id) {
      return { ok: false, error: 'self_pair_not_allowed', message: 'ตั้งตัวเองเป็นหัวหน้างานของตัวเองไม่ได้' };
    }
    const sup = idx.byId[supId];
    if (!sup) return { ok: false, error: 'supervisor_not_found', message: 'ไม่พบพนักงานที่จะตั้งเป็นหัวหน้างาน' };
    // ตั้งหัวหน้าที่ยังไม่ผูกไลน์ได้ (คนที่เพิ่งนำเข้า) — ตอนมีใบลาจริง resolveStage1Approver_
    // จะข้ามไปให้ HR เองถ้าหัวหน้ายังใช้งานไม่ได้ ห้ามเฉพาะบัญชีที่ "ปิด" เท่านั้น
    if (sup.status === 'inactive') {
      return { ok: false, error: 'supervisor_inactive', message: 'คนที่จะตั้งเป็นหัวหน้างานถูกปิดบัญชีอยู่' };
    }
  }

  let execIds = [];
  if (touchExecutives) {
    execIds = (payload.executive_user_ids || []).map(String).filter(function (v) { return !!v; });
    // กันซ้ำ
    execIds = execIds.filter(function (v, i) { return execIds.indexOf(v) === i; });
    for (let i = 0; i < execIds.length; i++) {
      const ex = idx.byId[execIds[i]];
      if (!ex) return { ok: false, error: 'executive_not_found', message: 'ไม่พบผู้บริหารรหัส ' + execIds[i] };
      if (ex.status === 'inactive') {
        return { ok: false, error: 'executive_inactive', message: (ex.display_name || execIds[i]) + ' ถูกปิดบัญชีอยู่' };
      }
      // ต้องเป็นผู้บริหารจริง ไม่งั้นตั้งไว้แล้วกดอนุมัติไม่ได้ (ด่านชั้น 3 เช็ค role)
      if (ex.role !== ROLES.OWNER) {
        return { ok: false, error: 'executive_wrong_role',
          message: (ex.display_name || execIds[i]) + ' ยังไม่ใช่ระดับผู้บริหาร — ตั้งระดับให้ก่อนที่หน้าจัดการพนักงาน' };
      }
      if (execIds[i] === payload.user_id) {
        return { ok: false, error: 'self_pair_not_allowed', message: 'ตั้งตัวเองเป็นผู้บริหารของตัวเองไม่ได้' };
      }
    }
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { ok: false, error: 'lock_failed', message: 'ระบบกำลังประมวลผล กรุณาลองอีกครั้ง' }; }

  try {
    const now = nowBangkok();
    const state = readApprovers_();
    const iValidTo = state.hdr.indexOf('valid_to');
    const createdBy = actor ? actor.user_id : '(system)';
    let added = 0;
    let removed = 0;

    const applyLevel = function (level, wantedIds) {
      const current = state.rows.filter(function (r) {
        return r.user_id === payload.user_id && Number(r.level) === level && !r.valid_to;
      });
      const currentIds = current.map(function (r) { return r.approver_user_id; });

      // ปิดแถวที่ไม่อยู่ในชุดใหม่
      current.forEach(function (r) {
        if (wantedIds.indexOf(r.approver_user_id) < 0) {
          state.sh.getRange(r._rowNumber, iValidTo + 1).setValue(now);
          removed++;
        }
      });

      // เพิ่มแถวที่ยังไม่มี
      wantedIds.forEach(function (id) {
        if (currentIds.indexOf(id) >= 0) return;
        state.sh.appendRow([nextChainId_(), payload.user_id, id, level, now, '', createdBy]);
        added++;
      });
    };

    if (touchSupervisor) applyLevel(APPROVER_LEVEL_SUPERVISOR, supId ? [supId] : []);
    if (touchExecutives) applyLevel(APPROVER_LEVEL_EXECUTIVE, execIds);

    // คนที่ถูกตั้งเป็นหัวหน้างาน ต้องมีธง is_supervisor ไม่งั้นหน้า "อนุมัติ" ของเขาจะว่าง
    if (touchSupervisor && supId) {
      const sup = idx.byId[supId];
      if (!isSupervisorUser_(sup)) {
        const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
        const ush = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
        const uhdr = ush.getRange(1, 1, 1, ush.getLastColumn()).getValues()[0];
        ush.getRange(sup._rowNumber, uhdr.indexOf('is_supervisor') + 1).setValue(true);
      }
    }

    if (touchSupervisor) rerouteOwnerFirstLeaves_(payload.user_id);

    audit(payload.lineUserId, 'set_approval_chain', 'Approvers', payload.user_id, {
      supervisor_user_id: touchSupervisor ? supId : '(ไม่แตะ)',
      executive_user_ids: touchExecutives ? execIds : '(ไม่แตะ)',
    });
    logInfo('setApprovalChain', 'updated', { userId: payload.user_id, added: added, removed: removed });

    // แจ้งพนักงานว่าใบลาของเขาจะวิ่งไปหาใคร
    try {
      if (target.line_user_id) {
        const supUser = supId ? idx.byId[supId] : null;
        const execUsers = execIds.map(function (id) { return idx.byId[id]; }).filter(Boolean);
        pushMessage(target.line_user_id, buildApprovalChainSetCard(target, supUser, execUsers));
      }
    } catch (e) {
      logWarn('setApprovalChain', 'push notify failed: ' + e.message);
    }

    return { ok: true, added: added, removed: removed };
  } finally {
    lock.releaseLock();
  }
}

/**
 * payload = { lineUserId }
 * "สายงานของฉัน" — ผู้บริหารเห็นพนักงานที่ตัวเองอนุมัติ, หัวหน้างานเห็นลูกน้อง
 */
function getMyOrgLine(payload) {
  payload = payload || {};
  if (!isUser(payload.lineUserId)) return { ok: false, error: 'not_registered' };

  const idx = loadUsersIndex_();
  const me = idx.byLine[payload.lineUserId];
  if (!me) return { ok: false, error: 'user_not_found' };

  const chain = readApprovers_().rows.filter(function (r) { return !r.valid_to; });

  const supOf = {};
  const execOf = {};
  chain.forEach(function (r) {
    if (Number(r.level) === APPROVER_LEVEL_SUPERVISOR) supOf[r.user_id] = r.approver_user_id;
    else if (Number(r.level) === APPROVER_LEVEL_EXECUTIVE) {
      if (!execOf[r.user_id]) execOf[r.user_id] = [];
      execOf[r.user_id].push(r.approver_user_id);
    }
  });

  const asSupervisor = [];
  const asExecutive = [];
  idx.list.forEach(function (u) {
    if (u.status !== 'active') return;
    if (supOf[u.user_id] === me.user_id) asSupervisor.push(u);
    if ((execOf[u.user_id] || []).indexOf(me.user_id) >= 0) asExecutive.push(u);
  });

  const shape = function (u) {
    const supId = supOf[u.user_id];
    return {
      user_id: u.user_id,
      display_name: u.display_name,
      department: u.department || '',
      position: u.position || '',
      role_label: getRoleLabelTh(u.role, { isSupervisor: isSupervisorUser_(u) }),
      supervisor_name: supId && idx.byId[supId] ? idx.byId[supId].display_name : '',
    };
  };

  // ผู้บริหารที่ยังไม่ถูกผูกสายเลย จะรับใบลาของ "ทุกคนที่ไม่มีสายผูกไว้" ตาม fallback
  const unassigned = me.role === ROLES.OWNER
    ? idx.list.filter(function (u) {
        return u.status === 'active' && !(execOf[u.user_id] || []).length;
      }).map(shape)
    : [];

  return {
    ok: true,
    me: { user_id: me.user_id, display_name: me.display_name, role: me.role,
          role_label: getRoleLabelTh(me.role, { isSupervisor: isSupervisorUser_(me) }) },
    as_supervisor: asSupervisor.map(shape),
    as_executive: asExecutive.map(shape),
    unassigned: unassigned,
  };
}

// ========== migration ==========

/**
 * ย้ายคู่หัวหน้างานที่ยังใช้อยู่จาก tab `Supervisors` → `Approvers` level 1
 * รันซ้ำได้ — ข้ามคู่ที่ย้ายแล้ว
 */
function migrateSupervisorsToApprovers_(ss) {
  const shOld = ss.getSheetByName('Supervisors');
  const shNew = ss.getSheetByName('Approvers');
  if (!shOld || !shNew || shOld.getLastRow() < 2) return;

  const oHdr = shOld.getRange(1, 1, 1, shOld.getLastColumn()).getValues()[0];
  const iUser = oHdr.indexOf('user_id');
  const iSup = oHdr.indexOf('supervisor_user_id');
  const iValidFrom = oHdr.indexOf('valid_from');
  const iValidTo = oHdr.indexOf('valid_to');
  const iBy = oHdr.indexOf('created_by');
  const oldRows = shOld.getRange(2, 1, shOld.getLastRow() - 1, shOld.getLastColumn()).getValues();

  // คู่ที่มีอยู่แล้วใน Approvers
  const existing = {};
  if (shNew.getLastRow() >= 2) {
    const nHdr = shNew.getRange(1, 1, 1, shNew.getLastColumn()).getValues()[0];
    const nUser = nHdr.indexOf('user_id');
    const nApr = nHdr.indexOf('approver_user_id');
    const nLvl = nHdr.indexOf('level');
    const nTo = nHdr.indexOf('valid_to');
    shNew.getRange(2, 1, shNew.getLastRow() - 1, shNew.getLastColumn()).getValues().forEach(function (r) {
      if (!r[nTo] && Number(r[nLvl]) === APPROVER_LEVEL_SUPERVISOR) {
        existing[r[nUser] + '|' + r[nApr]] = true;
      }
    });
  }

  let seq = shNew.getLastRow() >= 2 ? shNew.getLastRow() - 1 : 0;
  let moved = 0;
  oldRows.forEach(function (r) {
    if (r[iValidTo]) return;                       // คู่ที่เลิกใช้แล้ว ไม่ต้องย้าย
    if (!r[iUser] || !r[iSup]) return;
    const key = r[iUser] + '|' + r[iSup];
    if (existing[key]) return;
    seq++;
    shNew.appendRow([
      'APV-' + padLeft_(seq, 4),
      r[iUser], r[iSup], APPROVER_LEVEL_SUPERVISOR,
      r[iValidFrom] || nowBangkok(), '', r[iBy] || '(migrate)',
    ]);
    existing[key] = true;
    moved++;
  });

  if (moved) console.log('✓ ย้ายคู่หัวหน้างานเดิมเข้าผังอำนาจอนุมัติ ' + moved + ' คู่');
}

/**
 * เปลี่ยนหัวหน้างานกลางทาง: ใบแบบ "ผู้บริหารก่อน" ที่ยังค้างชั้น 1 แต่หัวหน้าคนใหม่ไม่ใช่ผู้บริหาร
 * → เปิดชั้น HR + ผู้บริหารกลับมาเป็นสายปกติ (หัวหน้าใหม่ → HR → ผู้บริหาร)
 * ไม่งั้นใบค้างถาวร: ผู้บริหารคนเดิมกดไม่ได้เพราะไม่ใช่หัวหน้าแล้ว หัวหน้าใหม่กดไม่ได้เพราะไม่ใช่ผู้บริหาร
 */
function rerouteOwnerFirstLeaves_(userId) {
  const newSupId = getSupervisorFor(userId);
  const newSup = newSupId ? findUserByUserId_(newSupId) : null;
  if (newSup && newSup.role === ROLES.OWNER) return 0;
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (!sh || sh.getLastRow() < 2) return 0;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  let n = 0;
  data.forEach(function (r, i) {
    const o = {};
    hdr.forEach(function (h, j) { o[h] = r[j]; });
    if (o.user_id !== userId || o.final_status !== 'pending') return;
    if (!(o.stage1_status === 'pending' && o.stage2_status === 'skipped' && o.stage3_status === 'skipped')) return;
    updateRowByHeader_(sh, i + 2, {
      stage1_status: newSup ? 'pending' : 'skipped',
      stage2_status: 'pending', stage2_at: '',
      stage3_status: 'pending', stage3_at: '',
    });
    n++;
  });
  if (n) logInfo('rerouteOwnerFirstLeaves_', 'ใบแบบผู้บริหารก่อน ' + n + ' ใบ กลับเป็นสายปกติ', { userId: userId });
  return n;
}
