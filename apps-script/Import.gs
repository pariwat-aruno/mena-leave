/**
 * Import.gs — นำเข้าทะเบียนพนักงานทั้งบริษัทจากไฟล์ของลูกค้า + ออกรหัสจับคู่ให้คนที่นำเข้ามา
 *
 * Actions:
 *   - importEmployees(payload)   นำเข้า/อัปเดตพนักงาน + ผังอำนาจอนุมัติ (OWNER เท่านั้น)
 *   - issuePairingCode(payload)  ออกรหัสจับคู่ใหม่ให้ "คนที่มีแถวอยู่แล้ว" (ADMIN+)
 *
 * ⭐ กติกาที่ยึดไว้
 *   1. จับคู่ด้วย emp_code ที่ normalize เป็นสตริงเสมอ — Sheet เก็บ 6818 เป็นตัวเลข
 *      เทียบ '6818' กับ 6818 ตรง ๆ จะไม่แมตช์ แล้วได้พนักงานซ้ำ 2 แถว
 *   2. dry_run เป็นค่าตั้งต้น — ต้องส่ง dry_run:false มาถึงจะเขียนจริง (พรีวิวก่อนบันทึกเสมอ)
 *   3. รันซ้ำได้ ผลเหมือนเดิม (idempotent) — รอบสองต้องไม่มีอะไรเปลี่ยน
 *   4. ห้ามแตะ line_user_id / status ของคนที่มีอยู่แล้ว — คนที่ผูกไลน์ใช้งานอยู่ต้องไม่หลุด
 *   5. ไม่ออกรหัสจับคู่ตอนนำเข้า — รหัสอายุ 24 ชม. ออกให้ 57 คนพร้อมกัน = ตายก่อนได้ใช้
 *      ให้ HR กดออกรหัสรายคนตอนพาเข้าระบบจริงแทน (issuePairingCode)
 */

/** emp_code ให้เป็นสตริงเสมอ — ตัวเลขจาก Sheet กับสตริงจาก JSON ต้องเทียบกันได้ */
function normEmpCode_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(Math.round(v) === v ? Math.round(v) : v).trim();
  return String(v).trim();
}

