/**
 * EmployeeCreate.gs — สร้างพนักงานใหม่พร้อมกำหนดวิธีผูกบัญชี LINE
 *
 * payload = {
 *   lineUserId, emp_code, display_name, department, position, phone?,
 *   role, supervisor_user_id?, executive_user_ids?: [],
 *   issue_code?: boolean, confirm_same_name?: boolean
 * }
 */
function createEmployee(payload) {
  payload = payload || {};

  try {
    if (!isAdmin(payload.lineUserId)) {
      return { ok: false, error: 'forbidden', message: 'เฉพาะ HR / ผู้บริหาร เท่านั้นที่สร้างพนักงานได้' };
    }

    const empCode = normEmpCode_(payload.emp_code);
    const displayName = String(payload.display_name || '').trim();
    const role = String(payload.role || ROLES.USER).trim().toUpperCase();

    if (!empCode) {
      return { ok: false, error: 'missing_emp_code', message: 'กรุณากรอกรหัสพนักงาน' };
    }
    if (displayName.length < 2) {
      return { ok: false, error: 'invalid_display_name', message: 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร' };
    }
    if (ASSIGNABLE_ROLES.indexOf(role) < 0) {
      return { ok: false, error: 'invalid_role', message: 'ระดับพนักงานไม่ถูกต้อง' };
    }
    // ใช้กติกาเดียวกับ setUserRole: เฉพาะผู้บริหารตั้งระดับ HR/ผู้บริหารได้
    if ((role === ROLES.OWNER || role === ROLES.ADMIN) && !isOwner(payload.lineUserId)) {
      return {
        ok: false,
        error: 'forbidden_owner_only',
        message: 'เฉพาะผู้บริหารเท่านั้นที่สร้างพนักงานระดับ HR หรือผู้บริหารได้',
      };
    }

    const actor = findUserByLineId_(payload.lineUserId);
    if (!actor) {
      return { ok: false, error: 'actor_not_found', message: 'ไม่พบบัญชีผู้สร้าง กรุณาเปิดหน้าใหม่แล้วลองอีกครั้ง' };
    }

    const touchSupervisor = Object.prototype.hasOwnProperty.call(payload, 'supervisor_user_id');
    const touchExecutives = Object.prototype.hasOwnProperty.call(payload, 'executive_user_ids');
    const supervisorUserId = touchSupervisor ? String(payload.supervisor_user_id || '').trim() : '';
    let executiveUserIds = [];
    if (touchExecutives) {
      if (!Array.isArray(payload.executive_user_ids)) {
        return { ok: false, error: 'invalid_executive_ids', message: 'รายชื่อผู้บริหารไม่ถูกต้อง' };
      }
      executiveUserIds = payload.executive_user_ids
        .map(function (v) { return String(v || '').trim(); })
        .filter(function (v, i, arr) { return !!v && arr.indexOf(v) === i; });
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
    } catch (lockErr) {
      return { ok: false, error: 'lock_failed', message: 'ระบบกำลังบันทึกข้อมูลอยู่ กรุณาลองอีกครั้ง' };
    }

    let createdUser = null;
    try {
      const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
      const usersSh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
      if (!usersSh) throw new Error('sheet Users not found');

      const hdr = usersSh.getRange(1, 1, 1, usersSh.getLastColumn()).getValues()[0];
      const data = usersSh.getLastRow() >= 2
        ? usersSh.getRange(2, 1, usersSh.getLastRow() - 1, usersSh.getLastColumn()).getValues()
        : [];
      const users = data.map(function (row, i) {
        const obj = {};
        hdr.forEach(function (h, j) { obj[h] = row[j]; });
        obj._rowNumber = i + 2;
        return obj;
      });

      // กันรหัสซ้ำใต้ lock เดียวกับ append — กดซ้ำสองครั้งก็สร้างได้เพียงแถวเดียว
      const duplicateCode = users.filter(function (u) {
        return u.status !== 'inactive' && normEmpCode_(u.emp_code) === empCode;
      })[0];
      if (duplicateCode) {
        return {
          ok: false,
          error: 'emp_code_exists',
          message: 'รหัสพนักงานนี้มีในระบบแล้ว: ' +
            (duplicateCode.display_name || '-') + ' (' + duplicateCode.user_id + ')',
          existing: {
            user_id: duplicateCode.user_id,
            display_name: duplicateCode.display_name || '',
            status: duplicateCode.status || '',
            has_line: !!duplicateCode.line_user_id,
          },
        };
      }

      // ชื่อซ้ำเป็นเพียงคำเตือน เพราะคนละคนอาจชื่อเหมือนกันได้
      const normalizedName = normPersonName_(displayName);
      const sameName = users.filter(function (u) {
        return u.status !== 'inactive' && normalizedName && normPersonName_(u.display_name) === normalizedName;
      })[0];
      if (sameName && payload.confirm_same_name !== true) {
        return {
          ok: false,
          error: 'same_name_exists',
          message: 'พบชื่อ-นามสกุลนี้ในระบบแล้ว: ' +
            (sameName.display_name || '-') + ' (' + sameName.user_id + ') กรุณาตรวจสอบก่อนยืนยันสร้าง',
          existing: {
            user_id: sameName.user_id,
            emp_code: normEmpCode_(sameName.emp_code),
            display_name: sameName.display_name || '',
            status: sameName.status || '',
            has_line: !!sameName.line_user_id,
          },
        };
      }

      // ตรวจผังอำนาจก่อนสร้างแถว เพื่อไม่ทิ้งพนักงานครึ่งรายการถ้าเลือกคนไม่ถูกต้อง
      const byId = {};
      users.forEach(function (u) { if (u.user_id) byId[u.user_id] = u; });
      if (supervisorUserId) {
        const supervisor = byId[supervisorUserId];
        if (!supervisor) {
          return { ok: false, error: 'supervisor_not_found', message: 'ไม่พบหัวหน้างานที่เลือก' };
        }
        if (['active', 'invited'].indexOf(supervisor.status) < 0) {
          return { ok: false, error: 'supervisor_inactive', message: 'หัวหน้างานที่เลือกยังใช้งานไม่ได้' };
        }
        if (!(isSupervisorUser_(supervisor) || hasRole(supervisor.role, ROLES.SUPERVISOR))) {
          return { ok: false, error: 'supervisor_wrong_role', message: 'คนที่เลือกยังไม่มีสิทธิ์เป็นหัวหน้างาน' };
        }
      }
      for (let i = 0; i < executiveUserIds.length; i++) {
        const executive = byId[executiveUserIds[i]];
        if (!executive) {
          return { ok: false, error: 'executive_not_found', message: 'ไม่พบผู้บริหารที่เลือก' };
        }
        if (['active', 'invited'].indexOf(executive.status) < 0) {
          return { ok: false, error: 'executive_inactive', message: (executive.display_name || 'ผู้บริหาร') + ' ยังใช้งานไม่ได้' };
        }
        if (executive.role !== ROLES.OWNER) {
          return { ok: false, error: 'executive_wrong_role', message: (executive.display_name || 'คนที่เลือก') + ' ยังไม่ใช่ระดับผู้บริหาร' };
        }
      }

      const userId = nextUserId();
      const now = nowBangkok();
      appendRowByHeader_(usersSh, {
        user_id: userId,
        line_user_id: '',
        role: role,
        display_name: displayName,
        emp_code: empCode,
        phone: String(payload.phone || '').trim(),
        email: '',
        department: String(payload.department || '').trim(),
        position: String(payload.position || '').trim(),
        is_supervisor: role === ROLES.SUPERVISOR || role === ROLES.OWNER,
        status: 'invited',
        invited_by: actor.user_id,
        created_at: now,
        approved_at: '',
        approved_by: '',
      });
      ensureQuotaRow_(userId);

      createdUser = {
        user_id: userId,
        emp_code: empCode,
        display_name: displayName,
        role: role,
        status: 'invited',
      };
    } finally {
      lock.releaseLock();
    }

    // ApprovalChain.gs ไม่มี internal apply helper แยก จึงเรียก endpoint เดิมโดยตรง
    // หลังปล่อย lock หลักแล้ว เพื่อไม่ให้ script lock ซ้อนกัน
    if (touchSupervisor || touchExecutives) {
      const chainPayload = { lineUserId: payload.lineUserId, user_id: createdUser.user_id };
      if (touchSupervisor) chainPayload.supervisor_user_id = supervisorUserId;
      if (touchExecutives) chainPayload.executive_user_ids = executiveUserIds;
      const chainResult = setApprovalChain(chainPayload);
      if (!chainResult.ok) {
        logError('createEmployee', 'สร้างพนักงานแล้ว แต่บันทึกสายอนุมัติไม่สำเร็จ', {
          userId: createdUser.user_id,
          error: chainResult.error,
        });
        return {
          ok: false,
          error: 'approval_chain_failed',
          message: 'สร้างพนักงานแล้ว แต่บันทึกสายอนุมัติไม่สำเร็จ กรุณาไปตั้งที่หน้าผังอำนาจอนุมัติ',
          user: createdUser,
        };
      }
    }

    let codeResult = null;
    if (payload.issue_code !== false) {
      codeResult = createPairingCode(createdUser.user_id, actor.user_id);
    }

    // เรียก builder เดิมเพื่อคงรูปแบบชื่อและวันหมดอายุ แล้วปรับลำดับให้ self-claim เป็นวิธีหลัก
    let inviteText = [
      'คุณ' + displayName + ' ได้รับเชิญเข้าใช้งานระบบลางาน MENA',
      '',
      'วิธีหลัก — ผูกบัญชีด้วยข้อมูลพนักงาน:',
      '1. เปิด LINE OA @966nnfkr',
      '2. กดเมนู "ผูกบัญชี"',
      '3. กรอกรหัสพนักงาน: ' + empCode,
      '4. กรอกชื่อ-นามสกุล: ' + displayName,
    ];
    if (codeResult) {
      const legacyInviteText = buildInviteText_(displayName, codeResult.code, codeResult.expiresAt);
      const expiryLine = String(legacyInviteText || '').split('\n').filter(function (line) {
        return line.indexOf('รหัสหมดอายุ:') === 0;
      })[0] || ('รหัสหมดอายุ: ' + formatThaiDateTime(codeResult.expiresAt));
      inviteText = inviteText.concat([
        '',
        'วิธีสำรอง — หากชื่อในทะเบียนสะกดไม่ตรง ให้ใช้รหัสจับคู่ 6 หลัก:',
        'รหัสจับคู่: ' + codeResult.code,
        expiryLine,
      ]);
    }
    inviteText = inviteText.join('\n');

    audit(payload.lineUserId, 'create_employee', 'Users', createdUser.user_id, {
      emp_code: empCode,
      role: role,
      supervisor_user_id: touchSupervisor ? supervisorUserId : '(ไม่แตะ)',
      executive_user_ids: touchExecutives ? executiveUserIds : '(ไม่แตะ)',
    });
    logInfo('createEmployee', 'สร้างพนักงานใหม่เรียบร้อย', {
      userId: createdUser.user_id,
      empCode: empCode,
      role: role,
    });

    const result = { ok: true, user: createdUser, invite_text: inviteText };
    if (codeResult) {
      result.pairing_code = codeResult.code;
      result.expires_at = codeResult.expiresAt;
    }
    return result;
  } catch (err) {
    logError('createEmployee', err && err.message ? err.message : String(err), {
      emp_code: payload && payload.emp_code,
      display_name: payload && payload.display_name,
    });
    return {
      ok: false,
      error: 'internal_error',
      message: 'สร้างพนักงานไม่สำเร็จ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ',
    };
  }
}
