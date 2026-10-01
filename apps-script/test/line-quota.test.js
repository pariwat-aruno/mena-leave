/**
 * โควตาข้อความไลน์รายเดือนหมด (ลูกค้าแจ้ง 1 ต.ค. 69)
 *   อาการ: ใบลาค้าง 4-5 วัน หัวหน้า/ผู้บริหารไม่ได้การ์ด · ขึ้นเดือนใหม่ HR ได้ "เตือนครั้งที่ 14" เป็นข้อความแรก
 *   ต้องได้: ไม่ยิงซ้ำตอนโควตาหมด · จดไว้ให้ HR เห็น · ระบบเตือนไม่นับครั้งที่ส่งไม่ออก
 *
 * รัน: node apps-script/test/line-quota.test.js
 * ⭐ ชื่อสมมติทั้งหมด — repo นี้เป็น public
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeSheet(headers, rows) {
  const grid = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
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
        setValue(v) { grid[r - 1][c - 1] = v; },
      };
    },
    appendRow(row) { grid.push(row.slice()); },
    _setCell(r, h, v) { grid[r - 1][grid[0].indexOf(h)] = v; },
    _objects() {
      return grid.slice(1).map(row => {
        const o = {};
        grid[0].forEach((h, j) => { o[h] = row[j] === undefined ? '' : row[j]; });
        return o;
      });
    },
  };
}

const users = makeSheet(['user_id', 'line_user_id', 'role', 'display_name', 'is_supervisor', 'status'], [
  ['EMP-0001', 'Usup', 'SUPERVISOR', 'หัวหน้าสมมติ', true, 'active'],
  ['EMP-0002', 'Uemp', 'USER', 'พนักงานสมมติ', false, 'active'],
  ['EMP-0003', 'Uhr', 'ADMIN', 'ฝ่ายบุคคลสมมติ', false, 'active'],
]);
const approvers = makeSheet(['chain_id', 'user_id', 'approver_user_id', 'level', 'valid_from', 'valid_to', 'created_by'], [
  ['APV-1', 'EMP-0002', 'EMP-0001', 1, '2026-01-01', '', 'seed'],
]);
const leaves = makeSheet(['leave_id', 'user_id', 'leave_type', 'date_from', 'date_to', 'days',
  'stage1_status', 'stage1_at', 'stage2_status', 'stage2_at', 'stage3_status', 'stage3_at',
  'final_status', 'submitted_at', 'record_type', 'last_reminded_at', 'reminder_count'], [
  // ส่งวันจันทร์ 9 โมง ค้างชั้นหัวหน้า — ตอนรันเทสคือวันอังคารบ่าย เกิน 4 ชม.ทำงานแล้ว
  ['LV-1', 'EMP-0002', 'sick', '2026-09-28', '2026-09-28', 1, 'pending', '', 'pending', '', 'pending', '',
   'pending', '2026-09-28T09:00:00+07:00', 'leave', '', 0],
]);
const settings = makeSheet(['key', 'value', 'note'], [
  ['work_start', '08:30', ''], ['work_end', '17:30', ''], ['work_days', '1,2,3,4,5,6', ''], ['reminder_hours', '4', ''],
]);
const SHEETS = { Users: users, Approvers: approvers, LeaveRequests: leaves, Settings: settings };

function fmt(d, tz, pattern) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const dow = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
  return pattern
    .replace('yyyy-MM-dd', `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`)
    .replace(/^u$/, String(dow)).replace(/^H$/, String(t.getUTCHours())).replace(/^m$/, String(t.getUTCMinutes()));
}

// ---------- LINE ปลอม ----------
const line = { quotaLimit: 300, used: 300, pushCalls: 0 };
function fakeFetch(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  if (/\/message\/quota\/consumption$/.test(url)) return res(200, { totalUsage: line.used });
  if (/\/message\/quota$/.test(url)) return res(200, { type: 'limited', value: line.quotaLimit });
  if (/\/message\/push$/.test(url)) {
    line.pushCalls++;
    if (line.used >= line.quotaLimit) return res(429, { message: 'You have reached your monthly limit.' });
    line.used++;
    return res(200, {});
  }
  throw new Error('unexpected url ' + url);
}

const props = { LINE_CHANNEL_ACCESS_TOKEN: 'tok', SHEET_ID: 'sheet', DRIVE_FOLDER_ID: 'drive' };
const errors = [];
const sandbox = {
  console, Math, Date, JSON,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = v; },
    deleteProperty: k => { delete props[k]; },
    getProperties: () => Object.assign({}, props),
  }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: n => SHEETS[n] || null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Utilities: { formatDate: fmt, sleep() {} },
  UrlFetchApp: { fetch: fakeFetch },
  audit() {}, logInfo() {}, logWarn() {}, logError(f, m) { errors.push(f + ': ' + m); },
};
vm.createContext(sandbox);
['Utils.gs', 'Config.gs', 'FlexCard.gs', 'LeaveExtras.gs', 'ApprovalChain.gs', 'Approval.gs', 'LineApi.gs', 'Reminder.gs']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));
sandbox.nowBangkok = () => '2026-09-29T14:00:00+07:00';
sandbox.logError = (f, m) => { errors.push(f + ': ' + m); };

let fails = 0;
const check = (label, cond, extra) => {
  console.log((cond ? '  ผ่าน  ' : '  ตก    ') + label + (cond ? '' : '  << ' + JSON.stringify(extra)));
  if (!cond) fails++;
};
const leave = () => leaves._objects()[0];

console.log('=== 1) โควตาเดือนหมด → ยิงครั้งเดียวแล้วหยุด ไม่ยิงซ้ำ 3 รอบ ===');
line.pushCalls = 0;
const r1 = sandbox.pushMessage('Usup', { type: 'text', text: 'ทดสอบ' });
check('ยิงไลน์แค่ 1 ครั้ง', line.pushCalls === 1, line.pushCalls);
check('บอกผู้เรียกว่าโควตาหมด', r1 && r1.error === 'monthly_limit', r1);
check('จดเวลาที่โควตาหมดไว้ให้ HR เห็น', !!props.LINE_MONTHLY_LIMIT_AT, props);
const nErr = errors.length;
sandbox.pushMessage('Usup', { type: 'text', text: 'ทดสอบ' });
check('จด log ครั้งเดียว ไม่ซ้ำทุกข้อความ', errors.length === nErr, errors.slice(nErr));

console.log('\n=== 2) ระบบเตือนซ้ำตอนโควตาหมด → ไม่นับครั้ง ไม่ยิง ===');
line.pushCalls = 0;
const t2 = sandbox.hourlyReminderTick({ force: true });
check('ไม่ยิงไลน์เลย', line.pushCalls === 0, line.pushCalls);
check('ครั้งที่เตือนยังเป็น 0', Number(leave().reminder_count) === 0, leave().reminder_count);
check('บอกว่าข้ามเพราะโควตาหมด', t2 && t2.skipped === 'line_quota_exhausted', t2);

console.log('\n=== 3) ขึ้นเดือนใหม่/อัปเกรดแล้ว → เตือนได้ตามปกติ และล้างธงโควตาหมด ===');
line.used = 0;
const t3 = sandbox.hourlyReminderTick({ force: true });
check('เตือนหัวหน้า 1 ข้อความ', t3.reminded === 1 && line.pushCalls === 1, { t3, calls: line.pushCalls });
check('การ์ดแรกที่หัวหน้าเห็นคือ "เตือนครั้งที่ 1"', Number(leave().reminder_count) === 1, leave().reminder_count);
check('ล้างธงโควตาหมดเมื่อส่งได้อีก', !props.LINE_MONTHLY_LIMIT_AT, props);

console.log('\n=== 4) แดชบอร์ด HR อ่านโควตาได้ ===');
line.used = 250;
const q4 = sandbox.getLineMessageQuota_();
check('คืนจำนวนที่ใช้/เหลือ', q4.ok && q4.limit === 300 && q4.used === 250 && q4.remaining === 50, q4);

console.log('\n=== 5) โควตาเหลือ 1 แต่ต้องเตือน 2 ใบ → ใบที่ส่งไม่ออกไม่ถูกนับ ===');
leaves._setCell(2, 'last_reminded_at', '2026-09-28T09:00:00+07:00');
leaves.appendRow(['LV-2', 'EMP-0002', 'sick', '2026-09-30', '2026-09-30', 1, 'pending', '', 'pending', '', 'pending', '',
  'pending', '2026-09-28T09:00:00+07:00', 'leave', '', 0]);
line.used = 299; line.pushCalls = 0;
sandbox.hourlyReminderTick({ force: true });
const byId = id => leaves._objects().find(l => l.leave_id === id);
check('ใบแรกส่งได้ นับเป็นครั้งที่ 2', Number(byId('LV-1').reminder_count) === 2, byId('LV-1'));
check('ใบที่สองส่งไม่ออก ครั้งที่เตือนยังเป็น 0', Number(byId('LV-2').reminder_count) === 0, byId('LV-2'));
check('ใบที่สองยังไม่ถูกจดว่าเตือนแล้ว', byId('LV-2').last_reminded_at === '', byId('LV-2').last_reminded_at);

console.log(fails ? `\n✗ ตก ${fails} ข้อ` : '\n✓ ผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
