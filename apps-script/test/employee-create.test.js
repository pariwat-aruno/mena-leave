/**
 * ทดสอบ createEmployee ด้วย Sheet จำลอง — ไม่แตะ Google Sheet หรือ LINE จริง
 *
 * รัน: node apps-script/test/employee-create.test.js
 *
 * ข้อมูลทั้งหมดเป็นชื่อสมมติ เพราะ repo นี้เป็น public
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeSheet(name, headers, rows) {
  const grid = [headers.slice()].concat((rows || []).map(function (row) { return row.slice(); }));
  return {
    getName: function () { return name; },
    getLastRow: function () { return grid.length; },
    getLastColumn: function () { return headers.length; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1;
      nc = nc || 1;
      return {
        getDisplayValues: function () { return this.getValues().map(function (r) { return r.map(String); }); },
        getValues: function () {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = grid[r - 1 + i] || [];
            out.push(Array.from({ length: nc }, function (_, j) {
              return row[c - 1 + j] === undefined ? '' : row[c - 1 + j];
            }));
          }
          return out;
        },
        setValue: function (value) {
          while (grid.length < r) grid.push(Array(headers.length).fill(''));
          grid[r - 1][c - 1] = value;
        },
        setValues: function (values) {
          values.forEach(function (row, i) {
            const ri = r - 1 + i;
            while (grid.length <= ri) grid.push(Array(headers.length).fill(''));
            row.forEach(function (value, j) { grid[ri][c - 1 + j] = value; });
          });
        },
      };
    },
    appendRow: function (row) { grid.push(row.slice()); },
    objects: function () {
      return grid.slice(1).map(function (row) {
        const out = {};
        headers.forEach(function (header, i) { out[header] = row[i]; });
        return out;
      });
    },
  };
}

const USERS_HDR = [
  'user_id', 'line_user_id', 'role', 'display_name', 'emp_code', 'phone', 'email',
  'department', 'position', 'is_supervisor', 'status', 'invited_by', 'created_at',
  'approved_at', 'approved_by',
];
const APPROVERS_HDR = [
  'chain_id', 'user_id', 'approver_user_id', 'level', 'valid_from', 'valid_to', 'created_by',
];
const QUOTA_HDR = [
  'quota_id', 'user_id', 'year', 'sick_total', 'sick_used', 'sick_reserved',
  'personal_total', 'personal_used', 'personal_reserved', 'vacation_total', 'vacation_used',
  'vacation_reserved', 'updated_at',
];
const PAIRING_HDR = [
  'code_id', 'code', 'for_user_id', 'created_by', 'created_at', 'expires_at',
  'redeemed_at', 'redeemed_line_user_id', 'status',
];
const SETTINGS_HDR = ['key', 'value', 'note'];

function userRow(id, line, role, name, code, status, isSupervisor) {
  return [
    id, line, role, name, code, '', '', 'แผนกสมมติ', 'ตำแหน่งสมมติ',
    !!isSupervisor, status, '', '2026-01-01T09:00:00+07:00', '', '',
  ];
}

function makeRuntime(extraUsers) {
  const users = [
    userRow('EMP-0001', 'U-owner-fake', 'OWNER', 'ผู้บริหาร สมมติ', 'EX-001', 'active', true),
    userRow('EMP-0002', 'U-hr-fake', 'ADMIN', 'ฝ่ายบุคคล สมมติ', 'HR-001', 'active', false),
    userRow('EMP-0003', 'U-sup-fake', 'SUPERVISOR', 'หัวหน้า สมมติ', 'SUP-001', 'active', true),
    userRow('EMP-0004', '', 'OWNER', 'ผู้บริหาร สำรอง', 'EX-002', 'invited', true),
  ].concat(extraUsers || []);

  const sheets = {
    Users: makeSheet('Users', USERS_HDR, users),
    Approvers: makeSheet('Approvers', APPROVERS_HDR, []),
    LeaveQuota: makeSheet('LeaveQuota', QUOTA_HDR, []),
    Pairing_Codes: makeSheet('Pairing_Codes', PAIRING_HDR, []),
    Settings: makeSheet('Settings', SETTINGS_HDR, [
      ['default_sick_total', '30', ''],
      ['default_personal_total', '6', ''],
      ['default_vacation_total', '10', ''],
      ['pairing_code_ttl_hours', '24', ''],
    ]),
  };

  let lockHeld = false;
  const scriptProperties = {
    SHEET_ID: 'FAKE_SHEET',
    DRIVE_FOLDER_ID: 'FAKE_DRIVE',
    LINE_CHANNEL_ACCESS_TOKEN: 'FAKE_TOKEN',
    LINE_CHANNEL_SECRET: 'FAKE_SECRET',
    LIFF_ID: 'FAKE_LIFF',
  };
  const sandbox = {
    console: console,
    PropertiesService: {
      getScriptProperties: function () {
        return { getProperty: function (key) { return scriptProperties[key] || ''; } };
      },
    },
    SpreadsheetApp: {
      openById: function () {
        return { getSheetByName: function (name) { return sheets[name] || null; } };
      },
    },
    LockService: {
      getScriptLock: function () {
        return {
          waitLock: function () {
            if (lockHeld) throw new Error('lock held');
            lockHeld = true;
          },
          releaseLock: function () { lockHeld = false; },
        };
      },
    },
    CacheService: {
      getScriptCache: function () {
        return { get: function () { return null; }, put: function () {}, remove: function () {} };
      },
    },
    Utilities: {
      formatDate: function (date, timezone, pattern) {
        if (pattern === "yyyy-MM-dd'T'HH:mm:ssXXX") return '2026-09-19T10:00:00+07:00';
        if (pattern === 'yyyy-MM-dd') return '2026-09-19';
        if (pattern === 'yyyy') return '2026';
        if (pattern === 'M') return '9';
        if (pattern === 'd') return '19';
        if (pattern === 'HH:mm') return '10:00';
        return '2026-09-19T10:00:00+07:00';
      },
    },
    // ไม่ให้เทสส่งข้อความ LINE หรือเขียน log จริง
    pushMessage: function () {},
    pushText: function () {},
    buildApprovalChainSetCard: function () { return {}; },
    audit: function () {},
    logInfo: function () {},
    logWarn: function () {},
    logError: function (fnName, message, data) {
      console.error('[fake logError] ' + fnName + ': ' + message, data || '');
    },
  };

  vm.createContext(sandbox);
  [
    'Import.gs',
    'Config.gs',
    'Utils.gs',
    'Register.gs',
    'Claim.gs',
    'ApprovalChain.gs',
    'Pairing.gs',
    'Admin.gs',
    'EmployeeCreate.gs',
  ].forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  });
  sandbox.generate6DigitCode = function () { return '123456'; };

  return { sandbox: sandbox, sheets: sheets };
}

function payload(overrides) {
  return Object.assign({
    lineUserId: 'U-hr-fake',
    emp_code: '4501',
    display_name: 'พนักงาน ทดสอบ',
    department: 'ผลิตสมมติ',
    position: 'เจ้าหน้าที่สมมติ',
    phone: '0800000000',
    role: 'USER',
    issue_code: true,
  }, overrides || {});
}

let fails = 0;
function check(label, condition, extra) {
  console.log((condition ? '  ผ่าน  ' : '  ตก    ') + label +
    (condition ? '' : '  << ' + JSON.stringify(extra)));
  if (!condition) fails++;
}

console.log('=== 1) สร้างพนักงานสำเร็จ ===');
{
  const runtime = makeRuntime();
  const result = runtime.sandbox.createEmployee(payload());
  const created = runtime.sheets.Users.objects().filter(function (u) { return u.emp_code === '4501'; });
  check('ตอบกลับสำเร็จและสถานะ invited', result.ok === true && result.user.status === 'invited', result);
  check('เพิ่ม Users เพียง 1 แถว', created.length === 1, created);
  check('สร้าง LeaveQuota ให้ทันที', runtime.sheets.LeaveQuota.objects().some(function (q) {
    return q.user_id === result.user.user_id;
  }), runtime.sheets.LeaveQuota.objects());
  check('ออกรหัสจับคู่ 6 หลัก', result.pairing_code === '123456', result.pairing_code);
  const inviteText = String(result.invite_text || '');
  check('ข้อความเชิญบอก self-claim เป็นวิธีหลัก',
    inviteText.indexOf('วิธีหลัก') >= 0 && inviteText.indexOf('ผูกบัญชี') >= 0 &&
    inviteText.indexOf('รหัสพนักงาน: 4501') >= 0,
    result.invite_text);
}

console.log('\n=== 2) กันรหัสพนักงานซ้ำ แม้ชนิดข้อมูลต่างกัน ===');
{
  const runtime = makeRuntime([
    userRow('EMP-0010', '', 'USER', 'คนเดิม สมมติ', 6818, 'invited', false),
  ]);
  const before = runtime.sheets.Users.objects().length;
  const result = runtime.sandbox.createEmployee(payload({ emp_code: '6818', display_name: 'คนใหม่ สมมติ' }));
  check('numeric 6818 ตรงกับ string 6818', result.ok === false && result.error === 'emp_code_exists', result);
  check('ไม่เพิ่ม Users', runtime.sheets.Users.objects().length === before, runtime.sheets.Users.objects().length);
  check('คืนข้อมูลคนเดิมให้หน้าจอแสดง', result.existing && result.existing.user_id === 'EMP-0010', result.existing);
}

console.log('\n=== 3) แถว inactive รหัสเดียวกันไม่บล็อก ===');
{
  const runtime = makeRuntime([
    userRow('EMP-0010', '', 'USER', 'ชื่อซ้ำ แต่ปิดแล้ว', 6818, 'inactive', false),
  ]);
  const result = runtime.sandbox.createEmployee(payload({
    emp_code: '6818',
    display_name: 'ชื่อซ้ำ แต่ปิดแล้ว',
  }));
  check('สร้างแถวใหม่ได้', result.ok === true, result);
  check('มีรหัสเดียวกัน 2 แถว โดยแถวเดิม inactive',
    runtime.sheets.Users.objects().filter(function (u) { return String(u.emp_code) === '6818'; }).length === 2,
    runtime.sheets.Users.objects());
}

console.log('\n=== 4) ชื่อซ้ำต้องยืนยันก่อน ===');
{
  const runtime = makeRuntime([
    userRow('EMP-0010', '', 'USER', 'นาย สมชาย ใจดี', '5000', 'active', false),
  ]);
  const before = runtime.sheets.Users.objects().length;
  const first = runtime.sandbox.createEmployee(payload({ emp_code: '5001', display_name: 'สมชายใจดี' }));
  check('ครั้งแรกเป็นคำเตือนและยังไม่สร้าง',
    first.ok === false && first.error === 'same_name_exists' && runtime.sheets.Users.objects().length === before,
    first);
  const confirmed = runtime.sandbox.createEmployee(payload({
    emp_code: '5001', display_name: 'สมชายใจดี', confirm_same_name: true,
  }));
  check('ยืนยันแล้วสร้างได้', confirmed.ok === true && runtime.sheets.Users.objects().length === before + 1, confirmed);
}

console.log('\n=== 5) HR สร้างผู้บริหารไม่ได้ ===');
{
  const runtime = makeRuntime();
  const before = runtime.sheets.Users.objects().length;
  const result = runtime.sandbox.createEmployee(payload({ role: 'OWNER' }));
  check('ปฏิเสธด้วยกติกาผู้บริหารเท่านั้น',
    result.ok === false && result.error === 'forbidden_owner_only', result);
  check('ไม่เพิ่ม Users', runtime.sheets.Users.objects().length === before, runtime.sheets.Users.objects().length);
}

console.log('\n=== 6) เขียนสายอนุมัติด้วย setApprovalChain ===');
{
  const runtime = makeRuntime();
  const result = runtime.sandbox.createEmployee(payload({
    lineUserId: 'U-owner-fake',
    emp_code: '7001',
    display_name: 'ลูกทีม สมมติ',
    supervisor_user_id: 'EMP-0003',
    executive_user_ids: ['EMP-0001', 'EMP-0004'],
  }));
  const rows = runtime.sheets.Approvers.objects().filter(function (r) {
    return r.user_id === result.user.user_id && !r.valid_to;
  });
  check('สร้างสำเร็จ', result.ok === true, result);
  check('มีหัวหน้างาน 1 แถว',
    rows.filter(function (r) { return Number(r.level) === 1 && r.approver_user_id === 'EMP-0003'; }).length === 1,
    rows);
  check('มีผู้บริหาร 2 แถว', rows.filter(function (r) { return Number(r.level) === 3; }).length === 2, rows);
}

console.log('\n=== 7) กดซ้ำสร้างได้แถวเดียว ===');
{
  const runtime = makeRuntime();
  const request = payload({ emp_code: '8001', display_name: 'ทดสอบ กดซ้ำ' });
  const first = runtime.sandbox.createEmployee(request);
  const second = runtime.sandbox.createEmployee(request);
  const rows = runtime.sheets.Users.objects().filter(function (u) { return u.emp_code === '8001'; });
  check('ครั้งแรกสำเร็จ', first.ok === true, first);
  check('ครั้งที่สองถูก duplicate guard', second.ok === false && second.error === 'emp_code_exists', second);
  check('Users มีเพียง 1 แถว', rows.length === 1, rows);
}

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทุกข้อ'));
process.exit(fails ? 1 : 0);
