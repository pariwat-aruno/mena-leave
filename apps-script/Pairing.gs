/**
 * Pairing.gs — pairing code 6 หลัก สำหรับ onboard
 *
 * Flow:
 *   1. ADMIN/OWNER กดสร้าง code → สร้าง row ใน Pairing_Codes (status=active, TTL 24h)
 *      → revoke code เก่าของ user คนเดียวกัน
 *      → ส่ง flex invite (I-018) ผ่าน LINE หรือ share manual
 *   2. Visitor เปิด LIFF myid → กดไป register → ใส่ code 6 หลัก + กรอกฟอร์ม
 *   3. submitRegister รับ code ด้วย → redeemPairingCode → ตั้ง line_user_id ใน Users
 *
 * คอลัมน์: code_id, code, for_user_id, created_by,
 *          created_at, expires_at, redeemed_at, redeemed_line_user_id, status
 */

/**
 * สร้าง pairing code 6 หลัก สำหรับ for_user_id
 * - revoke code เก่าที่ active ของ user คนเดียวกัน
 * - return { code, expiresAt, codeId }
 */
function createPairingCode(forUserId, createdBy) {
  if (!forUserId) throw new Error('forUserId required');

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pairing_Codes');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iForUser = headers.indexOf('for_user_id');
  const iStatus = headers.indexOf('status');

  // revoke active เก่า
  if (sh.getLastRow() >= 2) {
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][iForUser] === forUserId && data[i][iStatus] === 'active') {
        sh.getRange(i + 2, iStatus + 1).setValue('revoked');
      }
    }
  }

  // gen new
  let code, attempts = 0;
  do {
    code = generate6DigitCode();
    attempts++;
  } while (isCodeInUse_(code) && attempts < 10);

  const codeId = nextCodeId_();
  const ttlHours = Number((getConfig().pairing_code_ttl_hours) || 24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);
  const expiresStr = Utilities.formatDate(expiresAt, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX");

  sh.appendRow([
    codeId, code, forUserId, createdBy || '(system)',
    nowBangkok(), expiresStr, '', '', 'active',
  ]);

  logInfo('createPairingCode', 'created', { codeId: codeId, forUserId: forUserId });
  audit(createdBy, 'create_pairing_code', 'Pairing_Codes', codeId, { for_user_id: forUserId });

  return { code: code, expiresAt: expiresStr, codeId: codeId };
}

function isCodeInUse_(code) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pairing_Codes');
  if (sh.getLastRow() < 2) return false;
  const data = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();  // col 2 = code
  return data.some(function (row) { return row[0] === code; });
}

function nextCodeId_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pairing_Codes');
  if (sh.getLastRow() < 2) return 'PC-0001';
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  let maxN = 0;
  ids.forEach(function (row) {
    const m = String(row[0]).match(/^PC-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return 'PC-' + padLeft_(maxN + 1, 4);
}

/**
 * redeem pairing code — ผูก line_user_id เข้ากับ user row + เปิดสถานะ active
 * return { ok, user, error }
 */
function redeemPairingCode(code, lineUserId, displayName) {
  if (!code) return { ok: false, error: 'no_code' };
  if (!lineUserId) return { ok: false, error: 'no_line_user_id' };

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(sheetId);
  const codesSh = ss.getSheetByName('Pairing_Codes');

  if (codesSh.getLastRow() < 2) return { ok: false, error: 'code_not_found' };

  const hdr = codesSh.getRange(1, 1, 1, codesSh.getLastColumn()).getValues()[0];
  const iCode = hdr.indexOf('code');
  const iForUser = hdr.indexOf('for_user_id');
  const iExpires = hdr.indexOf('expires_at');
  const iStatus = hdr.indexOf('status');
  const iRedeemedAt = hdr.indexOf('redeemed_at');
  const iRedeemedBy = hdr.indexOf('redeemed_line_user_id');

  const data = codesSh.getRange(2, 1, codesSh.getLastRow() - 1, codesSh.getLastColumn()).getValues();
  let found = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][iCode] === code) { found = i; break; }
  }
  if (found < 0) return { ok: false, error: 'code_not_found' };

  const row = data[found];
  if (row[iStatus] !== 'active') return { ok: false, error: 'code_' + row[iStatus] };

  // check expires
  const expires = row[iExpires];
  const expDate = expires instanceof Date ? expires : new Date(expires);
  if (new Date() > expDate) {
    codesSh.getRange(found + 2, iStatus + 1).setValue('expired');
    return { ok: false, error: 'code_expired' };
  }

  const forUserId = row[iForUser];
  const user = findUserByUserId_(forUserId);
  if (!user) return { ok: false, error: 'user_not_found' };

  // update Users row
  const usersSh = ss.getSheetByName('Users');
  const uHdr = usersSh.getRange(1, 1, 1, usersSh.getLastColumn()).getValues()[0];
  const uILine = uHdr.indexOf('line_user_id');
  const uIName = uHdr.indexOf('display_name');
  const uIStatus = uHdr.indexOf('status');
  usersSh.getRange(user._rowNumber, uILine + 1).setValue(lineUserId);
  if (displayName) usersSh.getRange(user._rowNumber, uIName + 1).setValue(displayName);
  // ⚠️ ไม่ activate ที่นี่ — Register flow ต้อง HR approve ก่อน
  if (user.status === 'invited') {
    usersSh.getRange(user._rowNumber, uIStatus + 1).setValue('pending');
  }

  // mark code redeemed
  codesSh.getRange(found + 2, iStatus + 1).setValue('redeemed');
  codesSh.getRange(found + 2, iRedeemedAt + 1).setValue(nowBangkok());
  codesSh.getRange(found + 2, iRedeemedBy + 1).setValue(lineUserId);

  logInfo('redeemPairingCode', 'redeemed', { code: code, userId: forUserId, lineUserId: lineUserId });
  audit(lineUserId, 'redeem_pairing_code', 'Users', forUserId, { code: code });

  const updatedUser = findUserByUserId_(forUserId);
  return { ok: true, user: updatedUser };
}

/**
 * expire codes ที่ผ่าน expires_at (cron daily)
 */
function expirePairingCodes() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pairing_Codes');
  if (sh.getLastRow() < 2) return { ok: true, expired: 0 };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iExpires = hdr.indexOf('expires_at');
  const iStatus = hdr.indexOf('status');
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  const now = new Date();
  let count = 0;
  data.forEach(function (row, idx) {
    if (row[iStatus] === 'active') {
      const exp = row[iExpires];
      const d = exp instanceof Date ? exp : new Date(exp);
      if (now > d) {
        sh.getRange(idx + 2, iStatus + 1).setValue('expired');
        count++;
      }
    }
  });

  logInfo('expirePairingCodes', 'expired ' + count + ' code(s)');
  return { ok: true, expired: count };
}
