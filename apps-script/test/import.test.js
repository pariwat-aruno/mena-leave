/**
 * ทดสอบ importEmployees แบบไม่ต้องแตะ Sheet จริง
 * จำลอง tab Users ให้เหมือน prod (10 แถว) แล้วดูว่ารันแล้วได้อะไร + รันซ้ำแล้วนิ่งไหม
 *
 * รัน: node apps-script/test/import.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// ⭐ ใช้ข้อมูลสมมติที่มีโครงเหมือนของจริง (57 แถว · รหัสซ้ำกับของเดิม 1 ตัว · หัวหน้า 5 คน)
//    ห้ามอ่านไฟล์ข้อมูลพนักงานจริง — repo นี้เป็น public
const PAYLOAD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.employees.json'), 'utf8'));

// ---------- Fake Sheet ----------
function makeSheet(name, headers, rows) {
  const grid = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    getName: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = grid[r - 1 + i] || [];
            out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? '' : row[c - 1 + j])));
          }
          return out;
        },
        setValues(vals) {
          vals.forEach((row, i) => {
            const ri = r - 1 + i;
            while (grid.length <= ri) grid.push(Array(headers.length).fill(''));
            row.forEach((v, j) => { grid[ri][c - 1 + j] = v; });
          });
        },
        setValue(v) {
          while (grid.length < r) grid.push(Array(headers.length).fill(''));
          grid[r - 1][c - 1] = v;
        },
      };
    },
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

// สถานะ prod จริง ณ 25 ส.ค. 2569 — emp_code ของ 6818 เก็บเป็น "ตัวเลข" จงใจ (Sheet แปลงเอง)
const U = (id, line, role, name, code, dept, pos, sup, status) =>
  [id, line, role, name, code, '', '', dept, pos, sup, status, '', '2026-01-01', '', ''];
const usersSheet = makeSheet('Users', USERS_HDR, [
  U('EMP-0001', 'Ub47d', 'OWNER', 'เจ้าของระบบ', 'OWNER-001', '', '', true, 'active'),
  U('EMP-0005', 'Uann', 'OWNER', 'ผู้บริหารเดิม', 1001, 'สำนักงาน', 'ธุรการ', true, 'active'),
  U('EMP-0006', 'Umena', 'USER', 'บัญชีทดสอบเก่า', 12345, 'สำนักงาน', 'ตำแหน่งเดิม', false, 'active'),
  U('EMP-0007', 'Ukitti', 'USER', 'พนักงานเดิมที่ผูกไลน์แล้ว', 6818, 'บุคคล', 'Hr Specialist', false, 'active'),
  U('EMP-0008', 'Ujk', 'USER', 'JK_Jacky', 'Test', 'Test', 'Test', false, 'active'),
  U('EMP-0009', '', 'ADMIN', 'Hr', 'MENA Cosmetics', 'Hr', 'Hr', false, 'invited'),
  U('EMP-0010', '', 'ADMIN', 'Hr', 'MENA Cosmetics', 'Hr', 'Hr', false, 'invited'),
  U('EMP-0011', '', 'ADMIN', 'Hr', 'MENA Cosmetics', 'Hr', 'Hr', false, 'invited'),
  U('EMP-0012', 'Uhr', 'ADMIN', 'HR เดิม', 99999999, 'Hr', 'Hr', false, 'active'),
  U('EMP-0013', 'Unor', 'SUPERVISOR', 'หัวหน้าเดิม', 8888, 'สำนักงาน', '-', true, 'active'),
]);
const APV_HDR = ['chain_id', 'user_id', 'approver_user_id', 'level', 'valid_from', 'valid_to', 'created_by'];
const apvSheet = makeSheet('Approvers', APV_HDR, [
  // ของเดิมที่เคยตั้งไว้: mena มีหัวหน้าเป็นนรวดี
  ['APV-0001', 'EMP-0006', 'EMP-0013', 1, '2026-08-01', '', 'EMP-0001'],
]);

const SHEETS = { Users: usersSheet, Approvers: apvSheet };

// ---------- Fake Apps Script runtime ----------
const sandbox = {
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'SHEET' }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: n => SHEETS[n] || null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: () => '2026-08-25T10:00:00+07:00' },
  audit() {}, logInfo() {}, logWarn() {}, logError() {},
  nowBangkok: () => '2026-08-25T10:00:00+07:00',
  padLeft_: (n, w) => String(n).padStart(w, '0'),
  findUserByLineId_(line) {
    return usersSheet._objects().filter(o => o.line_user_id === line)[0] || null;
  },
  findUserByUserId_(id) {
    return usersSheet._objects().filter(o => o.user_id === id)[0] || null;
  },
  isAdmin: () => true,
  createPairingCode: () => ({ code: '123456', expiresAt: 'x' }),
  buildInviteText_: () => 'invite',
  ROLES: { OWNER: 'OWNER', ADMIN: 'ADMIN', SUPERVISOR: 'SUPERVISOR', SPECIAL: 'SPECIAL', USER: 'USER', VISITOR: 'VISITOR' },
  ASSIGNABLE_ROLES: ['USER', 'SPECIAL', 'SUPERVISOR', 'ADMIN', 'OWNER'],
  APPROVER_LEVEL_SUPERVISOR: 1,
  APPROVER_LEVEL_EXECUTIVE: 3,
  readApprovers_() {
    const hdr = APV_HDR;
    const rows = apvSheet._objects().map((o, i) => Object.assign({}, o, { _rowNumber: i + 2 }));
    return { rows, hdr, sh: apvSheet };
  },
  updateRowByHeader_(sh, rowNumber, obj) {
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    Object.keys(obj).forEach(k => {
      const i = hdr.indexOf(k);
      if (i < 0) throw new Error('ไม่มีคอลัมน์ ' + k);
      sh.getRange(rowNumber, i + 1).setValue(obj[k]);
    });
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'Import.gs'), 'utf8'), sandbox);

// ---------- ตรวจ ----------
let fails = 0;
const check = (label, cond, extra) => {
  console.log((cond ? '  ผ่าน  ' : '  ตก    ') + label + (cond ? '' : '  << ' + JSON.stringify(extra)));
  if (!cond) fails++;
};
const call = (dry) => sandbox.importEmployees({ lineUserId: 'Ub47d', rows: PAYLOAD.rows, dry_run: dry });

console.log('=== 1) พรีวิว (dry run) ===');
const pre = call(true);
console.log('   ', JSON.stringify(pre.summary, null, 0).slice(0, 400));
check('เป็นโหมดพรีวิว', pre.dry_run === true);
check('ไม่เขียนอะไรลง Users เลย', usersSheet.getLastRow() === 11, usersSheet.getLastRow());
check('สร้างใหม่ 56 คน (57 แถว ลบคนที่มีแถวอยู่แล้ว 1 คน)', pre.summary.create === 56, pre.summary.create);
check('อัปเดตของเดิม 1 คน', pre.summary.update === 1, pre.summary.update);
// EMP-0009/10/11 มี emp_code ซ้ำกันอยู่เดิมบน prod (พี่ปุ้ยเลือกไม่ล้าง) — ต้องเตือน ไม่ใช่พัง
check('เตือนรหัสซ้ำของเดิม 2 ข้อ ไม่มีปัญหาอื่น',
  pre.summary.problems.length === 2 && pre.summary.problems.every(m => m.indexOf('MENA Cosmetics') >= 0),
  pre.summary.problems);
check('ไม่ไปแก้ธงหัวหน้าของแถวเดิมที่ไม่เกี่ยว', pre.summary.supervisor_flag_add === 0, pre.summary.supervisor_flag_add);
const kitti = pre.plan.filter(p => p.emp_code === '6818')[0];
check('6818 จับคู่กับ EMP-0007 ไม่สร้างซ้ำ', kitti && kitti.user_id === 'EMP-0007' && kitti.action === 'update', kitti);
check('6818 ถูกเลื่อนเป็นหัวหน้างาน', kitti && kitti.changes.role === 'SUPERVISOR', kitti && kitti.changes);

console.log('\n=== 2) เขียนจริง ===');
const run = call(false);
console.log('   ', JSON.stringify(run.summary, null, 0).slice(0, 400));
const users = usersSheet._objects();
check('Users มี 66 แถว (10 เดิม + 56 ใหม่)', users.length === 66, users.length);
const impCodes = PAYLOAD.rows.map(r => String(r.emp_code).trim());
const codes = users.map(u => String(u.emp_code).trim()).filter(c => impCodes.indexOf(c) >= 0);
check('รหัสที่นำเข้าไม่ซ้ำกันเลยสักตัว', new Set(codes).size === codes.length && codes.length === 57,
  [codes.length, codes.filter((c, i) => codes.indexOf(c) !== i)]);
const ids = users.map(u => u.user_id);
check('ไม่มี user_id ซ้ำ', new Set(ids).size === ids.length, ids.filter((c, i) => ids.indexOf(c) !== i));

const k2 = users.filter(u => String(u.emp_code) === '6818')[0];
check('พนักงานเดิมยังผูกไลน์เดิมอยู่ ไม่โดนล้าง', k2.line_user_id === 'Ukitti', k2.line_user_id);
check('พนักงานเดิมยัง active (ไม่โดนเปลี่ยนเป็น invited)', k2.status === 'active', k2.status);
check('พนักงานเดิมเป็นหัวหน้างาน + ติดธง', k2.role === 'SUPERVISOR' && k2.is_supervisor === true, [k2.role, k2.is_supervisor]);

const exec1 = users.filter(u => u.emp_code === 'EXEC-01')[0];
check('ผู้บริหารสร้างเป็น role OWNER', exec1 && exec1.role === 'OWNER', exec1 && exec1.role);
check('ผู้บริหารติดธงหัวหน้า (ไม่งั้นไม่เห็นใบลาลูกทีมตัวเอง)', exec1 && exec1.is_supervisor === true, exec1 && exec1.is_supervisor);
check('คนใหม่ status = invited', users.filter(u => u.user_id === 'EMP-0020')[0].status === 'invited');
check('คนใหม่ยังไม่มี line_user_id', users.filter(u => u.user_id === 'EMP-0020')[0].line_user_id === '');

const apv = apvSheet._objects().filter(r => !r.valid_to);
const l1 = apv.filter(r => Number(r.level) === 1);
const l3 = apv.filter(r => Number(r.level) === 3);
// 55 คนที่นำเข้า (ผู้บริหาร 2 คนไม่มีหัวหน้า) + สายเดิมของ mena ที่ค้างอยู่ 1 แถว
check('สายชั้น 1 = 55 ใหม่ + 1 เดิม', l1.length === 56, l1.length);
check('สายชั้น 3 = 55 คน × 2 ผู้บริหาร = 110 แถว', l3.length === 110, l3.length);
check('สายเดิมของบัญชีที่ไม่อยู่ในไฟล์ (EMP-0006) ไม่ถูกแตะ', apv.some(r => r.user_id === 'EMP-0006' && r.approver_user_id === 'EMP-0013'));
const execIds = users.filter(u => String(u.emp_code).startsWith('EXEC-')).map(u => u.user_id);
check('ไม่มีใครเป็นผู้อนุมัติของตัวเอง', !apv.some(r => r.user_id === r.approver_user_id));
check('ผู้บริหารไม่ถูกตั้งเป็นผู้บริหารของตัวเอง', !l3.some(r => execIds.indexOf(r.user_id) >= 0));
const chainIds = apvSheet._objects().map(r => r.chain_id);
check('chain_id ไม่ซ้ำ', new Set(chainIds).size === chainIds.length);

console.log('\n=== 3) รันซ้ำรอบสอง (ต้องนิ่ง) ===');
const again = call(false);
console.log('   ', JSON.stringify(again.summary, null, 0).slice(0, 300));
check('ไม่สร้างใครเพิ่ม', again.summary.create === 0, again.summary.create);
check('ไม่แก้ใครเพิ่ม', again.summary.update === 0, again.summary.update);
check('ไม่เพิ่มสายอนุมัติ', again.summary.chain_add === 0, again.summary.chain_add);
check('ไม่ปิดสายอนุมัติ', again.summary.chain_close === 0, again.summary.chain_close);
check('Users ยังเท่าเดิม 66 แถว', usersSheet._objects().length === 66, usersSheet._objects().length);

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทุกข้อ'));
process.exit(fails ? 1 : 0);
