/**
 * Config.gs — อ่านค่าตั้งระบบ + role helpers (I-022)
 *
 * 2 แหล่ง:
 *   1) Script Properties — secret + ID (Sheet ID, LINE token, LIFF IDs)
 *   2) Sheet `Settings` — ค่าที่เจ้าของอาจอยากแก้เอง
 *
 * cache 5 นาที กัน read sheet ซ้ำ
 */

const CONFIG_CACHE_KEY = 'mena_leave_runtime_config';
const CONFIG_CACHE_TTL = 300; // 5 นาที

// ========== Role naming (I-022) ==========

const ROLES = {
  OWNER:   'OWNER',
  ADMIN:   'ADMIN',
  USER:    'USER',
  VISITOR: 'VISITOR',
};

const ROLE_LABELS_TH = {
  OWNER:   'เจ้าของ',
  ADMIN:   'ฝ่ายบุคคล (HR)',
  USER:    'พนักงาน',
  VISITOR: 'ยังไม่ลงทะเบียน',
};

// ascending hierarchy — OWNER > ADMIN > USER > VISITOR
const ROLE_HIERARCHY = ['VISITOR', 'USER', 'ADMIN', 'OWNER'];

function hasRole(userRole, requiredRole) {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

/** เช็คว่า lineUserId เป็น OWNER ไหม (ลึก ๆ จาก Sheet Users) */
function isOwner(lineUserId) {
  if (!lineUserId) return false;
  try {
    const user = findUserByLineId_(lineUserId);
    return user && user.role === ROLES.OWNER && user.status === 'active';
  } catch (e) {
    return false;
  }
}

/** ADMIN+ (ADMIN หรือ OWNER) */
function isAdmin(lineUserId) {
  if (!lineUserId) return false;
  try {
    const user = findUserByLineId_(lineUserId);
    if (!user || user.status !== 'active') return false;
    return hasRole(user.role, ROLES.ADMIN);
  } catch (e) {
    return false;
  }
}

/** USER+ (USER, ADMIN, OWNER) — registered active */
function isUser(lineUserId) {
  if (!lineUserId) return false;
  try {
    const user = findUserByLineId_(lineUserId);
    if (!user || user.status !== 'active') return false;
    return hasRole(user.role, ROLES.USER);
  } catch (e) {
    return false;
  }
}

/** หา user ทั้งหมดที่ role = X (active) */
function getUsersByRole_(role) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  if (sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const iRole = headers.indexOf('role');
  const iStatus = headers.indexOf('status');
  return data
    .filter(function (row) {
      return row[iRole] === role && row[iStatus] === 'active';
    })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, j) { obj[h] = row[j]; });
      return obj;
    });
}

/** push message ให้ OWNER ทุกคน (active) */
function pushToAllOwners(messages) {
  getUsersByRole_(ROLES.OWNER).forEach(function (u) {
    if (u.line_user_id) pushMessage(u.line_user_id, messages);
  });
}

/** push message ให้ ADMIN ทุกคน (active) — ไม่รวม OWNER */
function pushToAllAdmins(messages) {
  getUsersByRole_(ROLES.ADMIN).forEach(function (u) {
    if (u.line_user_id) pushMessage(u.line_user_id, messages);
  });
}

// ========== Main config ==========

