/**
 * Setup.gs — สร้าง Sheet schema + Drive folder + Settings + Properties (I-020)
 *
 * คำสั่งหลัก: setupAll() — รัน 1 ครั้งจบทุกอย่าง
 *
 * รายละเอียดที่ทำ:
 *   1) setupDatabase()        → สร้าง Sheet 10 tab + headers
 *   2) seedSettings()         → ใส่ค่า default ใน Sheet `Settings`
 *   3) seedDefaultRules()     → ใส่กฎเริ่มต้น 3 รายการ
 *   4) setupDrive()           → สร้าง root + sub-folder + permission
 *   5) setupProperties()      → ใส่ non-secret IDs ลง Script Properties
 *
 * Secret (LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET) ใส่ผ่าน Apps Script UI manual
 * ทุก function idempotent — รันซ้ำได้
 *
 * TODO ก่อนใช้:
 *   - แก้ NON_SECRET_PROPS ใส่ LIFF IDs ทั้ง 8 (หลังสร้าง LIFF apps แล้ว)
 */

// ========== Schema ==========

/**
 * Sheet 10 tab + headers
 * ทุกชื่อ + column ต้องตรงกับ CONTEXT.md § 4 Data Model
 */
const SHEET_HEADERS = {
  'Users': [
    'user_id', 'line_user_id', 'role', 'display_name', 'emp_code',
    'phone', 'email', 'department', 'position', 'is_supervisor',
    'status', 'invited_by', 'created_at', 'approved_at', 'approved_by',
  ],
  'Supervisors': [
    'pair_id', 'user_id', 'supervisor_user_id',
    'valid_from', 'valid_to', 'created_by',
  ],
  'LeaveRequests': [
    'leave_id', 'user_id', 'leave_type', 'date_from', 'date_to', 'days',
    'is_retroactive', 'reason', 'gps_lat', 'gps_lng', 'gps_accuracy',
    'attachment_url',
    'stage1_required', 'stage1_status', 'stage1_by', 'stage1_at', 'stage1_note',
    'stage2_status', 'stage2_by', 'stage2_at', 'stage2_note',
    'stage3_status', 'stage3_by', 'stage3_at', 'stage3_note',
    'final_status', 'submitted_at',
  ],
  'LeaveQuota': [
    'quota_id', 'user_id', 'year',
    'sick_total', 'sick_used', 'sick_reserved',
    'personal_total', 'personal_used', 'personal_reserved',
    'vacation_total', 'vacation_used', 'vacation_reserved',
    'updated_at',
  ],
  'LeaveRules': [
    'rule_id', 'leave_type',
    'advance_notice_days', 'max_consecutive_days', 'doc_required_above_days',
    'note', 'is_active', 'updated_at', 'updated_by',
  ],
  'Pairing_Codes': [
    'code_id', 'code', 'for_user_id', 'created_by',
    'created_at', 'expires_at', 'redeemed_at', 'redeemed_line_user_id', 'status',
  ],
  'Pending_Changes': [
    'change_id', 'proposed_by', 'target_entity', 'target_id',
    'change_type', 'payload_json', 'proposed_at',
    'status', 'decided_by', 'decided_at', 'decision_note',
  ],
  'Audit_Log': [
    'audit_id', 'timestamp', 'actor_user_id', 'actor_role',
    'action', 'target_entity', 'target_id', 'payload', 'ip_or_gps',
  ],
  'Logs':     ['timestamp', 'level', 'function', 'message', 'payload'],
  'Settings': ['key', 'value', 'note'],
};

/**
 * default ใน Sheet Settings
 * ผู้บริหารแก้ผ่าน Sheet UI โดยไม่ต้องแก้ code ได้
 */
