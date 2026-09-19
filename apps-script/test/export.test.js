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
  'leave_unit', 'hours', 'time_from', 'time_to',
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
    date_from: '2026-09-04', date_to: '2026-09-07', days: 2,
  }),
  leave({
    leave_id: 'LV-LEGAL', user_id: 'EMP-0003', leave_type: 'training',
    date_from: '2026-09-10', date_to: '2026-09-10',
  }),
  leave({
    leave_id: 'LV-HOUR', user_id: 'EMP-0003', leave_type: 'personal',
    date_from: '2026-09-11', date_to: '2026-09-11',
    leave_unit: 'hour', hours: 4.5, time_from: '08:00', time_to: '12:30',
  }),
  leave({
    leave_id: 'LV-PENDING', user_id: 'EMP-0003', leave_type: 'vacation',
    date_from: '2026-09-14', date_to: '2026-09-14', final_status: 'pending',
  }),
  leave({
    leave_id: 'LV-REJECTED', user_id: 'EMP-0002', leave_type: 'personal',
    date_from: '2026-09-15', date_to: '2026-09-15', final_status: 'rejected',
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
check('ไม่มี error ถูก log ระหว่างทดสอบ', errors.length === 0, errors);

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทุกข้อ'));
process.exit(fails ? 1 : 0);