/**
 * คืนค่า config object รวมทุก property ที่ใช้บ่อย
 * required keys → ถ้าหายไป throw ทันที (fail fast)
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  const required = [
    'SHEET_ID',
    'DRIVE_FOLDER_ID',
    'LINE_CHANNEL_ACCESS_TOKEN',
  ];

  const cfg = {};
  const missing = [];
  required.forEach(function (key) {
    const v = props.getProperty(key);
    if (!v) missing.push(key);
    cfg[key] = v;
  });

  if (missing.length) {
    throw new Error('missing required Script Properties: ' + missing.join(', '));
  }

  // optional
  cfg.LINE_CHANNEL_SECRET = props.getProperty('LINE_CHANNEL_SECRET') || '';
  cfg.DRIVE_FOLDER_LEAVE_PROOFS = props.getProperty('DRIVE_FOLDER_LEAVE_PROOFS') || '';

  // LIFF IDs ทั้ง 8
  cfg.LIFF_ID_MYID         = props.getProperty('LIFF_ID_MYID')         || '';
  cfg.LIFF_ID_REGISTER     = props.getProperty('LIFF_ID_REGISTER')     || '';
  cfg.LIFF_ID_REQUEST      = props.getProperty('LIFF_ID_REQUEST')      || '';
  cfg.LIFF_ID_HISTORY      = props.getProperty('LIFF_ID_HISTORY')      || '';
  cfg.LIFF_ID_APPROVE      = props.getProperty('LIFF_ID_APPROVE')      || '';
  cfg.LIFF_ID_ADMIN        = props.getProperty('LIFF_ID_ADMIN')        || '';
  cfg.LIFF_ID_MANUAL       = props.getProperty('LIFF_ID_MANUAL')       || '';
  cfg.LIFF_ID_MANUAL_ADMIN = props.getProperty('LIFF_ID_MANUAL_ADMIN') || '';

  // sheet `Settings`
  Object.assign(cfg, readSheetSettings_(cfg.SHEET_ID));

  return cfg;
}

/**
 * อ่านค่า Settings จาก sheet (cache)
 */
function readSheetSettings_(sheetId) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CONFIG_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Settings');
  if (!sh) throw new Error('sheet Settings not found');

  const last = sh.getLastRow();
  const result = {};
  if (last >= 2) {
    const data = sh.getRange(2, 1, last - 1, 2).getValues();
    data.forEach(function (row) {
      const k = row[0];
      let v = row[1];
      if (!k) return;
      // Sheets auto-convert "08:00" → Date — format กลับ
      if (v instanceof Date) {
        v = Utilities.formatDate(v, 'Asia/Bangkok', 'HH:mm');
      } else if (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(v)) {
        v = Number(v);
      } else if (v === 'TRUE' || v === 'true' || v === true) {
        v = true;
      } else if (v === 'FALSE' || v === 'false' || v === false) {
        v = false;
      }
      result[k] = v;
    });
  }

  cache.put(CONFIG_CACHE_KEY, JSON.stringify(result), CONFIG_CACHE_TTL);
  return result;
}

/** invalidate cache (เรียกตอน Settings เปลี่ยน) */
function clearConfigCache() {
  CacheService.getScriptCache().remove(CONFIG_CACHE_KEY);
}

// ========== User lookup helpers ==========

/** หา user จาก line_user_id — return row object หรือ null */
function findUserByLineId_(lineUserId) {
  if (!lineUserId) return null;
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const last = sh.getLastRow();
  if (last < 2) return null;

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iLine = headers.indexOf('line_user_id');
  if (iLine < 0) throw new Error('column line_user_id not found in Users');

  const data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][iLine] === lineUserId) {
      const row = {};
      headers.forEach(function (h, j) { row[h] = data[i][j]; });
      row._rowNumber = i + 2;
      return row;
    }
  }
  return null;
}

/** หา user จาก user_id (EMP-XXXX) */
function findUserByUserId_(userId) {
  if (!userId) return null;
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const last = sh.getLastRow();
  if (last < 2) return null;

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iId = headers.indexOf('user_id');
  const data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][iId] === userId) {
      const row = {};
      headers.forEach(function (h, j) { row[h] = data[i][j]; });
      row._rowNumber = i + 2;
      return row;
    }
  }
  return null;
}

/** label ของ role ใน UI — รองรับ override ผ่าน Settings */
function getRoleLabelTh(role, opts) {
  // opts.isSupervisor = TRUE → "หัวหน้างาน" (override สำหรับ USER)
  if (opts && opts.isSupervisor && role === ROLES.USER) {
    return 'หัวหน้างาน';
  }
  return ROLE_LABELS_TH[role] || role;
}
