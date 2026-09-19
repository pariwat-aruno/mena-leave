/**
 * ทดสอบของที่เพิ่ม 19 ก.ย. 69 — ขับฟังก์ชันจริงบนชีตจำลอง
 *   ลาเป็นชั่วโมง · ลาป่วยวันเดียวกัน · ลาป่วยส่งก่อนแนบทีหลัง · ขอเอกสารเพิ่ม
 *   ผู้อนุมัติขั้นแรกเป็นผู้บริหาร · ผู้บริหารในสายรับใบไม่ได้/เงียบ → HR · ผูกบัญชีเมื่อมีแถวซ้ำที่ปิดแล้ว
 *
 * รัน: node apps-script/test/leave-flow.test.js
 * ⭐ ชื่อสมมติทั้งหมด — repo นี้เป็น public
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ---------- Fake Sheet (คอลัมน์ขยายได้ เพื่อเทส ensureSheetColumns_) ----------
function makeSheet(name, headers, rows) {
  const grid = [headers.slice()].concat(rows.map(r => r.slice()));
  let maxCols = headers.length;
  const width = () => grid[0].length;
  return {
    getName: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => width(),
    getMaxColumns: () => maxCols,
    insertColumnsAfter(_, n) { maxCols += n; },
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
          if (c > maxCols) throw new Error('เขียนเกินขอบชีต ' + name);
          while (grid.length < r) grid.push([]);
          grid[r - 1][c - 1] = v;
        },
        setValues(vals) {
          vals.forEach((row, i) => row.forEach((v, j) => {
            if (c + j > maxCols) throw new Error('เขียนเกินขอบชีต ' + name);
            while (grid.length <= r - 1 + i) grid.push([]);
            grid[r - 1 + i][c - 1 + j] = v;
          }));
        },
      };
    },
    appendRow(row) {
      if (row.length > maxCols) throw new Error('appendRow เกินขอบชีต ' + name);
      grid.push(row.slice());
    },
    _objects() {
      return grid.slice(1).map(row => {
        const o = {};
        grid[0].forEach((h, j) => { o[h] = row[j] === undefined ? '' : row[j]; });
        return o;
      });
    },
  };
}

const USERS_HDR = ['user_id', 'line_user_id', 'role', 'display_name', 'emp_code', 'phone', 'email',
  'department', 'position', 'is_supervisor', 'status', 'invited_by', 'created_at', 'approved_at', 'approved_by'];
const U = (id, line, role, name, code, status, sup) =>
  [id, line, role, name, code, '', '', 'แผนกสมมติ', 'ตำแหน่งสมมติ', !!sup, status, '', '2026-01-01', '', ''];

const users = makeSheet('Users', USERS_HDR, [
  U('EMP-0001', 'Uboss', 'OWNER', 'ผู้บริหารเอ', 'EXEC-01', 'active', true),        // ผู้บริหารที่รับใบได้
  U('EMP-0002', 'Uother', 'OWNER', 'ผู้บริหารนอกสาย', '1001', 'active'),              // คนที่เคยได้ใบผิดสาย
  U('EMP-0003', '', 'OWNER', 'ผู้บริหารบี', '4501', 'invited', true),               // ยังไม่ผูกไลน์
  U('EMP-0004', 'Uhr', 'ADMIN', 'ฝ่ายบุคคลหนึ่ง', '9001', 'active'),
  U('EMP-0010', 'Usup', 'SUPERVISOR', 'หัวหน้าไลน์ผลิต', '5502', 'active', true),
  U('EMP-0011', 'Uemp', 'USER', 'พนักงานชั่งของ', '6723', 'active'),
  U('EMP-0012', 'Uhrstaff', 'SUPERVISOR', 'เจ้าหน้าที่บุคคล', '6818', 'active', true), // หัวหน้าเป็นผู้บริหาร
  U('EMP-0013', 'Umaid', 'USER', 'แม่บ้าน', '6939', 'active'),                       // หัวหน้าเป็นผู้บริหารที่ยังไม่ผูกไลน์
  U('EMP-0014', 'Uemp2', 'USER', 'พนักงานคลัง', '7001', 'active'),                   // ผู้บริหารในสายรับได้
  // แถวซ้ำที่ HR ปิดทิ้งแล้ว (เหมือน prod EMP-0070..0075)
  U('EMP-0070', '', 'SUPERVISOR', 'ผู้บริหารบี', '4501', 'inactive', true),
  U('EMP-0071', '', 'SUPERVISOR', 'ผู้บริหารบี', '4501', 'inactive', true),
]);

const APPROVERS_HDR = ['chain_id', 'user_id', 'approver_user_id', 'level', 'valid_from', 'valid_to', 'created_by'];
const A = (id, u, a, lv) => [id, u, a, lv, '2026-01-01', '', 'seed'];
const approvers = makeSheet('Approvers', APPROVERS_HDR, [
  A('APV-1', 'EMP-0011', 'EMP-0010', 1), A('APV-2', 'EMP-0011', 'EMP-0003', 3),   // ชั่งของ: ผู้บริหารในสายยังไม่ผูกไลน์
  A('APV-3', 'EMP-0012', 'EMP-0001', 1), A('APV-4', 'EMP-0012', 'EMP-0001', 3),   // HR-staff: หัวหน้าคือผู้บริหาร
  A('APV-5', 'EMP-0013', 'EMP-0003', 1),                                          // หัวหน้าคือผู้บริหารที่ยังไม่ผูกไลน์
  A('APV-6', 'EMP-0014', 'EMP-0010', 1), A('APV-7', 'EMP-0014', 'EMP-0001', 3),
]);

// ⭐ หัวตารางเก่า (ยังไม่มีคอลัมน์ใหม่) — โค้ดใหม่ต้องเติมให้เอง
const LEAVE_HDR_OLD = ['leave_id', 'user_id', 'leave_type', 'date_from', 'date_to', 'days',
  'is_retroactive', 'reason', 'gps_lat', 'gps_lng', 'gps_accuracy', 'attachment_url',
  'stage1_required', 'stage1_status', 'stage1_by', 'stage1_at', 'stage1_note',
  'stage2_status', 'stage2_by', 'stage2_at', 'stage2_note',
  'stage3_status', 'stage3_by', 'stage3_at', 'stage3_note',
  'final_status', 'submitted_at', 'gps_missing_reason', 'is_emergency', 'emergency_reason',
  'record_type', 'parent_leave_id', 'last_reminded_at', 'reminder_count'];
const leaves = makeSheet('LeaveRequests', LEAVE_HDR_OLD, []);

const settings = makeSheet('Settings', ['key', 'value', 'note'], [
  ['default_sick_total', '30', ''], ['default_personal_total', '6', ''], ['default_vacation_total', '10', ''],
  ['work_start', '08:30', ''], ['work_end', '17:30', ''], ['work_days', '1,2,3,4,5,6', ''],
  ['gps_required', 'FALSE', ''], ['reminder_hours', '4', ''], ['emergency_reason_min', '10', ''],
]);
const rules = makeSheet('LeaveRules', ['rule_id', 'leave_type', 'advance_notice_days', 'max_consecutive_days',
  'doc_required_above_days', 'note', 'is_active', 'updated_at', 'updated_by', 'allow_emergency'], [
  ['R-1', 'sick', 1, 0, 3, '', true, '', '', true],
  ['R-2', 'personal', 3, 0, 0, '', true, '', '', true],
]);
const quota = makeSheet('LeaveQuota', ['quota_id', 'user_id', 'year', 'sick_total', 'sick_used', 'sick_reserved',
  'personal_total', 'personal_used', 'personal_reserved', 'vacation_total', 'vacation_used', 'vacation_reserved',
  'updated_at'], []);
const SHEETS = { Users: users, Approvers: approvers, LeaveRequests: leaves, Settings: settings,
  LeaveRules: rules, LeaveQuota: quota };

// ---------- Fake runtime ----------
const TODAY = '2026-09-21';   // จันทร์
function fmt(d, tz, pattern) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);   // เวลาไทย
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const dow = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
  return pattern
    .replace("yyyy-MM-dd'T'HH:mm:ssXXX", `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:00+07:00`)
    .replace('yyyy-MM-dd', `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`)
    .replace('HH:mm', `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`)
    .replace(/^u$/, String(dow)).replace(/^H$/, String(t.getUTCHours())).replace(/^m$/, String(t.getUTCMinutes()));
}
const pushed = [];
let leaveSeq = 0;
const sandbox = {
  console, Math, Date, JSON,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'X' }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: n => SHEETS[n] || null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Utilities: { formatDate: fmt },
  audit() {}, logInfo() {}, logWarn(f, m) { if (process.env.DBG) console.log('WARN', f, m); }, logError(f, m) { if (process.env.DBG) console.log('ERR', f, m); },
  nowBangkok: () => TODAY + 'T10:00:00+07:00',
  todayBangkok: () => TODAY,
  nextLeaveId: () => 'LV-T-' + (++leaveSeq),
  uploadImage: (b64, name) => 'https://drive.google.com/file/d/FAKE-' + name + '/view',
  pushMessage(to, msg) { pushed.push({ to, msg }); },
};
vm.createContext(sandbox);
['Utils.gs', 'Setup.gs', 'Config.gs', 'DriveStore.gs', 'Import.gs', 'Register.gs', 'Claim.gs', 'Quota.gs', 'Rules.gs',
 'FlexCard.gs', 'LeaveExtras.gs', 'ApprovalChain.gs', 'Approval.gs', 'LeaveRequest.gs', 'Reminder.gs']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));
// stub หลังโหลด — ของจริงใน Utils ใช้เวลาเครื่อง
sandbox.nowBangkok = () => TODAY + 'T10:00:00+07:00';
sandbox.todayBangkok = () => TODAY;
sandbox.nextLeaveId = () => 'LV-T-' + (++leaveSeq);
sandbox.currentYearBangkok_ = () => 2026;
sandbox.uploadImage = (b64, name) => 'https://drive.google.com/file/d/FAKE-' + name + '/view';

let fails = 0;
const check = (label, cond, extra) => {
  console.log((cond ? '  ผ่าน  ' : '  ตก    ') + label + (cond ? '' : '  << ' + JSON.stringify(extra)));
  if (!cond) fails++;
};
const row = id => leaves._objects().find(l => l.leave_id === id);
const q = uid => quota._objects().find(x => x.user_id === uid && Number(x.year) === 2026);
const pushedTo = (line, since) => pushed.slice(since).filter(p => p.to === line);
const alt = p => (p.msg && p.msg.altText) || '';
const submit = (line, extra) => sandbox.submitLeave(Object.assign({
  lineUserId: line, leave_type: 'sick', date_from: TODAY, date_to: TODAY, reason: 'ปวดหัวมาก',
}, extra));
const decide = (line, id, stage, decision, note) =>
  sandbox.approveLeave({ lineUserId: line, leave_id: id, stage, decision, note });

console.log('=== 1) ลาป่วยวันนี้ ไม่ต้องติ๊กฉุกเฉิน ===');
const r1 = submit('Uemp2');
check('ส่งได้', r1.ok === true, r1);
check('เติมคอลัมน์ใหม่ให้ชีตเก่าเอง', leaves._objects()[0].hasOwnProperty('leave_unit') &&
  leaves._objects()[0].hasOwnProperty('hr_fallback'), Object.keys(leaves._objects()[0]));
check('ติดธงลากะทันหัน + เหตุผลอัตโนมัติ', row(r1.leave_id).is_emergency === true &&
  /กะทันหัน/.test(row(r1.leave_id).emergency_reason), row(r1.leave_id));
const r1b = submit('Uemp2', { leave_type: 'personal' });
check('ลากิจวันนี้ยังต้องติ๊กฉุกเฉินเหมือนเดิม', r1b.ok === false && r1b.error === 'emergency_required', r1b);

const H = '2026-09-28';   // วันลาชั่วโมง (ไม่ชนใบลาเต็มวันของข้อ 1)
console.log('\n=== 2) ลาเป็นชั่วโมง ===');
const r2 = submit('Uemp2', { date_from: H, date_to: H, leave_unit: 'hour', time_from: '13:00', time_to: '15:00' });
check('ส่งได้ 2 ชม.', r2.ok && r2.hours === 2, r2);
check('หักโควตา 0.25 วัน (8 ชม. = 1 วัน)', Number(row(r2.leave_id).days) === 0.25, row(r2.leave_id).days);
check('เวลาเก็บเป็นข้อความ', row(r2.leave_id).time_from === "'13:00", row(r2.leave_id).time_from);
check('จองโควตาเป็นเศษวัน', Math.abs(Number(q('EMP-0014').sick_reserved) - 1.25) < 1e-9, q('EMP-0014'));
const r2b = submit('Uemp2', { date_from: '2026-09-29', date_to: '2026-09-29', leave_unit: 'hour', time_from: '11:00', time_to: '14:00' });
check('คร่อมพักเที่ยง นับ 2 ชม.', r2b.ok && r2b.hours === 2, r2b);
const r2c = submit('Uemp2', { date_from: H, date_to: H, leave_unit: 'hour', time_from: '07:00', time_to: '09:00' });
check('นอกเวลางานถูกปฏิเสธ', r2c.ok === false && r2c.error === 'outside_work_hours', r2c);
const r2d = submit('Uemp2', { date_from: H, date_to: H, leave_type: 'maternity', leave_unit: 'hour', time_from: '13:00', time_to: '15:00' });
check('ประเภทที่ไม่เปิดลาชั่วโมง ถูกปฏิเสธ', r2d.ok === false && r2d.error === 'hourly_not_allowed', r2d);
const card2 = sandbox.buildLeaveSubmittedCard(Object.assign({}, row(r2.leave_id), { time_from: '13:00', time_to: '15:00' }), 'x');
check('การ์ดโชว์ชั่วโมงไม่ใช่ 0.25 วัน', JSON.stringify(card2).includes('2 ชม. (13:00-15:00 น.)'), '');

const r2e = submit('Uemp2', { date_from: H, date_to: H, leave_unit: 'hour', time_from: '14:00', time_to: '16:00' });
check('ลาชั่วโมงทับช่วงเวลาเดิม ถูกปฏิเสธ', r2e.ok === false && r2e.error === 'overlap', r2e);
const r2f = submit('Uemp2', { date_from: H, date_to: H, leave_unit: 'hour', time_from: '16:00', time_to: '17:00' });
check('ลาชั่วโมงไม่ทับเวลา วันเดียวกัน ส่งได้', r2f.ok === true, r2f);
const r2g = submit('Uemp2', { leave_unit: 'hour', date_from: '2026-09-22', date_to: '2026-09-22', time_from: '09:00', time_to: '10:00' });
check('วันอื่นส่งได้ปกติ', r2g.ok === true, r2g);

const r2h = submit('Uemp2', { date_from: TODAY, date_to: TODAY, leave_unit: 'hour', time_from: '13:00', time_to: '15:00' });
check('ลาเต็มวันแล้ว ยื่นลาชั่วโมงวันเดียวกันซ้ำไม่ได้', r2h.ok === false && r2h.error === 'overlap', r2h);

console.log('\n=== 3) ลาป่วย 3 วันไม่มีใบรับรองแพทย์ → ส่งก่อน แนบทีหลัง ===');
const r3 = submit('Uemp', { date_from: '2026-09-22', date_to: '2026-09-24' });
check('ส่งได้ + ติดธงรอเอกสาร', r3.ok && r3.doc_pending === true && row(r3.leave_id).doc_pending === true, r3);
const p3 = pushed.length;
const a3 = sandbox.addLeaveAttachment({ lineUserId: 'Uemp', leave_id: r3.leave_id, attachment_base64: 'data:x', note: 'ใบรับรองแพทย์' });
check('ผู้ลาแนบทีหลังได้', a3.ok === true, a3);
check('ปลดธงรอเอกสาร', row(r3.leave_id).doc_pending === false, row(r3.leave_id).doc_pending);
check('เก็บรายการไฟล์แนบเพิ่ม', JSON.parse(row(r3.leave_id).extra_attachments).length === 1, row(r3.leave_id).extra_attachments);
check('HR ได้สำเนา', pushedTo('Uhr', p3).length === 1, pushed.slice(p3).map(x => x.to));
const a3b = sandbox.addLeaveAttachment({ lineUserId: 'Uemp2', leave_id: r3.leave_id, attachment_base64: 'data:x' });
check('คนอื่นแนบใบลาคนอื่นไม่ได้', a3b.ok === false && a3b.error === 'forbidden', a3b);

console.log('\n=== 4) ผู้อนุมัติขอเอกสารเพิ่ม → ผู้ลาได้รับจริง → แนบ → กลับไปหาผู้อนุมัติ ===');
const p4 = pushed.length;
const d4 = decide('Usup', r3.leave_id, 1, 'request_doc', 'ขอใบรับรองแพทย์ตัวจริง');
check('ขอได้', d4.ok && d4.delivered_to_requester === true, d4);
check('ใบยังค้างชั้น 1', row(r3.leave_id).stage1_status === 'pending' && row(r3.leave_id).doc_request_status === 'requested', row(r3.leave_id));
check('ผู้ลาได้การ์ดขอเอกสาร พร้อมข้อความที่ขอ', pushedTo('Uemp', p4).some(p => /ขอเอกสารเพิ่ม/.test(alt(p)) &&
  JSON.stringify(p.msg).includes('ขอใบรับรองแพทย์ตัวจริง')), pushed.slice(p4).map(alt));
check('ปุ่มพาไปหน้าใบลานั้น', pushedTo('Uemp', p4).some(p => JSON.stringify(p.msg).includes('my-requests.html?id=' + r3.leave_id)), '');
check('HR ได้สำเนาคำขอ', pushedTo('Uhr', p4).length === 1, '');
const d4b = decide('Usup', r3.leave_id, 1, 'request_doc', '');
check('ขอเอกสารโดยไม่บอกว่าขออะไร ถูกปฏิเสธ', d4b.ok === false && d4b.error === 'note_required', d4b);
const p4b = pushed.length;
sandbox.addLeaveAttachment({ lineUserId: 'Uemp', leave_id: r3.leave_id, attachment_base64: 'data:y' });
check('แนบแล้วสถานะเป็น submitted', row(r3.leave_id).doc_request_status === 'submitted', row(r3.leave_id).doc_request_status);
check('หัวหน้าที่ขอได้รับแจ้ง', pushedTo('Usup', p4b).some(p => /แนบเอกสาร/.test(alt(p))), pushed.slice(p4b).map(alt));
const d4c = decide('Usup', r3.leave_id, 1, 'approve');
check('หัวหน้าอนุมัติต่อได้ → ไป HR', d4c.ok && d4c.moved_to_stage === 2, d4c);

console.log('\n=== 5) ผู้บริหารในสายยังรับใบไม่ได้ → HR ไม่ใช่ผู้บริหารคนอื่น ===');
const d5 = decide('Uhr', r3.leave_id, 2, 'approve');
check('HR อนุมัติชั้น 2 → ไปชั้น 3', d5.ok && d5.moved_to_stage === 3, d5);
check('ผู้บริหารนอกสายไม่ได้การ์ด', pushedTo('Uother').length === 0, pushed.filter(p => p.to === 'Uother').map(alt));
const pendOther = sandbox.getPendingForMe({ lineUserId: 'Uother' });
check('ผู้บริหารนอกสายไม่เห็นใบในหน้าอนุมัติ', !pendOther.pending.some(p => p.leave_id === r3.leave_id), pendOther);
const f5 = decide('Uother', r3.leave_id, 3, 'approve');
check('ผู้บริหารนอกสายกดอนุมัติไม่ได้', f5.ok === false && f5.error === 'forbidden', f5);
const pendHr = sandbox.getPendingForMe({ lineUserId: 'Uhr' });
const it5 = pendHr.pending.find(p => p.leave_id === r3.leave_id);
check('HR เห็นใบชั้น 3 พร้อมป้ายแทนผู้บริหาร', it5 && it5.my_stage === 3 && it5.hr_fallback === true, pendHr.pending);
const d5b = decide('Uhr', r3.leave_id, 3, 'approve');
check('HR อนุมัติแทนได้ → จบ', d5b.ok && d5b.final_status === 'approved', d5b);
check('บันทึกว่า HR ตัดสินแทน', row(r3.leave_id).hr_fallback === true && /HR ตัดสินแทน/.test(row(r3.leave_id).stage3_note), row(r3.leave_id));
check('หักโควตา 3 วัน', Number(q('EMP-0011').sick_used) === 3, q('EMP-0011'));

console.log('\n=== 6) ผู้บริหารในสายรับใบได้ → HR ห้ามแซง จนกว่าผู้บริหารจะเงียบจนโดนเตือน ===');
const r6 = submit('Uemp2', { date_from: '2026-09-23', date_to: '2026-09-23' });
decide('Usup', r6.leave_id, 1, 'approve'); decide('Uhr', r6.leave_id, 2, 'approve');
const f6 = decide('Uhr', r6.leave_id, 3, 'approve');
check('HR แซงผู้บริหารที่ยังไม่ถูกเตือนไม่ได้', f6.ok === false && f6.error === 'forbidden', f6);
check('HR ไม่เห็นใบนี้ในรายการ', !sandbox.getPendingForMe({ lineUserId: 'Uhr' }).pending.some(p => p.leave_id === r6.leave_id), '');
// ผู้บริหารเงียบเกิน 4 ชม.ทำงาน → tick เตือน
const i6 = leaves._objects().findIndex(l => l.leave_id === r6.leave_id) + 2;
sandbox.updateRowByHeader_(leaves, i6, { stage2_at: '2026-09-14T09:00:00+07:00', last_reminded_at: '' });
const p6 = pushed.length;
sandbox.hourlyReminderTick({ force: true });
check('เตือนผู้บริหาร', pushedTo('Uboss', p6).length >= 1, pushed.slice(p6).map(p => p.to));
check('HR ได้แจ้งเตือนทุกครั้งที่ผู้บริหารเงียบ', pushedTo('Uhr', p6).some(p => /ใบลา/.test(alt(p)) &&
  JSON.stringify(p.msg).includes('HR ตัดสินแทนได้')), pushed.slice(p6).map(alt));
const d6 = decide('Uhr', r6.leave_id, 3, 'approve');
check('หลังโดนเตือน HR อนุมัติแทนได้', d6.ok && d6.final_status === 'approved', d6);

console.log('\n=== 7) ผู้อนุมัติขั้นแรกเป็นผู้บริหาร → ผู้บริหารก่อน แล้วค่อยแจ้ง HR ===');
const p7 = pushed.length;
const r7 = submit('Uhrstaff', { date_from: '2026-09-25', date_to: '2026-09-25' });
check('ไปหาผู้บริหารที่ชั้น 1 ชั้น 2/3 ข้าม', row(r7.leave_id).stage1_status === 'pending' &&
  row(r7.leave_id).stage2_status === 'skipped' && row(r7.leave_id).stage3_status === 'skipped', row(r7.leave_id));
check('ผู้บริหารได้การ์ดขออนุมัติ', pushedTo('Uboss', p7).some(p => /ขออนุมัติชั้น 1 \(ผู้บริหาร\)/.test(alt(p))), pushed.slice(p7).map(alt));
check('HR ยังไม่ได้แจ้งตอนส่ง', pushedTo('Uhr', p7).length === 0, pushed.slice(p7).filter(p => p.to === 'Uhr').map(alt));
const pb = sandbox.getPendingForMe({ lineUserId: 'Uboss' }).pending.find(p => p.leave_id === r7.leave_id);
check('ผู้บริหารเห็นในหน้าอนุมัติ', pb && pb.my_stage === 1 && pb.owner_first === true, pb);
const p7b = pushed.length;
const d7 = decide('Uboss', r7.leave_id, 1, 'approve');
check('ผู้บริหารอนุมัติแล้วจบเลย', d7.ok && d7.final_status === 'approved', d7);
check('อนุมัติแล้วแจ้ง HR', pushedTo('Uhr', p7b).some(p => /ได้รับอนุมัติ/.test(alt(p))), pushed.slice(p7b).map(alt));
check('ไม่ส่งการ์ดซ้ำหาผู้บริหารที่เพิ่งกด', pushedTo('Uboss', p7b).length === 0, pushed.slice(p7b).filter(p => p.to === 'Uboss').map(alt));

const r7b = submit('Umaid', { date_from: '2026-09-25', date_to: '2026-09-25' });
check('ผู้บริหารขั้นแรกยังไม่ผูกไลน์ → HR ตัดสิน แล้วจบ ไม่วนไปชั้นผู้บริหาร',
  row(r7b.leave_id).stage1_status === 'skipped' && row(r7b.leave_id).stage2_status === 'pending' &&
  row(r7b.leave_id).stage3_status === 'skipped', row(r7b.leave_id));
const d7b = decide('Uhr', r7b.leave_id, 2, 'approve');
check('HR อนุมัติแล้วจบ', d7b.ok && d7b.final_status === 'approved', d7b);

console.log('\n=== 8) ผูกบัญชีผู้บริหารที่มีแถวซ้ำซึ่งปิดแล้ว ===');
const c8 = sandbox.claimMyAccount({ lineUserId: 'Unewboss', emp_code: '4501', full_name: 'ผู้บริหารบี' });
check('ผูกได้', c8.ok === true, c8);
const b = users._objects().find(u => u.user_id === 'EMP-0003');
check('ผูกเข้าแถวผู้บริหารตัวจริง แต่รอผู้บริหารยืนยัน', b.line_user_id === 'Unewboss' && b.status === 'pending' && b.role === 'OWNER', b);
check('ผู้บริหารที่ใช้งานอยู่ได้การ์ดให้ยืนยัน', pushed.some(p => p.to === 'Uboss' && /สมัครใหม่/.test(alt(p))), '');
const hrOk = sandbox.approveRegister({ lineUserId: 'Uhr', user_id: 'EMP-0003' });
check('HR ยืนยันบัญชีผู้บริหารเองไม่ได้ (กัน HR ยึดแถวผู้บริหาร)', hrOk.ok === false && hrOk.error === 'forbidden_owner_only', hrOk);
const ownOk = sandbox.approveRegister({ lineUserId: 'Uboss', user_id: 'EMP-0003' });
check('ผู้บริหารยืนยันแล้วใช้งานได้', ownOk.ok && users._objects().find(u => u.user_id === 'EMP-0003').status === 'active', ownOk);

console.log('\n=== 9) ด่านสิทธิ์ ===');
const r9 = submit('Uemp2', { date_from: '2026-09-30', date_to: '2026-09-30' });
const s9 = decide('Uboss', r9.leave_id, 3, 'approve');
check('ผู้บริหารกระโดดข้ามชั้นที่ยังค้างไม่ได้', s9.ok === false && s9.error === 'stage_not_current', s9);
const h9 = decide('Uhr', r9.leave_id, 2, 'approve');
check('HR กดชั้น 2 ก่อนหัวหน้าไม่ได้', h9.ok === false && h9.error === 'stage_not_current', h9);
const p9 = sandbox.submitLeave({ lineUserId: 'Uhr', on_behalf_user_id: 'EMP-0001', leave_type: 'sick',
  date_from: '2026-09-30', date_to: '2026-09-30', reason: 'ทดสอบลาแทน' });
check('ลาแทนผู้บริหาร (อนุมัติอัตโนมัติ) ไม่ได้', p9.ok === false && p9.error === 'forbidden_proxy', p9);
check('ไม่แตะแถวซ้ำที่ปิดไว้', users._objects().filter(u => u.emp_code === '4501' && u.status === 'inactive' && !u.line_user_id).length === 2, '');

console.log('\n=== 10) เปลี่ยนหัวหน้ากลางทาง ใบแบบผู้บริหารก่อนไม่ค้าง ===');
const r10 = submit('Uhrstaff', { date_from: '2026-10-01', date_to: '2026-10-01' });
check('เริ่มเป็นแบบผู้บริหารก่อน', row(r10.leave_id).stage2_status === 'skipped', row(r10.leave_id));
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0012', supervisor_user_id: 'EMP-0010' });
check('หัวหน้าใหม่ไม่ใช่ผู้บริหาร → กลับเป็นสายปกติ', row(r10.leave_id).stage1_status === 'pending' &&
  row(r10.leave_id).stage2_status === 'pending' && row(r10.leave_id).stage3_status === 'pending', row(r10.leave_id));
const d10 = decide('Usup', r10.leave_id, 1, 'approve');
check('หัวหน้าใหม่อนุมัติได้ → ไป HR', d10.ok && d10.moved_to_stage === 2, d10);

console.log('\n=== 11) ปุ่มไม่อนุมัติในการ์ดต้องเปิดใบนั้นตรง (ลูกค้าแจ้ง: กดแล้วไม่มีช่องเหตุผล) ===');
const lv11 = row(r10.leave_id);
const reqCard = JSON.stringify(sandbox.buildApprovalRequestCard(lv11, { display_name: 'x' }, 1));
check('การ์ดขออนุมัติ: ลิงก์ไม่อนุมัติมี ?id=เลขใบ', reqCard.includes('approve.html?id=' + r10.leave_id), reqCard.match(/approve\.html[^"]*/));
const remCard = JSON.stringify(sandbox.buildReminderCard(lv11, { display_name: 'x' }, 2, 1, 4));
check('การ์ดเตือน: ลิงก์ไม่อนุมัติมี ?id=เลขใบ', remCard.includes('approve.html?id=' + r10.leave_id), remCard.match(/approve\.html[^"]*/));

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทุกข้อ');
process.exit(fails ? 1 : 0);
