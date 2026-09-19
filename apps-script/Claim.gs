/**
 * Claim.gs — พนักงานที่ "มีชื่อในทะเบียนอยู่แล้ว" ผูกบัญชีไลน์ของตัวเอง
 *
 * Actions:
 *   - claimMyAccount(payload)   พนักงานกรอก รหัสพนักงาน + ชื่อ-นามสกุล → ผูก line_user_id เข้าแถวเดิม
 *
 * ทำไมต้องมีตัวนี้ (อ่านก่อนแก้)
 *   นำเข้าทะเบียนพนักงานทั้งบริษัทมาแล้ว 55 คน แต่ทุกแถวยังไม่มี line_user_id
 *   ทางเดิมมีทางเดียวคือ HR กด "ออกรหัส" ทีละคน แล้วส่งเลข 6 หลักให้ (อายุ 24 ชม.)
 *   ทำพร้อมกันทั้งบริษัทไม่ไหว — HR ต้องกด 59 ครั้ง ส่ง 59 ข้อความ แล้วตามต่ออายุให้คนที่ทำไม่ทัน
 *   ตัวนี้ให้พนักงานยืนยันตัวเองด้วย "สิ่งที่เขารู้อยู่แล้ว" คือรหัสพนักงานกับชื่อตัวเอง
 *   รหัสจับคู่ 6 หลักยังอยู่ครบ ใช้เป็นทางสำรองสำหรับคนที่ชื่อในไฟล์สะกดไม่ตรง
 *
 * ⭐ กติกาที่ยึดไว้
 *   1. ต้องตรง "ทั้งรหัสพนักงานและชื่อ" — รู้อย่างเดียวผูกไม่ได้
 *   2. ข้อความ error ห้ามบอกว่าผิดช่องไหน — ไม่งั้นเดารหัสทีละตัวได้ว่าคนนี้มีอยู่จริงไหม
 *   3. หนึ่งแถวผูกได้ครั้งเดียว — คนที่สองที่ใช้รหัสเดียวกันโดนปฏิเสธ + log ไว้ให้ HR เห็น
 *   4. ปิดสวิตช์ได้ที่ Settings `self_claim_enabled` = FALSE (พาเข้าครบแล้วให้ปิด)
 *   5. ห้ามทับ display_name ของทะเบียน — ชื่อในระบบต้องเป็นชื่อจากไฟล์ HR ไม่ใช่ชื่อเล่นใน LINE
 */

/** ชื่อคนไทยให้เทียบกันได้ — ตัดคำนำหน้า ตัดช่องว่างทุกตัว ตัดวรรคตอน */
function normPersonName_(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  // คำนำหน้าที่คนกรอกบ้างไม่กรอกบ้าง
  s = s.replace(/^(นาย|นางสาว|น\.ส\.|นาง|ดร\.|ด\.ญ\.|ด\.ช\.|mr\.?|mrs\.?|miss|ms\.?)\s*/i, '');
  // ช่องว่างทุกชนิด (รวม   ที่ติดมาจากการก๊อป) + จุด/ขีด
  s = s.replace(/[\s .\-_]/g, '');
  return s.toLowerCase();
}

/**
 * payload = { lineUserId, displayName, emp_code, full_name }
 * return { ok, status, user } | { ok:false, error, message }
 */
