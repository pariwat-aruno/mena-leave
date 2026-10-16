/**
 * ทดสอบรายงานสถิติการลาและ CSV โดยจำลอง Google Sheet / Drive
 *
 * รัน: node apps-script/test/export.test.js
 *
 * ห้ามใส่ชื่อพนักงานจริง — repo นี้เป็น public
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ---------- Fake Sheet ----------
function makeSheet(name, headers, rows) {
  const grid = [headers.slice()].concat(rows.map(row => row.slice()));
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
            const source = grid[r - 1 + i] || [];
            out.push(Array.from({ length: nc }, (_, j) =>
              source[c - 1 + j] === undefined ? '' : source[c - 1 + j]));
          }
          return out;
        },
      };
    },
  };
}

function objectRow(headers, values) {
  return headers.map(header => Object.prototype.hasOwnProperty.call(values, header) ? values[header] : '');
}

const USERS_HDR = [
  'user_id', 'line_user_id', 'role', 'display_name', 'emp_code',
  'department', 'position', 'is_supervisor', 'status',
];
const usersSheet = makeSheet('Users', USERS_HDR, [
  objectRow(USERS_HDR, {
    user_id: 'EMP-0001', line_user_id: 'U-admin', role: 'ADMIN',
    display_name: 'แอดมิน ทดสอบ', emp_code: 'ADM-001', department: 'บุคคล',
    position: 'ผู้ทดสอบระบบ', status: 'active',
  }),
  objectRow(USERS_HDR, {
    user_id: 'EMP-0002', line_user_id: 'U-alpha', role: 'USER',
    display_name: 'อรุณ สมมติ', emp_code: 'TST-002', department: 'ผลิต',
    position: 'พนักงานตัวอย่าง', status: 'active',
  }),
  objectRow(USERS_HDR, {
    user_id: 'EMP-0003', line_user_id: 'U-beta', role: 'USER',
    display_name: 'พิมพ์ ทดสอบ', emp_code: 'TST-003', department: 'บรรจุ',
    position: 'พนักงานตัวอย่าง', status: 'active',
  }),
  objectRow(USERS_HDR, {
    user_id: 'EMP-0004', line_user_id: 'U-viewer', role: 'USER',
    display_name: 'กานต์ ตัวอย่าง', emp_code: 'TST-004', department: 'คลัง',
    position: 'พนักงานตัวอย่าง', status: 'active',
  }),
]);

const LEAVE_HDR = [
  'leave_id', 'user_id', 'leave_type', 'date_from', 'date_to', 'days',
  'is_emergency', 'record_type', 'final_status', 'submitted_at',
  'leave_unit', 'hours', 'time_from', 'time_to', 'pay_status',
];
const leave = values => objectRow(LEAVE_HDR, Object.assign({
  days: 1,
  is_emergency: false,
  record_type: 'leave',
  final_status: 'approved',
  submitted_at: '2026-08-20T09:00:00+07:00',
  leave_unit: 'day',
}, values));

const leavesSheet = makeSheet('LeaveRequests', LEAVE_HDR, [
  // Date object จาก Sheet และคาบขอบซ้ายของช่วงรายงาน
  leave({
    leave_id: 'LV-EDGE-START', user_id: 'EMP-0002', leave_type: 'sick',
    date_from: new Date('2026-08-29T17:00:00.000Z'), date_to: '2026-09-02', days: 4,
    is_emergency: true,
  }),
  // คาบขอบขวาของช่วงรายงาน
  leave({
    leave_id: 'LV-EDGE-END', user_id: 'EMP-0002', leave_type: 'vacation',
    date_from: '2026-09-29', date_to: new Date('2026-10-04T16:59:59.000Z'), days: 4,
  }),
  // ศุกร์ถึงจันทร์มี 4 วันปฏิทิน แต่นับวันทำงานเพียง 2 วัน
  leave({
    leave_id: 'LV-WEEKEND', user_id: 'EMP-0002', leave_type: 'sick',
    date_from: '2026-09-04', date_to: '2026-09-07', days: 2, pay_status: 'unpaid',
  }),
  leave({
    // บันทึกไว้ครึ่งวันตอนส่ง — ยอดไม่จ่ายต้องใช้ค่าที่บันทึก ไม่คำนวณวันทำงานใหม่ (P3)
    leave_id: 'LV-LEGAL', user_id: 'EMP-0003', leave_type: 'training',
    date_from: '2026-09-10', date_to: '2026-09-10', days: 0.5, pay_status: 'unpaid',
  }),
  leave({
    leave_id: 'LV-HOUR', user_id: 'EMP-0003', leave_type: 'personal',
    date_from: '2026-09-11', date_to: '2026-09-11',
    leave_unit: 'hour', hours: 4.5, time_from: '08:00', time_to: '12:30', pay_status: 'unpaid',
  }),
  leave({
    leave_id: 'LV-PENDING', user_id: 'EMP-0003', leave_type: 'vacation',
    date_from: '2026-09-14', date_to: '2026-09-14', final_status: 'pending', pay_status: 'unpaid',
  }),
  leave({
    leave_id: 'LV-REJECTED', user_id: 'EMP-0002', leave_type: 'personal',
    date_from: '2026-09-15', date_to: '2026-09-15', final_status: 'rejected', pay_status: 'unpaid',
  }),
  leave({
    leave_id: 'LV-WITHDRAWN', user_id: 'EMP-0002', leave_type: 'personal',
    date_from: '2026-09-16', date_to: '2026-09-16', final_status: 'withdrawn',
  }),
  leave({
    leave_id: 'LV-CANCELLED', user_id: 'EMP-0002', leave_type: 'personal',
    date_from: '2026-09-17', date_to: '2026-09-17', final_status: 'cancelled',
  }),
  leave({
    leave_id: 'CN-0001', user_id: 'EMP-0002', leave_type: 'personal',
    date_from: '2026-09-18', date_to: '2026-09-18', record_type: 'cancel',
  }),
]);

const SETTINGS_HDR = ['key', 'value', 'note'];
const settingsSheet = makeSheet('Settings', SETTINGS_HDR, [
  ['count_weekends_as_leave', 'FALSE', ''],
  ['work_days', '1,2,3,4,5', ''],
]);

const SHEETS = {
  Users: usersSheet,
  LeaveRequests: leavesSheet,
  Settings: settingsSheet,
};

// ---------- Fake Drive ----------
let reportsFolder = null;
let savedBlob = null;
let sharedFile = false;
let sharedFolder = false;

function makeReportsFolder() {
  return {
    setSharing() { sharedFolder = true; },
    createFile(blob) {
      savedBlob = blob;
      return {
        setSharing() { sharedFile = true; },
        getUrl() { return 'https://drive.google.com/file/d/FAKE-REPORT/view'; },
      };
    },
  };
}

const rootFolder = {
  getFoldersByName(name) {
    let used = false;
    return {
      hasNext() { return name === 'reports' && !!reportsFolder && !used; },
      next() { used = true; return reportsFolder; },
    };
  },
  createFolder(name) {
    if (name !== 'reports') throw new Error('unexpected folder: ' + name);
    reportsFolder = makeReportsFolder();
    return reportsFolder;
  },
};

// ---------- Fake Apps Script runtime ----------
function formatBangkokDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((out, part) => {
    out[part.type] = part.value;
    return out;
  }, {});
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function formatBangkokDateTime(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((out, part) => {
    out[part.type] = part.value;
    return out;
  }, {});
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' +
    parts.hour + ':' + parts.minute + ':' + parts.second + '+07:00';
}

const errors = [];
const sandbox = {
  console,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty(key) {
        const values = {
          SHEET_ID: 'FAKE-SHEET',
          DRIVE_FOLDER_ID: 'FAKE-ROOT',
          LINE_CHANNEL_ACCESS_TOKEN: 'FAKE-TOKEN',
        };
        return values[key] || '';
      },
    }),
  },
  SpreadsheetApp: {
    openById: () => ({ getSheetByName: name => SHEETS[name] || null }),
  },
  CacheService: {
    getScriptCache: () => ({ get: () => null, put() {}, remove() {} }),
  },
  Utilities: {
    formatDate(date, timeZone, pattern) {
      if (timeZone !== 'Asia/Bangkok') throw new Error('unexpected timezone');
      if (pattern === 'yyyy-MM-dd') return formatBangkokDate(date);
      if (pattern === "yyyy-MM-dd'T'HH:mm:ssXXX") return formatBangkokDateTime(date);
      if (pattern === 'HH:mm') return '08:00';
      throw new Error('unexpected date pattern: ' + pattern);
    },
    newBlob(content, mimeType, name) { return { content, mimeType, name }; },
  },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFolderById(id) {
      if (id !== 'FAKE-ROOT') throw new Error('unexpected root id');
      return rootFolder;
    },
  },
  logError(name, message, payload) { errors.push({ name, message, payload }); },
  logWarn() {},
  logInfo() {},
  leaveTypeLabel_(type) {
    const labels = {
      sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'ลาพักร้อน', training: 'ลาเพื่อรับการฝึกอบรม',
    };
    return labels[type] || type;
  },
};

vm.createContext(sandbox);
['Utils.gs', 'Config.gs', 'ApprovalChain.gs', 'Export.gs'].forEach(filename => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'), sandbox, { filename });
});

// ---------- ตรวจ ----------
let fails = 0;
function check(label, condition, extra) {
  console.log((condition ? '  ผ่าน  ' : '  ตก    ') + label + (condition ? '' : '  << ' + JSON.stringify(extra)));
  if (!condition) fails++;
}

const basePayload = {
  lineUserId: 'U-admin',
  date_from: '2026-09-01',
  date_to: '2026-09-30',
};

console.log('=== 1) ช่วงเวลาคาบขอบและวันหยุด ===');
const all = sandbox.getLeaveReport(basePayload);
const byId = id => all.rows.find(row => row.leave_id === id);
check('สร้างรายงานสำเร็จ', all.ok === true, all);
check('ใบลาคาบขอบซ้ายนับเฉพาะวันในช่วง', byId('LV-EDGE-START').days_in_period === 2, byId('LV-EDGE-START'));
check('ใบลาคาบขอบขวานับเฉพาะวันในช่วง', byId('LV-EDGE-END').days_in_period === 2, byId('LV-EDGE-END'));
check('เสาร์และอาทิตย์ไม่นับเป็นวันลา', byId('LV-WEEKEND').days_in_period === 2, byId('LV-WEEKEND'));
check('Date object ถูกแปลงตาม Asia/Bangkok', byId('LV-EDGE-START').date_from === '2026-08-30', byId('LV-EDGE-START'));

console.log('\n=== 2) กรองแผนกและรายคน ===');
const department = sandbox.getLeaveReport(Object.assign({}, basePayload, { departments: ['บรรจุ'] }));
check('กรองเฉพาะแผนกที่เลือก', department.ok && department.rows.length === 3 &&
  department.rows.every(row => row.department === 'บรรจุ'), department.rows);
const person = sandbox.getLeaveReport(Object.assign({}, basePayload, { user_ids: ['EMP-0002'] }));
check('กรองเฉพาะคนที่เลือก', person.ok && person.rows.length === 3 &&
  person.rows.every(row => row.emp_code === 'TST-002'), person.rows);

console.log('\n=== 3) ใบลาเป็นชั่วโมง ===');
const hourRow = byId('LV-HOUR');
const hourSummary = all.summary.find(row => row.emp_code === 'TST-003');
check('แถวรายชั่วโมงเก็บชั่วโมงและไม่นับวัน', hourRow.unit === 'hour' &&
  hourRow.hours === 4.5 && hourRow.days_in_period === 0, hourRow);
check('สรุปรวมชั่วโมงแยกจากยอดวัน', hourSummary.hours === 4.5 && hourSummary.personal_days === 0, hourSummary);

console.log('\n=== 4) สถานะและ record_type ===');
const includedIds = all.rows.map(row => row.leave_id);
check('ค่าเริ่มต้นรวม approved และ pending', includedIds.includes('LV-PENDING') && includedIds.length === 6, includedIds);
check('ไม่รวม rejected / withdrawn / cancelled',
  !includedIds.includes('LV-REJECTED') && !includedIds.includes('LV-WITHDRAWN') &&
  !includedIds.includes('LV-CANCELLED'), includedIds);
check('ไม่รวมเรคคอร์ดยกเลิกแม้สถานะ approved', !includedIds.includes('CN-0001'), includedIds);
const rejected = sandbox.getLeaveReport(Object.assign({}, basePayload, { statuses: ['rejected'] }));
check('รวม rejected ได้เมื่อระบุสถานะ', rejected.ok && rejected.rows.length === 1 &&
  rejected.rows[0].leave_id === 'LV-REJECTED', rejected.rows);

console.log('\n=== 5) สิทธิ์และขอบเขตวันที่ ===');
const forbidden = sandbox.getLeaveReport(Object.assign({}, basePayload, { lineUserId: 'U-viewer' }));
check('พนักงานทั่วไปถูกปฏิเสธ', forbidden.ok === false && forbidden.error === 'forbidden', forbidden);
const tooLarge = sandbox.getLeaveReport({
  lineUserId: 'U-admin', date_from: '2026-01-01', date_to: '2027-01-02',
});
check('backend จำกัดช่วงไม่เกิน 366 วัน', tooLarge.ok === false && tooLarge.error === 'range_too_large', tooLarge);

console.log('\n=== 6) ตัวกรองและไฟล์ CSV ===');
const filters = sandbox.getReportFilters({ lineUserId: 'U-admin' });
check('คืนรายชื่อแผนกและพนักงานสำหรับ UI', filters.ok &&
  filters.departments.includes('ผลิต') && filters.people.length === 4, filters);
const exported = sandbox.exportLeaveReportCsv(basePayload);
check('สร้างชื่อไฟล์ตามช่วงรายงาน', exported.ok &&
  exported.filename === 'leave-report_2026-09-01_2026-09-30.csv', exported);
check('CSV มี UTF-8 BOM และสองส่วน', savedBlob && savedBlob.content.charCodeAt(0) === 0xFEFF &&
  savedBlob.content.includes('สรุปรายบุคคล') && savedBlob.content.includes('รายละเอียดใบลา'),
  savedBlob && savedBlob.content.slice(0, 80));
check('แชร์เฉพาะไฟล์ ไม่แชร์ทั้งโฟลเดอร์รายงาน', !sharedFolder && sharedFile,
  { sharedFolder, sharedFile });
check('CSV มีคอลัมน์ จ่าย/ไม่จ่าย และยอดไม่จ่าย', savedBlob.content.includes('จ่าย/ไม่จ่าย') &&
  savedBlob.content.includes('ไม่จ่าย (วัน)') && savedBlob.content.includes('ยังไม่ระบุ'), savedBlob.content.slice(0, 400));

console.log('\n=== 7) จ่าย/ไม่จ่าย (สำหรับคิดเงินเดือน) ===');
check('แถวบอกค่า จ่าย/ไม่จ่าย', byId('LV-WEEKEND').pay_status === 'unpaid' && byId('LV-EDGE-END').pay_status === '', byId('LV-WEEKEND'));
const sum2 = all.summary.find(row => row.emp_code === 'TST-002');
const sum3 = all.summary.find(row => row.emp_code === 'TST-003');
check('สรุปรายคนรวมวัน/ชั่วโมงไม่จ่าย แยกจากยอดลา', sum2.unpaid_days === 2 && sum2.sick_days === 4 &&
  sum3.unpaid_hours === 4.5, [sum2, sum3]);
check('P2: ยอดไม่จ่ายไม่รวมใบรออนุมัติ · P3: ใช้วันที่บันทึกในใบ (0.5) ไม่คำนวณใหม่', sum3.unpaid_days === 0.5, sum3);
const withRejected = sandbox.getLeaveReport(Object.assign({}, basePayload, { statuses: ['approved', 'rejected'] }));
check('P2: ส่งสถานะรวมไม่อนุมัติ → ยอดไม่จ่ายยังนับเฉพาะใบอนุมัติแล้ว',
  withRejected.summary.find(r => r.emp_code === 'TST-002').unpaid_days === 2, withRejected.summary);
check('นับใบที่ยังไม่ระบุ (เฉพาะใบอนุมัติแล้ว)', sum2.pay_unset_count === 2 && sum3.pay_unset_count === 0, [sum2, sum3]);
const unpaidOnly = sandbox.getLeaveReport(Object.assign({}, basePayload, { pay_statuses: ['unpaid'] }));
check('กรองเฉพาะไม่จ่าย (ตารางยังแสดงใบรออนุมัติได้)', unpaidOnly.ok && unpaidOnly.rows.map(r => r.leave_id).sort().join() === 'LV-HOUR,LV-LEGAL,LV-PENDING,LV-WEEKEND', unpaidOnly.rows);
const unsetOnly = sandbox.getLeaveReport(Object.assign({}, basePayload, { pay_statuses: ['unset'] }));
check('กรองเฉพาะยังไม่ระบุ', unsetOnly.ok && unsetOnly.rows.length === 2 && unsetOnly.rows.every(r => !r.pay_status), unsetOnly.rows);
console.log('\n=== 8) Q2: ผลรวมรายละเอียด = ยอดสรุปเสมอ ===');
check('ใบเต็มช่วงในตารางใช้วันที่บันทึก (0.5)', byId('LV-LEGAL').days_in_period === 0.5, byId('LV-LEGAL'));
[all, withRejected].forEach((rep, k) => {
  rep.summary.forEach(sm => {
    const mine = rep.rows.filter(r => r.emp_code === sm.emp_code);
    const sumDays = mine.reduce((a, r) => a + r.days_in_period, 0);
    const unpaid = mine.filter(r => r.final_status === 'approved' && r.pay_status === 'unpaid' && r.unit !== 'hour')
      .reduce((a, r) => a + r.days_in_period, 0);
    check('ชุด ' + (k + 1) + ' ' + sm.emp_code + ': วันลารวม + ไม่จ่าย ตรงกับรายละเอียด',
      Math.abs(sumDays - (sm.sick_days + sm.personal_days + sm.vacation_days + sm.other_legal_days)) < 1e-9 &&
      Math.abs(unpaid - sm.unpaid_days) < 1e-9, { sm, sumDays, unpaid });
  });
});
const csvLegal = savedBlob.content.split('\r\n').find(l => l.startsWith('"LV-LEGAL"'));
check('CSV รายละเอียดใช้ค่าเดียวกัน (0.5)', csvLegal && csvLegal.split(',')[9] === '"0.5"', csvLegal);
check('ไม่มี error ถูก log ระหว่างทดสอบ', errors.length === 0, errors);

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทุกข้อ'));
process.exit(fails ? 1 : 0);