const SETTINGS_DEFAULTS = [
  ['brand_name',                    'MENA COSMETICS',  'I-017 brand name'],
  ['brand_logo_url',                '',                 'I-017 logo URL (Drive thumbnail)'],
  ['brand_color_primary',           '#d51f7d',         'I-017 cherry primary'],
  ['brand_color_tint',              '#fce4ef',         'I-017 cherry tint'],
  ['approval_levels',               '3',                'จำนวน stage (default 3)'],
  ['approval_stage1_role',          'supervisor',       'ใครอนุมัติ stage 1'],
  ['approval_stage2_role',          'ADMIN',            'ใครอนุมัติ stage 2'],
  ['approval_stage3_role',          'OWNER',            'ใครอนุมัติ stage 3'],
  ['default_sick_total',            '30',               'โควตา sick เริ่มต้น (วัน/ปี)'],
  ['default_personal_total',        '6',                'โควตา personal เริ่มต้น'],
  ['default_vacation_total',        '10',               'โควตา vacation เริ่มต้น'],
  ['count_weekends_as_leave',       'FALSE',            'นับ ส-อา เป็นวันลาไหม'],
  ['pairing_code_ttl_hours',        '24',               'อายุ pairing code (ชม.)'],
  ['quota_reset_month',             '1',                'เดือนรีเซ็ตโควตา (1=ม.ค.)'],
  ['quota_reset_day',               '1',                'วันรีเซ็ตโควตา'],
  ['gps_required',                  'TRUE',             'บังคับ GPS ตอน submit'],
  ['attachment_required_above_days', '3',               'ลาเกินกี่วันต้องแนบไฟล์ (override per type)'],
  ['support_line_id',               '@966nnfkr',        'สำหรับ manual.html'],
  ['support_phone',                 '',                 ''],
];

/**
 * กฎเริ่มต้น 3 type
 */
const RULES_DEFAULTS = [
  // [leave_type, advance_notice_days, max_consecutive_days, doc_required_above_days, note]
  ['sick',     0, 0, 3, 'ลาป่วยฉุกเฉินได้ ส่งใบรับรองแพทย์เมื่อกลับมาทำงาน หากลาเกิน 3 วันต้องแนบใบรับรองแพทย์'],
  ['personal', 3, 0, 0, 'ลากิจต้องแจ้งล่วงหน้าอย่างน้อย 3 วัน'],
  ['vacation', 7, 0, 0, 'ลาพักร้อนต้องแจ้งล่วงหน้าอย่างน้อย 7 วัน'],
];

/**
 * sub-folders ใน Drive
 */
const DRIVE_SUBFOLDERS = [
  'leave-proofs',  // รูปใบรับรองแพทย์ / บัตรคิว / อุบัติเหตุ ฯลฯ
];

/**
 * non-secret IDs ที่ใส่ลง Script Properties
 * LIFF_ID = 1 ตัวเดียวสำหรับทุกหน้า (permanentLinkPattern=concat)
 *   - LIFF URL: https://liff.line.me/<LIFF_ID>/<page>.html
 *   - browser โหลด: https://pariwat-aruno.github.io/mena-leave/<page>.html
 */
const NON_SECRET_PROPS = {
  SHEET_ID:           '',  // auto จาก setupDatabase()
  DRIVE_FOLDER_ID:    '',  // auto จาก setupDrive()
  DRIVE_FOLDER_LEAVE_PROOFS: '',  // auto จาก setupDrive()
  LIFF_ID:            '2010175593-Fqjuhv0q',  // LIFF app เดียว (concat subpath routing)
  WEB_APP_URL:        'https://script.google.com/macros/s/AKfycbwhvhNvpUJ2LrOCsQ35JA9OpqOR55rBfYoiayWZcqFxo754Os-YXEfmbUNEhOJ_cYN_/exec',
};

// ========== One-shot setup (I-020) ==========

/**
 * setupAll() — รัน 1 ครั้งจบ
 * ครอบทุก setup function ตามลำดับ + log สรุป
 * ปลอดภัยรันซ้ำ
 */