function importEmployees(payload) {
  payload = payload || {};

  const actor = findUserByLineId_(payload.lineUserId);
  if (!actor || actor.status !== 'active' || actor.role !== ROLES.OWNER) {
    return { ok: false, error: 'forbidden', message: 'เฉพาะผู้บริหารเท่านั้นที่นำเข้าทะเบียนพนักงานได้' };
  }

  const inRows = payload.rows || [];
  if (!inRows.length) return { ok: false, error: 'no_rows', message: 'ไม่มีข้อมูลให้นำเข้า' };

  const dryRun = payload.dry_run !== false;   // ต้องสั่ง false ชัด ๆ ถึงจะเขียนจริง
  const problems = [];

  // ========== 1) อ่านของเดิมครั้งเดียว ==========
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ush = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const uhdr = ush.getRange(1, 1, 1, ush.getLastColumn()).getValues()[0];
  const existing = [];
  const byCode = {};
  if (ush.getLastRow() >= 2) {
    const data = ush.getRange(2, 1, ush.getLastRow() - 1, ush.getLastColumn()).getValues();
    data.forEach(function (r, i) {
      const o = {};
      uhdr.forEach(function (h, j) { o[h] = r[j]; });
      o._rowNumber = i + 2;
      existing.push(o);
      const code = normEmpCode_(o.emp_code);
      if (!code) return;
      if (byCode[code]) {
        problems.push('รหัส ' + code + ' ซ้ำในระบบเดิม (' + byCode[code].user_id + ' และ ' + o.user_id + ') — ใช้แถวแรก');
        return;
      }
      byCode[code] = o;
    });
  }

  // running number ของ user_id — คำนวณครั้งเดียว ห้ามเรียก nextUserId() ในลูป (อ่าน sheet ซ้ำ 57 รอบ)
  let maxN = 0;
  existing.forEach(function (o) {
    const m = String(o.user_id).match(/^EMP-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
  });

  // ========== 2) ตัดสินทีละแถว: สร้างใหม่ / แก้ / ไม่เปลี่ยน ==========
  const plan = [];
  const codeToUserId = {};
  Object.keys(byCode).forEach(function (c) { codeToUserId[c] = byCode[c].user_id; });

  const seen = {};
  inRows.forEach(function (r, i) {
    const code = normEmpCode_(r.emp_code);
    const name = String(r.display_name || '').trim();
    if (!code || !name) { problems.push('แถวที่ ' + (i + 1) + ' ไม่มีรหัสหรือชื่อ — ข้าม'); return; }
    if (seen[code]) { problems.push('รหัส ' + code + ' ซ้ำในไฟล์นำเข้า — ใช้แถวแรก'); return; }
    seen[code] = true;

    const role = r.role || ROLES.USER;
    if (ASSIGNABLE_ROLES.indexOf(role) < 0) { problems.push('รหัส ' + code + ': ระดับ "' + role + '" ไม่ถูกต้อง — ข้าม'); return; }

    const cur = byCode[code];
    if (cur) {
      const changes = {};
      if (String(cur.display_name || '').trim() !== name) changes.display_name = name;
      if (String(cur.position || '') !== String(r.position || '')) changes.position = r.position || '';
      if (String(cur.department || '') !== String(r.department || '')) changes.department = r.department || '';
      if (cur.role !== role) changes.role = role;
      plan.push({ code: code, name: name, action: Object.keys(changes).length ? 'update' : 'same',
                  user_id: cur.user_id, row: cur._rowNumber, changes: changes, src: r });
    } else {
      maxN++;
      const uid = 'EMP-' + padLeft_(maxN, 4);
      codeToUserId[code] = uid;
      plan.push({ code: code, name: name, action: 'create', user_id: uid, changes: {}, src: r });
    }
  });

  // ========== 3) แปลงรหัสพนักงาน → user_id ในผังอำนาจ + เก็บว่าใครต้องเป็นหัวหน้า ==========
  const chainWanted = {};       // user_id → { sup: user_id|'', execs: [user_id] }
  const needSupFlag = {};       // user_id ที่ถูกใช้เป็นผู้อนุมัติขั้น 1 (ต้องติดธง is_supervisor)
  plan.forEach(function (p) {
    const supCode = normEmpCode_(p.src.supervisor_emp_code);
    const execCodes = (p.src.executive_emp_codes || []).map(normEmpCode_).filter(Boolean);

    let supId = '';
    if (supCode) {
      supId = codeToUserId[supCode] || '';
      if (!supId) problems.push(p.code + ' (' + p.name + '): ไม่พบหัวหน้ารหัส ' + supCode + ' — เว้นสายชั้น 1 ไว้');
      else if (supId === p.user_id) { problems.push(p.code + ': ตั้งตัวเองเป็นหัวหน้าตัวเองไม่ได้ — เว้นไว้'); supId = ''; }
    }

    const execIds = [];
    execCodes.forEach(function (c) {
      const id = codeToUserId[c];
      if (!id) { problems.push(p.code + ': ไม่พบผู้บริหารรหัส ' + c + ' — ข้าม'); return; }
      if (id === p.user_id) return;                       // ผู้บริหารไม่ต้องเป็นผู้บริหารของตัวเอง
      if (execIds.indexOf(id) < 0) execIds.push(id);
    });

    chainWanted[p.user_id] = { sup: supId, execs: execIds };
    // ⭐ getPendingForMe กรองชั้น 1 ด้วย isSupervisorUser_() — ผู้อนุมัติขั้น 1 ที่ไม่มีธงนี้
    //    จะไม่เห็นใบลาลูกทีมตัวเองเลย ใบค้างเงียบจนกว่าตัวเตือนจะไปโผล่ที่ HR
    if (supId) needSupFlag[supId] = true;
  });

  // คนที่ต้องไล่ติดธงหัวหน้าเพิ่ม — เฉพาะ "แถวที่มีอยู่แล้ว" เท่านั้น
  // คนที่เพิ่งสร้างในรอบนี้ติดธงไปตั้งแต่ตอนสร้างแถว (ข้อ 5.1) จึงไม่ต้องนับซ้ำที่นี่
  // ไม่งั้นเลขในรายงานจะบอกว่าแก้ 2 แถว ทั้งที่ไม่ได้แตะแถวไหนเลย
  const flagPlan = [];
  Object.keys(needSupFlag).forEach(function (uid) {
    const cur = existing.filter(function (o) { return o.user_id === uid; })[0];
    if (!cur) return;                            // คนใหม่ — ติดธงตอนสร้าง
    const p = plan.filter(function (x) { return x.user_id === uid; })[0];
    const roleAfter = p ? (p.src.role || ROLES.USER) : cur.role;
    if (roleAfter === ROLES.SUPERVISOR) return;  // role SUPERVISOR → ติดธงตอนแก้ role อยู่แล้ว
    if (cur.is_supervisor === true || cur.is_supervisor === 'TRUE') return;
    flagPlan.push(uid);
  });

  // ========== 4) เทียบผังอำนาจเดิม ==========
  const state = readApprovers_();
  const liveByUser = {};
  state.rows.forEach(function (r) {
    if (r.valid_to) return;
    const k = String(r.user_id);
    if (!liveByUser[k]) liveByUser[k] = [];
    liveByUser[k].push(r);
  });

  const chainClose = [];   // แถวที่ต้องปิด
  const chainAdd = [];     // แถวที่ต้องเพิ่ม
  Object.keys(chainWanted).forEach(function (uid) {
    const want = chainWanted[uid];
    const live = liveByUser[uid] || [];
    [[APPROVER_LEVEL_SUPERVISOR, want.sup ? [want.sup] : []],
     [APPROVER_LEVEL_EXECUTIVE, want.execs]].forEach(function (pair) {
      const level = pair[0], wanted = pair[1];
      const cur = live.filter(function (r) { return Number(r.level) === level; });
      const curIds = cur.map(function (r) { return String(r.approver_user_id); });
      cur.forEach(function (r) {
        if (wanted.indexOf(String(r.approver_user_id)) < 0) chainClose.push(r);
      });
      wanted.forEach(function (id) {
        if (curIds.indexOf(String(id)) < 0) chainAdd.push({ user_id: uid, approver_user_id: id, level: level });
      });
    });
  });

  const summary = {
    total_rows: inRows.length,
    create: plan.filter(function (p) { return p.action === 'create'; }).length,
    update: plan.filter(function (p) { return p.action === 'update'; }).length,
    unchanged: plan.filter(function (p) { return p.action === 'same'; }).length,
    supervisor_flag_add: flagPlan.length,
    chain_add: chainAdd.length,
    chain_close: chainClose.length,
    problems: problems,
  };

  if (dryRun) {
    return { ok: true, dry_run: true, summary: summary,
             plan: plan.map(function (p) {
               return { emp_code: p.code, display_name: p.name, action: p.action,
                        user_id: p.user_id, changes: p.changes };
             }) };
  }

  // ========== 5) เขียนจริง ==========
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (e) { return { ok: false, error: 'lock_failed', message: 'ระบบกำลังประมวลผลอยู่ ลองใหม่อีกครั้ง' }; }

  try {
    const now = nowBangkok();

    // 5.1 สร้างแถวใหม่ — เขียนรวดเดียว ไม่ appendRow ทีละแถว
    const creates = plan.filter(function (p) { return p.action === 'create'; });
    if (creates.length) {
      const block = creates.map(function (p) {
        const r = p.src;
        const isSup = (r.role === ROLES.SUPERVISOR) || !!needSupFlag[p.user_id];
        const obj = {
          user_id: p.user_id, line_user_id: '', role: r.role || ROLES.USER,
          display_name: p.name, emp_code: p.code,
          phone: r.phone || '', email: r.email || '',
          department: r.department || '', position: r.position || '',
          is_supervisor: isSup, status: 'invited', invited_by: actor.user_id,
          created_at: now, approved_at: '', approved_by: '',
        };
        const unknown = Object.keys(obj).filter(function (k) { return uhdr.indexOf(k) < 0; });
        if (unknown.length) throw new Error('ไม่มีคอลัมน์ ' + unknown.join(', ') + ' ใน tab Users — รัน setupDatabase() ก่อน');
        return uhdr.map(function (h) {
          return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
        });
      });
      ush.getRange(ush.getLastRow() + 1, 1, block.length, uhdr.length).setValues(block);
    }

    // 5.2 แก้แถวเดิม — เฉพาะคอลัมน์ที่เปลี่ยน ไม่แตะ line_user_id / status
    plan.filter(function (p) { return p.action === 'update'; }).forEach(function (p) {
      const obj = {};
      Object.keys(p.changes).forEach(function (k) { obj[k] = p.changes[k]; });
      if (obj.role === ROLES.SUPERVISOR) obj.is_supervisor = true;
      updateRowByHeader_(ush, p.row, obj);
    });

    // 5.3 ติดธงหัวหน้าให้ผู้อนุมัติขั้น 1 ที่ยังไม่มีธง (รวมผู้บริหารที่คุมคนโดยตรง)
    const iFlag = uhdr.indexOf('is_supervisor');
    flagPlan.forEach(function (uid) {
      const cur = existing.filter(function (o) { return o.user_id === uid; })[0];
      if (cur) ush.getRange(cur._rowNumber, iFlag + 1).setValue(true);
    });

    // 5.4 ผังอำนาจ — ปิดของเก่า แล้วเพิ่มของใหม่รวดเดียว
    const iValidTo = state.hdr.indexOf('valid_to');
    chainClose.forEach(function (r) { state.sh.getRange(r._rowNumber, iValidTo + 1).setValue(now); });

    if (chainAdd.length) {
      let maxC = 0;
      state.rows.forEach(function (r) {
        const m = String(r.chain_id).match(/^APV-(\d+)$/);
        if (m) { const n = parseInt(m[1], 10); if (n > maxC) maxC = n; }
      });
      const cblock = chainAdd.map(function (c) {
        maxC++;
        const obj = {
          chain_id: 'APV-' + padLeft_(maxC, 4), user_id: c.user_id,
          approver_user_id: c.approver_user_id, level: c.level,
          valid_from: now, valid_to: '', created_by: actor.user_id,
        };
        return state.hdr.map(function (h) {
          return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
        });
      });
      state.sh.getRange(state.sh.getLastRow() + 1, 1, cblock.length, state.hdr.length).setValues(cblock);
    }

    audit(payload.lineUserId, 'import_employees', 'Users', '(bulk)', summary);
    logInfo('importEmployees', 'นำเข้าเสร็จ', summary);

    return { ok: true, dry_run: false, summary: summary };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ออกรหัสจับคู่ใหม่ให้พนักงานที่ "มีแถวอยู่แล้ว" แต่ยังไม่ผูกไลน์
 *
 * ⭐ ปิดทางตัน: เดิมรหัสจับคู่เกิดได้ทางเดียวคือตอน inviteUser ซึ่งสร้างแถวใหม่ทุกครั้ง
 *    คนที่นำเข้ามาเป็นชุด (หรือรหัสหมดอายุ 24 ชม.) จึงไม่มีทางเข้าระบบได้เลย
 *    นอกจากสร้างแถวซ้ำ
 */
function issuePairingCode(payload) {
  payload = payload || {};
  if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!payload.user_id) return { ok: false, error: 'missing_user_id' };

  const actor = findUserByLineId_(payload.lineUserId);
  const target = findUserByUserId_(payload.user_id);
  if (!target) return { ok: false, error: 'user_not_found', message: 'ไม่พบพนักงานคนนี้' };
  // เช็คบัญชีปิดก่อนเสมอ — คนที่ปิดไปแล้วอาจเคยผูกไลน์ไว้ ถ้าเช็คไลน์ก่อนจะได้ข้อความ
  // "ผูกไลน์ไว้แล้ว" ซึ่งบอกสาเหตุผิด HR จะไม่รู้ว่าต้องไปเปิดบัญชีก่อน
  if (target.status === 'inactive') {
    return { ok: false, error: 'inactive',
             message: (target.display_name || payload.user_id) + ' ถูกปิดบัญชีอยู่ — เปิดบัญชีก่อนจึงออกรหัสได้' };
  }
  if (target.line_user_id) {
    return { ok: false, error: 'already_paired',
             message: (target.display_name || payload.user_id) + ' ผูกไลน์ไว้แล้ว ไม่ต้องออกรหัสใหม่' };
  }

  const codeRes = createPairingCode(payload.user_id, actor.user_id);
  audit(payload.lineUserId, 'issue_pairing_code', 'Users', payload.user_id, { emp_code: target.emp_code });

  return {
    ok: true,
    user_id: payload.user_id,
    display_name: target.display_name,
    pairing_code: codeRes.code,
    expires_at: codeRes.expiresAt,
    invite_text: buildInviteText_(target.display_name, codeRes.code, codeRes.expiresAt),
  };
}