function claimMyAccount(payload) {
  payload = payload || {};
  const lineUserId = payload.lineUserId;
  if (!lineUserId) return { ok: false, error: 'missing_line_user_id' };

  const empCode = normEmpCode_(payload.emp_code);
  const typedName = normPersonName_(payload.full_name);
  if (!empCode || !typedName) {
    return { ok: false, error: 'missing_fields', message: 'กรุณากรอกรหัสพนักงานและชื่อ-นามสกุลให้ครบ' };
  }

  // ข้อความเดียวใช้ทุกกรณีที่จับคู่ไม่ได้ — ห้ามบอกว่าผิดช่องไหน (กติกาข้อ 2)
  const NO_MATCH = {
    ok: false,
    error: 'no_match',
    message: 'ข้อมูลไม่ตรงกับทะเบียนพนักงาน กรุณาตรวจรหัสพนักงานและชื่อ-นามสกุลอีกครั้ง ' +
             'ถ้ายังผูกไม่ได้ให้ติดต่อฝ่ายบุคคล',
  };

  if (getConfig().self_claim_enabled === false) {
    return { ok: false, error: 'disabled',
             message: 'ขณะนี้ปิดการผูกบัญชีด้วยตนเอง กรุณาติดต่อฝ่ายบุคคลเพื่อขอรหัสจับคู่' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, error: 'busy', message: 'ระบบกำลังทำงานอยู่ กรุณาลองใหม่อีกครั้ง' };
  }

  try {
    // ผูกไปแล้วหรือยัง — เจอแถวของ lineUserId นี้ = ไม่ต้องผูกซ้ำ
    const mine = findUserByLineId_(lineUserId);
    if (mine) {
      if (mine.status === 'inactive') {
        return { ok: false, error: 'inactive', message: 'บัญชีของคุณถูกปิดการใช้งาน กรุณาติดต่อฝ่ายบุคคล' };
      }
      return { ok: true, status: mine.status, already: true, user: publicUser_(mine),
               message: 'บัญชีของคุณผูกกับระบบไว้แล้ว' };
    }

    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
    if (sh.getLastRow() < 2) return NO_MATCH;

    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const iCode = hdr.indexOf('emp_code');
    const iName = hdr.indexOf('display_name');
    const iLine = hdr.indexOf('line_user_id');
    const iStatus = hdr.indexOf('status');
    const iId = hdr.indexOf('user_id');
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

    // ⭐ รหัสพนักงานซ้ำกันได้จริงในระบบนี้ (แถว HR 3 แถวใช้ emp_code เดียวกัน)
    //    จึงต้องเก็บทุกแถวที่ตรงไว้ก่อน แล้วค่อยคัดด้วยชื่อ
    const matched = [];
    for (let i = 0; i < data.length; i++) {
      if (normEmpCode_(data[i][iCode]) !== empCode) continue;
      if (normPersonName_(data[i][iName]) !== typedName) continue;
      matched.push({ idx: i, row: data[i], rowNumber: i + 2 });
    }
    if (!matched.length) return NO_MATCH;

    // แถวที่ปิดไปแล้ว (เช่นแถวซ้ำที่ HR ปิดทิ้ง) ห้ามนับ ถ้ายังมีแถวที่เปิดอยู่
    // — ไม่งั้นคนจริงผูกไม่ได้ตลอดไปเพราะ "พบข้อมูลซ้ำ" (เคสคุณสุรศักดิ์ 19 ก.ย. 69)
    const live = matched.filter(function (m) { return m.row[iStatus] !== 'inactive'; });
    if (live.length) matched.splice(0, matched.length, ...live);

    const open = matched.filter(function (m) { return !m.row[iLine]; });

    if (!open.length) {
      // ทุกแถวที่ตรงถูกผูกไปแล้ว — อาจเป็นคนเปลี่ยนบัญชีไลน์ หรือมีคนสวมสิทธิ์
      logWarn('claimMyAccount', 'ถูกผูกไปแล้ว มีคนพยายามผูกซ้ำ',
              { emp_code: empCode, user_id: matched[0].row[iId], lineUserId: lineUserId });
      audit(lineUserId, 'claim_rejected_already_paired', 'Users', matched[0].row[iId], { emp_code: empCode });
      return { ok: false, error: 'already_claimed',
               message: 'รหัสพนักงานนี้ถูกผูกกับบัญชีไลน์อื่นไปแล้ว กรุณาติดต่อฝ่ายบุคคล' };
    }

    if (open.length > 1) {
      // ชื่อ+รหัสตรงกันหลายแถว — เดาแทนไม่ได้ ให้คนตัดสิน
      logWarn('claimMyAccount', 'ตรงหลายแถว เลือกให้ไม่ได้', { emp_code: empCode, count: open.length });
      return { ok: false, error: 'ambiguous',
               message: 'พบข้อมูลซ้ำในทะเบียน กรุณาติดต่อฝ่ายบุคคลเพื่อผูกบัญชีให้' };
    }

    const target = open[0];
    const targetId = target.row[iId];
    const status = target.row[iStatus];

    if (status === 'inactive') {
      return { ok: false, error: 'inactive',
               message: 'บัญชีของคุณถูกปิดการใช้งาน กรุณาติดต่อฝ่ายบุคคล' };
    }

    // ผูก — เขียน line_user_id + เปิดใช้งานทันที
    // ⭐ ไม่ต้องรอ HR กดอนุมัติ เพราะแถวนี้ HR เป็นคนนำเข้าจากไฟล์ทะเบียนของบริษัทเอง
    //    ตัวที่ต้องพิสูจน์คือ "คนนี้คือเจ้าของแถว" ซึ่งพิสูจน์ด้วยรหัส+ชื่อไปแล้ว
    // ⭐ ห้ามเขียนทับ display_name ด้วยชื่อใน LINE (กติกาข้อ 5)
    // ⭐ แถวผู้บริหาร/HR ห้ามเปิดใช้เองด้วยรหัส+ชื่อ — HR เห็นรหัสกับชื่อผู้บริหารในทะเบียนอยู่แล้ว
    //    ถ้าเปิดทันที HR ใช้ไลน์อีกเครื่องผูกแถวผู้บริหารแล้วได้สิทธิ์ผู้บริหารทันที
    //    → ผูกไลน์ไว้ แต่สถานะ pending จนผู้บริหารที่ใช้งานอยู่กดยืนยัน (approveRegister ฝั่งนี้ OWNER เท่านั้น)
    const iRole = hdr.indexOf('role');
    const privileged = [ROLES.OWNER, ROLES.ADMIN].indexOf(target.row[iRole]) >= 0;
    sh.getRange(target.rowNumber, iLine + 1).setValue(lineUserId);
    sh.getRange(target.rowNumber, iStatus + 1).setValue(privileged ? 'pending' : 'active');
    const iApprovedAt = hdr.indexOf('approved_at');
    const iApprovedBy = hdr.indexOf('approved_by');
    if (!privileged) {
      if (iApprovedAt >= 0) sh.getRange(target.rowNumber, iApprovedAt + 1).setValue(nowBangkok());
      if (iApprovedBy >= 0) sh.getRange(target.rowNumber, iApprovedBy + 1).setValue('(self-claim)');
    }

    ensureQuotaRow_(targetId);

    logInfo('claimMyAccount', 'ผูกบัญชีสำเร็จ', { userId: targetId, emp_code: empCode, lineUserId: lineUserId });
    audit(lineUserId, 'claim_account', 'Users', targetId, { emp_code: empCode });

    const user = findUserByUserId_(targetId);

    if (privileged) {
      logInfo('claimMyAccount', 'ผูกแถวผู้บริหาร/HR — รอผู้บริหารยืนยัน', { userId: targetId, lineUserId: lineUserId });
      try {
        pushToAllOwners(buildRegisterPendingCard(user));
      } catch (e) {
        logWarn('claimMyAccount', 'แจ้งผู้บริหารไม่สำเร็จ: ' + e.message);
      }
      return { ok: true, status: 'pending', user: publicUser_(user),
               message: 'ผูกบัญชีแล้ว — บัญชีระดับ' + getRoleLabelTh(target.row[iRole]) +
                        ' ต้องให้ผู้บริหารกดยืนยันก่อนใช้งาน ระบบแจ้งผู้บริหารให้แล้ว' };
    }

    // แจ้ง HR ว่ามีคนเข้าระบบเพิ่ม — ไม่ต้องกดอะไร แค่ให้เห็นความคืบหน้าตอนพาเข้าทั้งบริษัท
    try {
      pushToAllAdmins(buildClaimNoticeCard(user));
    } catch (e) {
      logWarn('claimMyAccount', 'แจ้ง HR ไม่สำเร็จ: ' + e.message);
    }

    return { ok: true, status: 'active', user: publicUser_(user), message: 'ผูกบัญชีเรียบร้อย' };
  } finally {
    lock.releaseLock();
  }
}