function setupAll() {
  console.log('=== mena-leave setupAll() เริ่มทำงาน ===');

  const sheetId = setupDatabase();
  Utilities.sleep(500);

  // ตั้ง SHEET_ID ใน Script Properties ก่อน เพื่อให้ฟังก์ชันถัดไปอ่านได้
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', sheetId);

  seedSettings();
  Utilities.sleep(300);

  seedDefaultRules();
  Utilities.sleep(300);

  const driveResult = setupDrive();
  PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_ID', driveResult.rootId);
  PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_LEAVE_PROOFS', driveResult.subFolders['leave-proofs']);

  // ใส่ค่าที่เหลือใน NON_SECRET_PROPS (LIFF IDs — ตอนแรกว่าง รัน setupProperties() อีกรอบหลังกรอก)
  setupProperties();

  console.log('=== setupAll() เสร็จสมบูรณ์ ===');
  console.log('SHEET_ID = ' + sheetId);
  console.log('DRIVE_FOLDER_ID = ' + driveResult.rootId);
  console.log('');
  console.log('ขั้นต่อไป:');
  console.log('  1. Apps Script UI → Project Settings → Script Properties');
  console.log('     ใส่ LINE_CHANNEL_ACCESS_TOKEN + LINE_CHANNEL_SECRET');
  console.log('  2. หลังสร้าง LIFF apps แล้ว แก้ NON_SECRET_PROPS ใน Setup.gs ใส่ LIFF IDs');
  console.log('  3. รัน setupProperties() อีกครั้งเพื่อ update');
  console.log('  4. รัน bootstrapFirstOwner("Uxxx...") ใส่ LINE userId ของพี่ปุ้ย');
  console.log('  5. รัน setupTriggers() เปิด cron');

  return { sheetId: sheetId, driveFolderId: driveResult.rootId };
}

// ========== ฟังก์ชันย่อย ==========

/**
 * สร้าง Sheet ใหม่ + 10 tab + headers
 * รันซ้ำ → ใช้ Sheet เดิม (ไม่สร้างซ้ำ)
 */
function setupDatabase() {
  const props = PropertiesService.getScriptProperties();
  let sheetId = props.getProperty('SHEET_ID');
  let ss;

  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
      console.log('reuse existing sheet: ' + sheetId);
    } catch (err) {
      console.log('SHEET_ID ตั้งไว้แต่เปิดไม่ได้ — จะสร้างใหม่');
      sheetId = null;
    }
  }

  if (!sheetId) {
    ss = SpreadsheetApp.create('mena-leave - Database');
    sheetId = ss.getId();
    console.log('สร้าง Sheet ใหม่: ' + sheetId);
    console.log('URL: ' + ss.getUrl());
  }

  Object.keys(SHEET_HEADERS).forEach(function (tabName) {
    let sh = ss.getSheetByName(tabName);
    if (!sh) {
      sh = ss.insertSheet(tabName);
      console.log('สร้าง tab: ' + tabName);
    }
    const headers = SHEET_HEADERS[tabName];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  });

  // ลบ default Sheet1 ถ้ายังเหลือ
  const sh1 = ss.getSheetByName('Sheet1');
  if (sh1 && ss.getSheets().length > 1) {
    ss.deleteSheet(sh1);
  }

  console.log('✓ setupDatabase เสร็จ — SHEET_ID = ' + sheetId);
  return sheetId;
}

/**
 * Seed Settings defaults ลง Sheet `Settings`
 * รันซ้ำ → key เดิมไม่ทับ (เก็บค่าที่ผู้บริหารแก้ไว้)
 */
function seedSettings() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('ตั้ง SHEET_ID ก่อน รัน setupDatabase()');

  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Settings');
  const existing = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; })
    : [];

  let added = 0;
  SETTINGS_DEFAULTS.forEach(function (row) {
    const key = row[0];
    if (existing.indexOf(key) === -1) {
      sh.appendRow(row);
      added++;
    }
  });

  console.log('✓ seedSettings — เพิ่ม ' + added + ' key ใหม่ (skip ที่มีอยู่)');
}

