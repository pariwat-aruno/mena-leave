/**
 * ทดสอบ claimMyAccount — พนักงานผูกบัญชีไลน์เองด้วย รหัสพนักงาน + ชื่อ-นามสกุล
 * จำลอง tab Users/Settings/LeaveQuota ให้เหมือน prod แล้วดูว่ากันคนสวมสิทธิ์ได้จริงไหม
 *
 * รัน: node apps-script/test/claim.test.js
 *
 * ⭐ ห้ามใส่ชื่อพนักงานจริง — repo นี้เป็น public
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ---------- Fake Sheet ----------
function makeSheet(name, headers, rows) {
  const grid = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    getName: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getDisplayValues() { return this.getValues().map(r => r.map(v => String(v))); },
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = grid[r - 1 + i] || [];
            out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? '' : row[c - 1 + j])));
          }
          return out;
        },
        setValue(v) {
          while (grid.length < r) grid.push(Array(headers.length).fill(''));
          grid[r - 1][c - 1] = v;
        },
        setValues(vals) {
          vals.forEach((row, i) => {
            const ri = r - 1 + i;
            while (grid.length <= ri) grid.push(Array(headers.length).fill(''));
            row.forEach((v, j) => { grid[ri][c - 1 + j] = v; });
          });
        },
      };
    },
    appendRow(row) { grid.push(row.slice()); },
    _grid: grid,
    _objects() {
      return grid.slice(1).map(row => {
        const o = {};
        headers.forEach((h, j) => { o[h] = row[j]; });
        return o;
      });
    },
  };
}

const USERS_HDR = ['user_id', 'line_user_id', 'role', 'display_name', 'emp_code', 'phone', 'email',
  'department', 'position', 'is_supervisor', 'status', 'invited_by', 'created_at', 'approved_at', 'approved_by'];
const U = (id, line, role, name, code, status, sup) =>
  [id, line, role, name, code, '', '', 'แผนกสมมติ', 'ตำแหน่งสมมติ', !!sup, status, '', '2026-01-01', '', ''];

// สภาพหลังนำเข้าทะเบียน: ทุกแถวใหม่ยังไม่มี line_user_id
// ⭐ emp_code เก็บเป็น "ตัวเลข" จงใจ — Sheet แปลงเอง คนกรอกมาเป็นสตริง ต้องเทียบกันติด
const usersSheet = makeSheet('Users', USERS_HDR, [
  U('EMP-0001', 'Uowner', 'OWNER', 'เจ้าของระบบ', 'OWNER-001', 'active', true),
  U('EMP-0007', 'Ukitti', 'USER', 'พนักงานที่ผูกไลน์แล้ว', 6818, 'active'),
  U('EMP-0012', 'Uhr', 'ADMIN', 'HR ที่ผูกไลน์แล้ว', 99999999, 'active'),
  U('EMP-0020', '', 'USER', 'สมชาย ใจดี', 5502, 'invited'),
  U('EMP-0021', '', 'SUPERVISOR', 'สมหญิง มีสุข', 6909, 'invited', true),
  U('EMP-0022', '', 'USER', 'บัญชีที่ถูกปิด', 7777, 'inactive'),
  // ⭐ ของจริงบน prod: 3 แถวนี้ emp_code ซ้ำกันและชื่อเหมือนกัน (พี่ปุ้ยสั่งไม่ล้าง)
  U('EMP-0009', '', 'ADMIN', 'Hr', 'MENA Cosmetics', 'invited'),
  U('EMP-0010', '', 'ADMIN', 'Hr', 'MENA Cosmetics', 'invited'),
]);

const SETTINGS_HDR = ['key', 'value', 'note'];
const settingsSheet = makeSheet('Settings', SETTINGS_HDR, [
  ['self_claim_enabled', 'TRUE', ''],
  ['default_sick_total', '30', ''],
  ['default_personal_total', '6', ''],
  ['default_vacation_total', '10', ''],
]);

const QUOTA_HDR = ['quota_id', 'user_id', 'year', 'sick_total', 'sick_used', 'sick_reserved',
  'personal_total', 'personal_used', 'personal_reserved',
  'vacation_total', 'vacation_used', 'vacation_reserved', 'created_at'];
const quotaSheet = makeSheet('LeaveQuota', QUOTA_HDR, []);

const SHEETS = { Users: usersSheet, Settings: settingsSheet, LeaveQuota: quotaSheet };

// ---------- Fake Apps Script runtime ----------
const pushed = [];
const sandbox = {
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'SHEET' }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: n => SHEETS[n] || null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  // cache ต้อง "ไม่จำ" ระหว่างเทส ไม่งั้นแก้ Settings แล้วไม่มีผล
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Utilities: { formatDate: () => '08:30' },
  audit() {}, logInfo() {}, logWarn() {}, logError() {},
  nowBangkok: () => '2026-09-02T10:00:00+07:00',
  currentYearBangkok_: () => 2026,
  nextUserId: () => 'EMP-9999',
  // ดักที่ปลายทาง ปล่อยให้ pushToAllAdmins ตัวจริงใน Config.gs ทำงาน
  // (stub ทับจะไม่มีผล เพราะ Config.gs นิยามทับตอนโหลดอยู่แล้ว — และจะไม่ได้เทสของจริง)
  pushMessage(to, msg) { pushed.push({ to: to, msg: msg }); },
  buildRegisterPendingCard: () => ({}),
  buildClaimNoticeCard: (u) => ({ card: 'claim', user: u.user_id }),
  formatThaiDateTime: (v) => String(v),
};
vm.createContext(sandbox);
['Import.gs', 'Config.gs', 'Register.gs', 'Claim.gs'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});

// ---------- ตรวจ ----------
let fails = 0;
const check = (label, cond, extra) => {
  console.log((cond ? '  ผ่าน  ' : '  ตก    ') + label + (cond ? '' : '  << ' + JSON.stringify(extra)));
  if (!cond) fails++;
};
const claim = (line, code, name) => sandbox.claimMyAccount({
  lineUserId: line, displayName: 'ชื่อเล่นในไลน์', emp_code: code, full_name: name,
});
const rowOf = (id) => usersSheet._objects().filter(u => u.user_id === id)[0];

console.log('=== 1) ผูกสำเร็จ ===');
const r1 = claim('Usomchai', '5502', 'สมชาย ใจดี');
check('ผูกผ่าน', r1.ok === true && r1.status === 'active', r1);
check('เขียน line_user_id ลงแถวเดิม', rowOf('EMP-0020').line_user_id === 'Usomchai', rowOf('EMP-0020').line_user_id);
check('เปิดใช้งานทันที ไม่ต้องรอ HR', rowOf('EMP-0020').status === 'active', rowOf('EMP-0020').status);
check('ไม่ทับชื่อในทะเบียนด้วยชื่อเล่นในไลน์', rowOf('EMP-0020').display_name === 'สมชาย ใจดี', rowOf('EMP-0020').display_name);
check('บันทึกว่าเป็นการผูกเอง', rowOf('EMP-0020').approved_by === '(self-claim)', rowOf('EMP-0020').approved_by);
check('สร้างโควตาให้ด้วย', quotaSheet._objects().some(q => q.user_id === 'EMP-0020'), quotaSheet._objects());
check('แจ้ง HR ที่ผูกไลน์แล้ว 1 ใบ', pushed.length === 1 && pushed[0].to === 'Uhr', pushed);

console.log('\n=== 2) เทียบรหัสข้ามชนิดตัวแปร + ชื่อที่คนกรอกไม่เป๊ะ ===');
const r2 = claim('Usomying', 6909, '  นางสาว สมหญิง   มีสุข ');
check('รหัสเป็นตัวเลข/สตริงก็ต้องแมตช์ + ตัดคำนำหน้าและช่องว่างเกิน', r2.ok === true, r2);
check('หัวหน้างานยังคงธง is_supervisor', rowOf('EMP-0021').is_supervisor === true, rowOf('EMP-0021').is_supervisor);

console.log('\n=== 3) กรอกผิด ===');
const wrongName = claim('Uมิจ1', '6818', 'ใครก็ไม่รู้');
check('รหัสถูกแต่ชื่อผิด → ผูกไม่ได้', wrongName.ok === false && wrongName.error === 'no_match', wrongName);
const wrongCode = claim('Uมิจ2', '999999', 'สมชาย ใจดี');
check('ชื่อถูกแต่รหัสผิด → ผูกไม่ได้', wrongCode.ok === false && wrongCode.error === 'no_match', wrongCode);
check('ข้อความไม่บอกว่าผิดช่องไหน', wrongName.message === wrongCode.message, [wrongName.message, wrongCode.message]);

console.log('\n=== 4) กันสวมสิทธิ์ / ผูกซ้ำ ===');
const taken = claim('Uมิจ3', '5502', 'สมชาย ใจดี');
check('รหัสที่ถูกผูกไปแล้ว → ปฏิเสธ', taken.ok === false && taken.error === 'already_claimed', taken);
check('ไม่เขียนทับ line_user_id เดิม', rowOf('EMP-0020').line_user_id === 'Usomchai', rowOf('EMP-0020').line_user_id);
const again = claim('Usomchai', '5502', 'สมชาย ใจดี');
check('คนเดิมกดซ้ำ → บอกว่าผูกแล้ว ไม่พัง', again.ok === true && again.already === true, again);
check('กดซ้ำไม่สร้างโควตาเพิ่ม', quotaSheet._objects().filter(q => q.user_id === 'EMP-0020').length === 1);

console.log('\n=== 5) บัญชีที่ถูกปิด ===');
const dead = claim('Uปิด', '7777', 'บัญชีที่ถูกปิด');
check('บัญชีปิดอยู่ → ผูกไม่ได้ และบอกให้ติดต่อ HR', dead.ok === false && dead.error === 'inactive', dead);
check('ไม่แอบเปิดบัญชีให้', rowOf('EMP-0022').status === 'inactive', rowOf('EMP-0022').status);

console.log('\n=== 6) รหัสซ้ำหลายแถว (ของจริงบน prod) ===');
const dup = claim('Uhr9', 'MENA Cosmetics', 'Hr');
check('ตรงหลายแถว → ไม่เดา ให้ติดต่อ HR', dup.ok === false && dup.error === 'ambiguous', dup);
check('ไม่ผูกให้แถวไหนเลย', usersSheet._objects().filter(u => u.emp_code === 'MENA Cosmetics').every(u => !u.line_user_id));

console.log('\n=== 7) ปิดสวิตช์หลังพาเข้าครบ ===');
settingsSheet.getRange(2, 2).setValue('FALSE');
const off = claim('Uหลัง', '6909', 'สมหญิง มีสุข');
check('self_claim_enabled = FALSE → ผูกเองไม่ได้', off.ok === false && off.error === 'disabled', off);
settingsSheet.getRange(2, 2).setValue('TRUE');

console.log('\n=== 8) ลงทะเบียนเองต้องไม่สร้างแถวซ้ำทับทะเบียน ===');
const before = usersSheet._objects().length;
// รหัสที่มีในทะเบียนแต่ยังไม่มีใครผูก → ต้องไล่ไปหน้าผูกบัญชี
const dupReg = sandbox.submitRegister({
  lineUserId: 'Uใหม่', displayName: 'ใครสักคน', emp_code: '7777',
  phone: '0800000000', department: 'x', position: 'y',
});
check('รหัสพนักงานมีในทะเบียนแล้ว → ไม่สร้างแถวใหม่', dupReg.ok === false && dupReg.error === 'emp_code_exists', dupReg);
check('บอกให้ไปหน้าผูกบัญชี', String(dupReg.message).indexOf('ผูกบัญชี') >= 0, dupReg.message);

// รหัสที่ถูกผูกไปแล้ว → ต้องบอกให้ติดต่อ HR ไม่ใช่ไล่ไปผูกเอง (ผูกไม่ได้อยู่ดี)
const takenReg = sandbox.submitRegister({
  lineUserId: 'Uใหม่2', displayName: 'ใครสักคน', emp_code: '5502',
  phone: '0800000000', department: 'x', position: 'y',
});
check('รหัสที่ถูกผูกไปแล้ว → บอกให้ติดต่อฝ่ายบุคคล', takenReg.ok === false && takenReg.error === 'emp_code_taken', takenReg);
check('จำนวนแถวเท่าเดิม', usersSheet._objects().length === before, [before, usersSheet._objects().length]);

const freshBefore = usersSheet._objects().length;
const freshReg = sandbox.submitRegister({
  lineUserId: 'Uคนใหม่จริง', displayName: 'พนักงานใหม่', emp_code: 'NEW-001',
  phone: '0800000001', department: 'x', position: 'y',
});
check('คนใหม่ที่ไม่มีในทะเบียน → ยังลงทะเบียนได้ตามเดิม', freshReg.ok === true && freshReg.status === 'pending', freshReg);
check('สร้างแถวใหม่จริง', usersSheet._objects().length === freshBefore + 1);

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทุกข้อ'));
process.exit(fails ? 1 : 0);