/**
 * Seed กฎเริ่มต้น 3 รายการ
 */
function seedDefaultRules() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('ตั้ง SHEET_ID ก่อน');

  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRules');
  const existing = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().map(function (r) { return r[1]; })
    : [];

  const now = nowBangkok();
  let added = 0;
  RULES_DEFAULTS.forEach(function (rule, idx) {
    const leaveType = rule[0];
    if (existing.indexOf(leaveType) === -1) {
      const ruleId = 'R-' + padLeft_(idx + 1, 4);
      sh.appendRow([
        ruleId, leaveType,
        rule[1], rule[2], rule[3], rule[4],
        true, now, '(system)',
      ]);
      added++;
    }
  });

  console.log('✓ seedDefaultRules — เพิ่ม ' + added + ' rule (skip ที่มีอยู่)');
}

/**
 * สร้าง root folder + sub-folders ใน Drive
 * permission anyone-with-link เพื่อ render ใน LINE flex
 * return { rootId, subFolders: { 'leave-proofs': 'xxx' } }
 */
function setupDrive() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  let root;

  if (folderId) {
    try {
      root = DriveApp.getFolderById(folderId);
      console.log('reuse existing folder: ' + folderId);
    } catch (err) {
      folderId = null;
    }
  }

  if (!folderId) {
    root = DriveApp.createFolder('mena-leave - Storage');
    folderId = root.getId();
    console.log('สร้าง root folder: ' + folderId);
  }

  try {
    root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    console.log('set sharing root failed: ' + err.message);
  }

  const subFolders = {};
  DRIVE_SUBFOLDERS.forEach(function (name) {
    const subs = root.getFoldersByName(name);
    let sub;
    if (subs.hasNext()) {
      sub = subs.next();
    } else {
      sub = root.createFolder(name);
      console.log('สร้าง sub-folder: ' + name);
    }
    try {
      sub.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) { /* ignore */ }
    subFolders[name] = sub.getId();
  });

  console.log('✓ setupDrive เสร็จ');
  console.log('  DRIVE_FOLDER_ID = ' + folderId);
  return { rootId: folderId, subFolders: subFolders };
}

/**
 * ใส่ non-secret IDs ลง Script Properties (1-shot setup)
 * รันซ้ำได้ — skip empty values
 */
function setupProperties() {
  const props = PropertiesService.getScriptProperties();
  let set = 0, skipped = 0;

  Object.keys(NON_SECRET_PROPS).forEach(function (k) {
    const v = NON_SECRET_PROPS[k];
    if (!v) {
      // check ของเดิมใน properties ว่ามีอยู่แล้วไหม
      const existing = props.getProperty(k);
      if (existing) {
        console.log('keep existing: ' + k);
        return;
      }
      console.log('skip (empty): ' + k);
      skipped++;
      return;
    }
    props.setProperty(k, v);
    console.log('set: ' + k + ' = ' + v.substring(0, 20) + '...');
    set++;
  });

  console.log('✓ setupProperties — set ' + set + ' / skipped ' + skipped);
  console.log('  ยังต้องใส่ manual (secret): LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET');
}

/**
 * verifyLineSecrets() — เช็คว่าใส่ LINE secret ถูกแล้ว
 * - ไม่พิมพ์ค่าเต็มออก log (security)
 * - ลองยิง LINE API /v2/bot/info เพื่อ verify token ใช้งานได้จริง
 */
function verifyLineSecrets() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const secret = props.getProperty('LINE_CHANNEL_SECRET');

  console.log('LINE_CHANNEL_SECRET: ' + (secret ? '✓ set (length=' + secret.length + ')' : '✗ MISSING'));
  console.log('LINE_CHANNEL_ACCESS_TOKEN: ' + (token ? '✓ set (length=' + token.length + ')' : '✗ MISSING'));

  if (!token) {
    console.log('— ใส่ LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties ก่อน');
    return;
  }

  // verify จริงด้วย LINE API
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) {
      const info = JSON.parse(res.getContentText());
      console.log('✓ LINE bot ใช้งานได้:');
      console.log('  displayName: ' + info.displayName);
      console.log('  userId (bot): ' + info.userId);
      console.log('  basicId: ' + info.basicId);
      console.log('  premiumId: ' + (info.premiumId || '(none)'));
    } else {
      console.log('✗ LINE API error ' + code + ': ' + res.getContentText());
    }
  } catch (err) {
    console.log('✗ LINE API exception: ' + err.message);
  }
}

/**
 * Wrapper สำหรับ Apps Script Run dropdown (function ไม่รับ param ถึงจะโผล่ใน Run)
 * — ใส่ LINE userId ของ OWNER คนแรกแล้วกด Run
 */
function bootstrapMe() {
  return bootstrapFirstOwner('Ub47d6b519be013dbe6e83c4fbd079c56');
}

/**
 * bootstrap OWNER คนแรก — รัน 1 ครั้งหลัง setupAll() + ใส่ LINE userId ของพี่ปุ้ย
 * idempotent: ถ้ามี OWNER แล้วจะไม่สร้างใหม่
 *
 * usage:
 *   bootstrapFirstOwner('Uxxx0000000000000000000000000000')
 */
function bootstrapFirstOwner(lineUserId) {
  if (!lineUserId || !lineUserId.startsWith('U')) {
    throw new Error('lineUserId ต้องเป็น "Uxxx..." (LINE userId)');
  }

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('ยังไม่ได้รัน setupAll()');
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName('Users');

  // เช็คว่ามี OWNER อยู่แล้วไหม
  if (sh.getLastRow() >= 2) {
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const iRole = hdr.indexOf('role');
    const iLine = hdr.indexOf('line_user_id');
    for (let i = 0; i < data.length; i++) {
      if (data[i][iRole] === 'OWNER') {
        console.log('มี OWNER อยู่แล้ว: ' + data[i][iLine] + ' — skip');
        return;
      }
      if (data[i][iLine] === lineUserId) {
        console.log('user_id นี้มีแล้ว — upgrade เป็น OWNER');
        sh.getRange(i + 2, iRole + 1).setValue('OWNER');
        return;
      }
    }
  }

  const now = nowBangkok();
  const userId = 'EMP-0001';
  // [user_id, line_user_id, role, display_name, emp_code, phone, email, dept, position,
  //  is_supervisor, status, invited_by, created_at, approved_at, approved_by]
  sh.appendRow([
    userId, lineUserId, 'OWNER', 'ผู้บริหาร (bootstrap)', 'OWNER-001',
    '', '', '', '',
    true, 'active', '(system)', now, now, '(system)',
  ]);

  // สร้าง LeaveQuota row ปี current
  const year = new Date().getFullYear();
  const quotaSh = ss.getSheetByName('LeaveQuota');
  const settings = readSettings_();
  quotaSh.appendRow([
    'Q-' + year + '-' + userId, userId, year,
    Number(settings.default_sick_total || 30), 0, 0,
    Number(settings.default_personal_total || 6), 0, 0,
    Number(settings.default_vacation_total || 10), 0, 0,
    now,
  ]);

  console.log('✓ bootstrap OWNER สำเร็จ: ' + userId + ' (' + lineUserId + ')');
}

/** helper: อ่าน Settings ทุก row → object */
function readSettings_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Settings');
  const obj = {};
  if (sh.getLastRow() >= 2) {
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    data.forEach(function (row) {
      if (row[0]) obj[row[0]] = row[1];
    });
  }
  return obj;
}
