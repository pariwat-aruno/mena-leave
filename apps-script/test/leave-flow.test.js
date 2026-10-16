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
  U('EMP-0015', 'Usup2', 'SUPERVISOR', 'หัวหน้าแผนกแพ็ค', '5600', 'active', true),    // หัวหน้างานลา: ผู้บริหารนอกสาย → ผู้บริหารเอ
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
  // ขั้นแรกเป็นผู้บริหาร + ขั้น 3 มีทั้งผู้บริหารคนอื่นและคนเดิม (คนเดิมต้องไม่ได้กดซ้ำ)
  A('APV-8', 'EMP-0015', 'EMP-0002', 1), A('APV-9', 'EMP-0015', 'EMP-0001', 3), A('APV-10', 'EMP-0015', 'EMP-0002', 3),
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
 'FlexCard.gs', 'LeaveExtras.gs', 'ApprovalChain.gs', 'Approval.gs', 'LeaveRequest.gs', 'Reminder.gs', 'Cancel.gs']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));
// stub หลังโหลด — ของจริงใน Utils ใช้เวลาเครื่อง
sandbox.nowBangkok = () => TODAY + 'T10:00:00+07:00';
sandbox.todayBangkok = () => TODAY;
sandbox.nextLeaveId = () => 'LV-T-' + (++leaveSeq);
sandbox.currentYearBangkok_ = () => 2026;
sandbox.getLineMessageQuota_ = () => ({ ok: false });   // ไม่ได้โหลด LineApi.gs — เทสโควตาอยู่ line-quota.test.js
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
// ขั้น HR ต้องเลือก จ่าย/ไม่จ่าย (16 ต.ค. 69) — เทสเดิมไม่ได้สนเรื่องนี้ ใส่ 'paid' ให้เป็นค่าตั้งต้น
const decide = (line, id, stage, decision, note, pay) =>
  sandbox.approveLeave({ lineUserId: line, leave_id: id, stage, decision, note,
    pay_status: pay !== undefined ? pay : (stage === 2 ? 'paid' : undefined) });

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
check('ผู้บริหารได้การ์ดขออนุมัติ', pushedTo('Uboss', p7).some(p => /ขออนุมัติชั้น 1 \(ผู้บริหาร · อนุมัติในนามหัวหน้างาน\)/.test(alt(p))), pushed.slice(p7).map(alt));
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

console.log('\n=== 12) หัวหน้างานลา: ผู้บริหารคนแรก (ในนามหัวหน้างาน) → ผู้บริหารคนถัดไป ไม่ผ่าน HR (ลูกค้าสั่ง 1 ต.ค. 69) ===');
const p12 = pushed.length;
const r12 = submit('Usup2', { date_from: '2026-10-02', date_to: '2026-10-02' });
check('ส่งได้', r12.ok === true, r12);
check('ขั้น 1 รอ · ข้าม HR · ขั้น 3 รอ', row(r12.leave_id).stage1_status === 'pending' &&
  row(r12.leave_id).stage2_status === 'skipped' && row(r12.leave_id).stage3_status === 'pending', row(r12.leave_id));
check('ผู้บริหารคนแรกได้การ์ด "ในนามหัวหน้างาน"', pushedTo('Uother', p12).some(p => /ในนามหัวหน้างาน/.test(alt(p))),
  pushed.slice(p12).map(x => x.to + ':' + alt(x)));
check('HR ยังไม่ได้อะไรตอนส่ง', pushedTo('Uhr', p12).length === 0, pushed.slice(p12).map(x => x.to + ':' + alt(x)));
const pend12 = sandbox.getPendingForMe({ lineUserId: 'Uother' }).pending.find(p => p.leave_id === r12.leave_id);
check('หน้าอนุมัติบอกว่าในนามหัวหน้างาน', pend12 && pend12.owner_first === true && /ในนามหัวหน้างาน/.test(pend12.stage1_label), pend12);
const p12b = pushed.length;
const d12 = decide('Uother', r12.leave_id, 1, 'approve');
check('ผู้บริหารคนแรกอนุมัติ → ไปขั้น 3', d12.ok && d12.moved_to_stage === 3, d12);
check('ผู้บริหารคนถัดไปได้การ์ดขออนุมัติ', pushedTo('Uboss', p12b).some(p => /ขออนุมัติชั้น 3/.test(alt(p))), pushed.slice(p12b).map(x => x.to + ':' + alt(x)));
check('ผู้บริหารคนแรกไม่ได้การ์ดขั้น 3 ซ้ำ', !pushedTo('Uother', p12b).some(p => /ขออนุมัติชั้น 3/.test(alt(p))), pushed.slice(p12b).map(x => x.to + ':' + alt(x)));
check('HR ยังไม่ได้อะไร (ไม่ผ่าน HR)', pushedTo('Uhr', p12b).length === 0, '');
check('ผู้ลาเห็นว่าผู้บริหารอนุมัติในนามหัวหน้างาน', pushedTo('Usup2', p12b).some(p => JSON.stringify(p.msg).includes('ในนามหัวหน้างาน')), '');
const pend12b = sandbox.getPendingForMe({ lineUserId: 'Uother' }).pending.find(p => p.leave_id === r12.leave_id);
check('ผู้บริหารคนแรกไม่เห็นใบนี้ที่ขั้น 3', !pend12b, pend12b);
const f12 = decide('Uother', r12.leave_id, 3, 'approve');
check('ผู้บริหารคนแรกกดขั้น 3 ซ้ำไม่ได้', f12.ok === false && f12.error === 'forbidden', f12);
const h12 = decide('Uhr', r12.leave_id, 3, 'approve');
check('HR กดแทนทันทีไม่ได้', h12.ok === false, h12);
const p12c = pushed.length;
const e12 = decide('Uboss', r12.leave_id, 3, 'approve');
check('ผู้บริหารคนถัดไปอนุมัติ → จบ', e12.ok && e12.final_status === 'approved', e12);
check('แจ้ง HR ตอนจบ', pushedTo('Uhr', p12c).length === 1, pushed.slice(p12c).map(x => x.to + ':' + alt(x)));

console.log('\n=== 13) ขั้นแรกเป็นผู้บริหาร ไม่มีผู้บริหารคนอื่นในสาย → จบที่ขั้นแรกเหมือนเดิม ===');
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0012', supervisor_user_id: 'EMP-0001' });
const r13 = submit('Uhrstaff', { date_from: '2026-10-05', date_to: '2026-10-05' });
check('ขั้น 3 ถูกข้าม', row(r13.leave_id).stage2_status === 'skipped' && row(r13.leave_id).stage3_status === 'skipped', row(r13.leave_id));
const d13 = decide('Uboss', r13.leave_id, 1, 'approve');
check('ผู้บริหารอนุมัติแล้วจบ', d13.ok && d13.final_status === 'approved', d13);

console.log('\n=== 14) ใบผู้บริหารก่อน: เวลาเตือนขั้น 3 · เปลี่ยนผู้บริหารขั้นแรกกลางทาง ===');
const ps = sandbox.pendingStageOf_({ stage1_status: 'approved', stage1_at: '2026-10-03T09:00:00+07:00',
  stage2_status: 'skipped', stage2_at: '2026-10-01T09:00:00+07:00', stage3_status: 'pending', submitted_at: '2026-10-01T09:00:00+07:00' });
check('ขั้น 3 เริ่มนับจากเวลาที่ขั้นแรกกด ไม่ใช่เวลาส่งใบ', ps.stage === 3 && ps.since === '2026-10-03T09:00:00+07:00', ps);
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0015', supervisor_user_id: 'EMP-0002', executive_user_ids: ['EMP-0002'] });
const r14 = submit('Usup2', { date_from: '2026-10-06', date_to: '2026-10-06' });
check('ขั้น 3 มีแต่คนเดียวกับขั้นแรก → ข้าม', row(r14.leave_id).stage3_status === 'skipped', row(r14.leave_id));
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0015', supervisor_user_id: 'EMP-0001' });
check('เปลี่ยนขั้นแรกเป็นผู้บริหารอีกคน → ขั้น 3 กลับมารอคนเดิม', row(r14.leave_id).stage3_status === 'pending', row(r14.leave_id));
const d14 = decide('Uboss', r14.leave_id, 1, 'approve');
check('ผู้บริหารคนใหม่อนุมัติขั้นแรก → ไปขั้น 3', d14.ok && d14.moved_to_stage === 3, d14);

console.log('\n=== 15) แก้แค่ผู้บริหารขั้น 3 ระหว่างใบรอขั้นแรก → คิดขั้น 3 ใหม่ ===');
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0015', supervisor_user_id: 'EMP-0002', executive_user_ids: ['EMP-0002'] });
const r15 = submit('Usup2', { date_from: '2026-10-07', date_to: '2026-10-07' });
check('เริ่มต้นขั้น 3 ข้าม', row(r15.leave_id).stage3_status === 'skipped', row(r15.leave_id));
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0015', executive_user_ids: ['EMP-0002', 'EMP-0001'] });
check('เพิ่มผู้บริหารคนถัดไป → ขั้น 3 รอ', row(r15.leave_id).stage3_status === 'pending', row(r15.leave_id));
const rej = JSON.stringify(sandbox.buildStage1RejectReportCard(row(r15.leave_id), { display_name: 'x' }, 'y', 'z'));
check('รายงานปฏิเสธขั้นแรกบอกว่าในนามหัวหน้างานทั้งหัวและเนื้อ', (rej.match(/ในนามหัวหน้างาน/g) || []).length >= 3, rej);

// ---------- ข้อ 1 (16 ต.ค. 69): ผู้บริหารขั้น 3 คนเดียวจาก Settings ----------
settings.appendRow(['stage3_sole_approver', '', 'ทดสอบ']);
const setSole = v => { const i = settings._objects().findIndex(r => r.key === 'stage3_sole_approver') + 2;
  settings.getRange(i, 2).setValue(v); };
const audits = [];
sandbox.audit = (actor, action, ent, id, payload) => audits.push({ actor, action, id, payload });

console.log('\n=== 16) ค่าว่าง = ผังรายคนเหมือนเดิม ===');
check('ค่าว่าง: ผู้บริหารขั้น 3 ของพนักงานคลัง = ผู้บริหารเอ ตามผัง',
  sandbox.getExecutivesFor('EMP-0014').users.map(u => u.user_id).join() === 'EMP-0001', sandbox.getExecutivesFor('EMP-0014'));
const r16 = submit('Uemp2', { date_from: '2026-10-12', date_to: '2026-10-12' });
decide('Usup', r16.leave_id, 1, 'approve'); decide('Uhr', r16.leave_id, 2, 'approve');
check('ค่าว่าง: ผู้บริหารเอเห็นใบขั้น 3', sandbox.getPendingForMe({ lineUserId: 'Uboss' }).pending.some(p => p.leave_id === r16.leave_id), '');

console.log('\n=== 17) ตั้งผู้บริหารขั้น 3 คนเดียว → ใบที่ค้างอยู่ย้ายไปหาคนนั้นทันที · คนอื่นกดไม่ได้ ===');
setSole(1001);   // ชีตเก็บรหัสเป็นตัวเลขได้ — EMP-0002 ผู้บริหารนอกสาย
check('ผู้บริหารขั้น 3 ของทุกคน = คนที่ตั้งไว้', ['EMP-0014', 'EMP-0011', 'EMP-0013'].every(uid =>
  sandbox.getExecutivesFor(uid).users.map(u => u.user_id).join() === 'EMP-0002'), '');
check('ใบที่ค้างขั้น 3 อยู่แล้ว ไปโผล่ที่คนที่ตั้งไว้', sandbox.getPendingForMe({ lineUserId: 'Uother' }).pending.some(p => p.leave_id === r16.leave_id && p.my_stage === 3), '');
check('ผู้บริหารตามผังเดิมไม่เห็นแล้ว', !sandbox.getPendingForMe({ lineUserId: 'Uboss' }).pending.some(p => p.leave_id === r16.leave_id), '');
const f17 = decide('Uboss', r16.leave_id, 3, 'approve');
check('ผู้บริหารคนอื่นกดขั้น 3 → เซิร์ฟเวอร์ปฏิเสธ พร้อมบอกว่าใครอนุมัติ', f17.ok === false && f17.error === 'forbidden' &&
  /ผู้บริหารนอกสาย อนุมัติท่านเดียว/.test(f17.message), f17);
const i17 = leaves._objects().findIndex(l => l.leave_id === r16.leave_id) + 2;
sandbox.updateRowByHeader_(leaves, i17, { stage2_at: '2026-09-14T09:00:00+07:00', last_reminded_at: '' });
const p17 = pushed.length;
sandbox.hourlyReminderTick({ force: true });
check('ตัวเตือนเตือนคนที่ตั้งไว้ ไม่ใช่ผู้บริหารตามผัง', pushedTo('Uother', p17).length >= 1 && pushedTo('Uboss', p17).length === 0,
  pushed.slice(p17).map(x => x.to));
const e17 = decide('Uother', r16.leave_id, 3, 'approve');
check('คนที่ตั้งไว้อนุมัติได้ → จบ', e17.ok && e17.final_status === 'approved', e17);
const org = sandbox.getMyOrgLine({ lineUserId: 'Uother' });
check('สายงานของฉัน: คนที่ตั้งไว้ดูแลทุกคน · ไม่มีกลุ่มยังไม่ผูก', org.ok && org.as_executive.length > 5 && org.unassigned.length === 0 &&
  org.stage3_sole && org.stage3_sole.display_name === 'ผู้บริหารนอกสาย', org.stage3_sole);
check('สายงานของผู้บริหารคนอื่นว่าง', sandbox.getMyOrgLine({ lineUserId: 'Uboss' }).as_executive.length === 0, '');
const dir17 = sandbox.getEmployeeDirectory({ lineUserId: 'Uhr' });
check('ฐานข้อมูลพนักงานส่งชื่อผู้บริหารขั้น 3 คนเดียวให้หน้าผัง', dir17.stage3_sole && dir17.stage3_sole.user_id === 'EMP-0002' &&
  dir17.stage3_sole.problem === '', dir17.stage3_sole);

console.log('\n=== 18) คนที่ตั้งไว้เป็นผู้อนุมัติขั้นแรกเอง → ขั้น 3 ข้าม ===');
// หัวหน้าแผนกแพ็ค: ขั้นแรก = ผู้บริหารนอกสาย (EMP-0002) — ตอนนี้ผังขั้น 3 มีผู้บริหารเอด้วย
setSole('');
const r18a = submit('Usup2', { date_from: '2026-10-08', date_to: '2026-10-08' });
check('(ก่อนตั้งค่า) ขั้น 3 รอผู้บริหารเอ', row(r18a.leave_id).stage3_status === 'pending', row(r18a.leave_id));
setSole('1001');
const r18 = submit('Usup2', { date_from: '2026-10-09', date_to: '2026-10-09' });
check('ใบใหม่: ขั้น 3 ข้ามทันที', row(r18.leave_id).stage1_status === 'pending' && row(r18.leave_id).stage3_status === 'skipped', row(r18.leave_id));
const d18 = decide('Uother', r18.leave_id, 1, 'approve');
check('ขั้นแรกอนุมัติแล้วจบ ไม่ต้องอนุมัติซ้ำ', d18.ok && d18.final_status === 'approved', d18);
const d18a = decide('Uother', r18a.leave_id, 1, 'approve');
check('ใบที่ส่งก่อนตั้งค่า: คิดขั้น 3 ใหม่ตอนกด → จบที่ขั้นแรก ไม่ไปหาผู้บริหารเอ', d18a.ok && d18a.final_status === 'approved' &&
  row(r18a.leave_id).stage3_status === 'skipped', [d18a, row(r18a.leave_id).stage3_status]);

console.log('\n=== 19) คนที่ตั้งไว้ยังรับใบไม่ได้ (ยังไม่ผูกไลน์) → HR อนุมัติแทน ===');
users.appendRow(U('EMP-0020', '', 'OWNER', 'ผู้บริหารซี', '8801', 'invited'));
setSole('8801');
const r19 = submit('Uemp', { date_from: '2026-10-13', date_to: '2026-10-13' });
decide('Usup', r19.leave_id, 1, 'approve');
const p19 = pushed.length;
const d19 = decide('Uhr', r19.leave_id, 2, 'approve');
check('ขั้น HR ผ่าน → ขั้น 3', d19.ok && d19.moved_to_stage === 3, d19);
check('การ์ดขั้น 3 ไป HR (อนุมัติแทน) ไม่ไปผู้บริหารคนอื่น', pushedTo('Uhr', p19).some(p => /ขออนุมัติชั้น 3/.test(alt(p)) || /แทน/.test(JSON.stringify(p.msg))) &&
  pushedTo('Uboss', p19).length === 0 && pushedTo('Uother', p19).length === 0, pushed.slice(p19).map(x => x.to + ':' + alt(x)));
const it19 = sandbox.getPendingForMe({ lineUserId: 'Uhr' }).pending.find(p => p.leave_id === r19.leave_id);
check('HR เห็นใบพร้อมป้ายแทนผู้บริหาร', it19 && it19.hr_fallback === true, it19);
check('ผู้บริหารคนอื่นกดไม่ได้', decide('Uother', r19.leave_id, 3, 'approve').error === 'forbidden', '');
const dir19 = sandbox.getEmployeeDirectory({ lineUserId: 'Uhr' });
check('หน้าผังบอกว่าคนที่ตั้งไว้ยังไม่ผูกไลน์', dir19.stage3_sole && dir19.stage3_sole.problem === 'ยังไม่ผูกไลน์', dir19.stage3_sole);
const h19 = decide('Uhr', r19.leave_id, 3, 'approve');
check('HR อนุมัติแทนได้ → จบ', h19.ok && h19.final_status === 'approved' && row(r19.leave_id).hr_fallback === true, h19);
setSole('');

// ---------- ข้อ 2 (16 ต.ค. 69): จ่าย/ไม่จ่าย ----------
console.log('\n=== 20) HR อนุมัติขั้น 2 ต้องเลือก จ่าย/ไม่จ่าย ===');
const r20 = submit('Uemp2', { leave_type: 'personal', date_from: '2026-10-14', date_to: '2026-10-14', is_emergency: true,
  emergency_reason: 'ธุระด่วนที่ธนาคาร' });
check('ส่งลากิจได้', r20.ok, r20);
decide('Usup', r20.leave_id, 1, 'approve');
const n20 = decide('Uhr', r20.leave_id, 2, 'approve', '', '');
check('ไม่เลือก → ปฏิเสธ ใบยังรอ HR', n20.ok === false && n20.error === 'pay_status_required' &&
  row(r20.leave_id).stage2_status === 'pending', n20);
const x20 = decide('Uhr', r20.leave_id, 2, 'approve', '', 'maybe');
check('ค่าแปลก → ปฏิเสธ', x20.ok === false && x20.error === 'pay_status_required', x20);
const replies = [];
sandbox.replyText = (tok, msg) => replies.push(msg);
sandbox.handlePostback_({ source: { userId: 'Uhr' }, replyToken: 't',
  postback: { data: 'action=approve_leave&id=' + r20.leave_id + '&stage=2&decision=approve' } });
check('ปุ่มอนุมัติในการ์ดรุ่นเก่า (ยิงตรง) ถูกปฏิเสธ + บอกให้เปิดหน้าอนุมัติ', row(r20.leave_id).stage2_status === 'pending' &&
  /จ่าย/.test(replies[replies.length - 1] || ''), replies);
const lv20 = row(r20.leave_id);
const hrCard20 = JSON.stringify(sandbox.buildApprovalRequestCard(lv20, { display_name: 'x' }, 2));
check('การ์ดขั้น HR: ปุ่มอนุมัติเปิดหน้าอนุมัติใบนั้น ไม่ใช่ยิงในแชท', !hrCard20.includes('decision=approve') &&
  hrCard20.includes('เลือก จ่าย/ไม่จ่าย') && hrCard20.includes('approve.html?id=' + r20.leave_id), hrCard20.match(/"uri":"[^"]*"/g));
const rem2 = JSON.stringify(sandbox.buildReminderCard(lv20, { display_name: 'x' }, 2, 1, 4));
check('การ์ดเตือนขั้น HR: เหมือนกัน', !rem2.includes('decision=approve') && rem2.includes('approve.html?id=' + r20.leave_id), '');
check('การ์ดขั้น 1/3 ยังกดอนุมัติในแชทได้เหมือนเดิม',
  JSON.stringify(sandbox.buildApprovalRequestCard(lv20, { display_name: 'x' }, 1)).includes('decision=approve') &&
  JSON.stringify(sandbox.buildApprovalRequestCard(lv20, { display_name: 'x' }, 3)).includes('decision=approve'), '');
const quotaBefore = JSON.stringify(q('EMP-0014'));
const ok20 = decide('Uhr', r20.leave_id, 2, 'approve', '', 'unpaid');
check('เลือกไม่จ่าย → อนุมัติได้ → ขั้น 3', ok20.ok && ok20.moved_to_stage === 3, ok20);
check('บันทึก ไม่จ่าย + ใครเลือก + เมื่อไร', row(r20.leave_id).pay_status === 'unpaid' && row(r20.leave_id).pay_decided_by === 'EMP-0004' &&
  !!row(r20.leave_id).pay_decided_at, row(r20.leave_id));
check('audit ขั้น 2 เก็บค่าที่เลือก', audits.some(a => a.action === 'leave_approve_s2' && a.id === r20.leave_id && a.payload.pay_status === 'unpaid'), audits.slice(-3));
check('ไม่แตะโควตา', JSON.stringify(q('EMP-0014')) === quotaBefore, [quotaBefore, q('EMP-0014')]);
const dup20 = decide('Uhr', r20.leave_id, 2, 'approve', '', 'paid');
check('กดซ้ำ (เลือกจ่าย) ไม่ทับค่าเดิม', dup20.ok === false && row(r20.leave_id).pay_status === 'unpaid', dup20);
const p20 = pushed.length;
decide('Uboss', r20.leave_id, 3, 'approve');
check('การ์ดแจ้งผลสุดท้ายถึงผู้ลาบอก ไม่จ่าย', pushedTo('Uemp2', p20).some(p => /ได้รับอนุมัติ/.test(alt(p)) &&
  JSON.stringify(p.msg).includes('ค่าจ้างวันลา') && JSON.stringify(p.msg).includes('ไม่จ่าย')), pushed.slice(p20).map(alt));
const one20 = sandbox.getOneRequest({ lineUserId: 'Uemp2', leave_id: r20.leave_id });
check('ผู้ลาเห็นป้าย ไม่จ่าย ในใบของตัวเอง', one20.ok && one20.leave.pay_status === 'unpaid' && one20.leave.pay_status_label === 'ไม่จ่าย', one20.leave);

console.log('\n=== 21) ระบุ/แก้ จ่าย-ไม่จ่าย ภายหลัง (ใบที่ไม่ผ่านขั้น HR) ===');
const setPay = (line, id, v) => sandbox.setLeavePayStatus({ lineUserId: line, leave_id: id, pay_status: v });
check('ใบสายผู้บริหารก่อน (ข้ามขั้น HR) ยังไม่ระบุ', row(r18.leave_id).pay_status === '', row(r18.leave_id).pay_status);
check('หัวหน้างานระบุไม่ได้', setPay('Usup', r18.leave_id, 'paid').error === 'forbidden', '');
check('พนักงานระบุไม่ได้', setPay('Uemp', r18.leave_id, 'paid').error === 'forbidden', '');
check('ค่าแปลกถูกปฏิเสธ', setPay('Uhr', r18.leave_id, 'half').error === 'invalid_pay_status', '');
const a21 = audits.length;
const s21 = setPay('Uhr', r18.leave_id, 'paid');
check('HR ระบุ จ่าย ได้', s21.ok && row(r18.leave_id).pay_status === 'paid' && row(r18.leave_id).pay_decided_by === 'EMP-0004', [s21, row(r18.leave_id)]);
const s21b = setPay('Uhr', r18.leave_id, 'paid');
check('กดค่าเดิมซ้ำ = ไม่เขียน ไม่ลง audit ซ้ำ', s21b.ok && s21b.unchanged === true &&
  audits.slice(a21).filter(a => a.action === 'leave_pay_status').length === 1, audits.slice(a21));
const s21c = setPay('Uboss', r18.leave_id, 'unpaid');
check('ผู้บริหารแก้เป็น ไม่จ่าย ได้ + audit เก็บค่าเดิม', s21c.ok && s21c.changed_from === 'paid' && row(r18.leave_id).pay_status === 'unpaid' &&
  audits.some(a => a.action === 'leave_pay_status' && a.payload.from === 'paid' && a.payload.to === 'unpaid' && a.payload.from_by === 'EMP-0004'),
  audits.slice(a21));
const r21 = sandbox.submitLeave({ lineUserId: 'Uhr', leave_type: 'sick', date_from: '2026-10-15', date_to: '2026-10-15', reason: 'ป่วยมีไข้' });
check('HR ลาเอง: ระบุใบตัวเองไม่ได้', r21.ok && setPay('Uhr', r21.leave_id, 'paid').error === 'forbidden', r21);
check('ผู้บริหารระบุใบของ HR ได้ (ใบรออยู่ขั้น 3)', setPay('Uboss', r21.leave_id, 'paid').ok === true, row(r21.leave_id));
const r21r = submit('Uemp', { date_from: '2026-10-16', date_to: '2026-10-16' });
check('ใบที่ยังรอขั้น HR → ให้เลือกตอนอนุมัติ', setPay('Uhr', r21r.leave_id, 'paid').error === 'use_approval', '');
decide('Usup', r21r.leave_id, 1, 'reject', 'งานด่วน');
check('ใบไม่อนุมัติ → ไม่ต้องระบุ', setPay('Uhr', r21r.leave_id, 'paid').error === 'not_applicable', '');

// ---------- แก้ตามที่ astra ตรวจ 7647494 ----------
const userRow = uid => users._objects().findIndex(u => u.user_id === uid) + 2;
const setUserCell = (uid, col, v) => sandbox.updateRowByHeader_(users, userRow(uid), { [col]: v });
// ล็อกจำลองที่รู้ว่ากำลังถืออยู่ไหม + แทรกเหตุการณ์ระหว่างรอล็อกได้
let lockHeld = false, onWaitLock = null;
sandbox.LockService = { getScriptLock: () => ({
  waitLock() { if (onWaitLock) { const f = onWaitLock; onWaitLock = null; f(); } lockHeld = true; },
  releaseLock() { lockHeld = false; } }) };

console.log('\n=== 22) A1: ตั้งค่าไว้แต่คนนั้นรับไม่ได้ → สายผู้บริหารก่อน ขั้น 3 ต้องรอ (HR แทน) ไม่จบเงียบ ===');
setSole('9001');   // รหัสของ HR — ไม่ใช่ระดับผู้บริหาร
const r22 = submit('Usup2', { date_from: '2026-10-19', date_to: '2026-10-19' });
check('ขั้น 3 = รอ ไม่ใช่ข้าม', row(r22.leave_id).stage3_status === 'pending', row(r22.leave_id));
const d22 = decide('Uother', r22.leave_id, 1, 'approve');
check('ขั้นแรกอนุมัติ → ไปขั้น 3 (HR รับแทน) ไม่จบใบ', d22.ok && d22.moved_to_stage === 3 &&
  sandbox.getPendingForMe({ lineUserId: 'Uhr' }).pending.some(p => p.leave_id === r22.leave_id && p.hr_fallback), d22);

console.log('\n=== 23) A2: ค่าตั้งว่าง → ไม่คิดขั้น 3 ใหม่ (ผู้บริหารคนถัดไปถูกปิดกลางทาง ใบต้องไป HR ไม่จบเงียบ) ===');
setSole('');
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0015', supervisor_user_id: 'EMP-0002', executive_user_ids: ['EMP-0002', 'EMP-0001'] });
const r23 = submit('Usup2', { date_from: '2026-10-20', date_to: '2026-10-20' });
check('เริ่ม: ขั้น 3 รอผู้บริหารเอ', row(r23.leave_id).stage3_status === 'pending', row(r23.leave_id));
setUserCell('EMP-0001', 'status', 'inactive');
const d23 = decide('Uother', r23.leave_id, 1, 'approve');
check('ขั้นแรกอนุมัติ → ยังไปขั้น 3 (HR แทน) ไม่ใช่จบใบ', d23.ok && d23.moved_to_stage === 3 && row(r23.leave_id).stage3_status === 'pending', [d23, row(r23.leave_id).stage3_status]);
setUserCell('EMP-0001', 'status', 'active');

console.log('\n=== 24) A3: แก้ค่าในชีตแล้วมีผลทันที (ไม่รอแคช) ===');
const realCache = sandbox.CacheService;
sandbox.CacheService = { getScriptCache: () => ({ get: () => JSON.stringify({ stage3_sole_approver: 1001 }), put() {}, remove() {} }) };
check('แคชเก่าบอก 1001 แต่ชีตว่างแล้ว → ใช้ผังรายคน', sandbox.getExecutivesFor('EMP-0014').users.map(u => u.user_id).join() === 'EMP-0001',
  sandbox.getExecutivesFor('EMP-0014').users.map(u => u.user_id));
sandbox.CacheService = realCache;

console.log('\n=== 25) A6: รหัสมีศูนย์นำหน้า ===');
users.appendRow(U('EMP-0021', 'Uzero', 'OWNER', 'ผู้บริหารศูนย์', '0012', 'active'));
setSole('0012');
check('รหัส 0012 หาเจอ ไม่กลายเป็น 12', sandbox.getExecutivesFor('EMP-0014').users.map(u => u.user_id).join() === 'EMP-0021',
  sandbox.getExecutivesFor('EMP-0014'));

console.log('\n=== 26) A4: สายผู้บริหารก่อนที่เริ่มที่ HR · เปลี่ยนค่าตั้งแล้ว HR อนุมัติ → ต้องไปหาคนที่ตั้งไว้ ===');
setSole('');
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0013', supervisor_user_id: 'EMP-0020' });   // ผู้บริหารซี ยังไม่ผูกไลน์
const r26 = submit('Umaid', { date_from: '2026-10-21', date_to: '2026-10-21' });
check('เริ่ม: ข้ามขั้นแรก รอ HR ขั้น 3 ข้าม', row(r26.leave_id).stage1_status === 'skipped' && row(r26.leave_id).stage2_status === 'pending' &&
  row(r26.leave_id).stage3_status === 'skipped', row(r26.leave_id));
setSole('1001');
const d26 = decide('Uhr', r26.leave_id, 2, 'approve');
check('HR อนุมัติ → ไปขั้น 3 หาคนที่ตั้งไว้', d26.ok && d26.moved_to_stage === 3 &&
  sandbox.getPendingForMe({ lineUserId: 'Uother' }).pending.some(p => p.leave_id === r26.leave_id), d26);

console.log('\n=== 27) A5: ค่าตั้งเปลี่ยนระหว่างรอล็อก → สิทธิ์ขั้น 3 ตรวจซ้ำ ===');
onWaitLock = () => setSole('0012');
const d27 = decide('Uother', r26.leave_id, 3, 'approve');
check('คนเดิมหมดสิทธิ์แล้ว → ปฏิเสธ ใบยังรอ', d27.ok === false && d27.error === 'forbidden' && row(r26.leave_id).final_status === 'pending', d27);

console.log('\n=== 28) P5: ขั้น 3 เห็นธง จ่าย/ไม่จ่าย ที่ HR เลือก ===');
const it28 = sandbox.getPendingForMe({ lineUserId: 'Uzero' }).pending.find(p => p.leave_id === r26.leave_id);
check('รายการขั้น 3 มีค่า จ่าย ที่ HR เลือก + ผู้ลา', it28 && it28.pay_status === 'paid' && it28.user_id === 'EMP-0013', it28);
setSole('');

console.log('\n=== 29) P4: ผู้บริหารยกเลิกใบตัวเอง (ผ่านอัตโนมัติ) ปิดใบเดิมภายใต้ล็อก ===');
const r29 = submit('Uboss', { date_from: '2026-10-22', date_to: '2026-10-22' });
const origApply = sandbox.applyCancelToParent_;
let appliedUnderLock = null;
sandbox.applyCancelToParent_ = c => { appliedUnderLock = lockHeld; return origApply(c); };
const c29 = sandbox.requestCancelLeave({ lineUserId: 'Uboss', leave_id: r29.leave_id, reason: 'ติดประชุมด่วน' });
sandbox.applyCancelToParent_ = origApply;
check('ยกเลิกได้ + ปิดใบเดิมตอนถือล็อก', c29.ok && row(r29.leave_id).final_status === 'cancelled' && appliedUnderLock === true, [c29, appliedUnderLock]);

// ---------- แก้ตามที่ astra ตรวจ beefe78 (รอบ 2) ----------
console.log('\n=== 30) B1: ข้ามขั้น 3 ได้เฉพาะเมื่อคนที่ตั้งไว้อนุมัติใบนี้จริง — ห้ามอนุมานจากผัง ===');
setSole('');
const r30 = submit('Umaid', { date_from: '2026-10-23', date_to: '2026-10-23' });   // ผู้บริหารขั้นแรกยังรับไม่ได้ → เริ่มที่ HR
check('เริ่มที่ HR', row(r30.leave_id).stage1_status === 'skipped' && row(r30.leave_id).stage2_status === 'pending', row(r30.leave_id));
sandbox.setApprovalChain({ lineUserId: 'Uboss', user_id: 'EMP-0013', supervisor_user_id: 'EMP-0002' });   // เปลี่ยนหัวหน้าเป็นคนที่จะตั้ง
setSole('1001');
const d30 = decide('Uhr', r30.leave_id, 2, 'approve');
check('HR อนุมัติ → ยังต้องไปขั้น 3 (ผู้บริหารคนนั้นไม่เคยอนุมัติใบนี้)', d30.ok && d30.moved_to_stage === 3 &&
  row(r30.leave_id).stage3_status === 'pending', [d30, row(r30.leave_id).stage3_status]);

console.log('\n=== 31) B2: ตั้งรหัสเป็นคนที่ไม่ใช่ผู้บริหาร ที่กดขั้น 1 → ขั้น 3 ห้ามข้าม ===');
setSole('5502');   // หัวหน้าไลน์ผลิต (SUPERVISOR)
const r31 = submit('Uemp', { date_from: '2026-10-26', date_to: '2026-10-26' });
decide('Usup', r31.leave_id, 1, 'approve');
const d31 = decide('Uhr', r31.leave_id, 2, 'approve');
check('HR อนุมัติ → ขั้น 3 รอ (HR รับแทน) ไม่จบใบ', d31.ok && d31.moved_to_stage === 3 && row(r31.leave_id).stage3_status === 'pending', [d31, row(r31.leave_id)]);
check('hasOtherExecutive_: คนที่ตั้งไว้ไม่ใช่ผู้บริหาร → ถือว่าต้องรอขั้น 3', sandbox.hasOtherExecutive_('EMP-0011', 'EMP-0010') === true, '');
setSole('');

console.log('\n=== 32) Q1: ผู้บริหารยกเลิกใบตัวเอง ล็อกไม่ได้ → ไม่เขียนอะไรเลย ===');
const r32 = submit('Uboss', { date_from: '2026-10-27', date_to: '2026-10-27' });
const rowsBefore = leaves._objects().length;
onWaitLock = () => { throw new Error('Lock timeout'); };
const c32 = sandbox.requestCancelLeave({ lineUserId: 'Uboss', leave_id: r32.leave_id, reason: 'ติดประชุมด่วน' });
onWaitLock = null;
check('ตอบล็อกไม่ได้ · ไม่มีใบขอยกเลิกค้าง · ใบเดิมยังอนุมัติ', c32.ok === false && c32.error === 'lock_failed' &&
  leaves._objects().length === rowsBefore && row(r32.leave_id).final_status === 'approved', [c32, leaves._objects().length - rowsBefore]);
const c32b = sandbox.requestCancelLeave({ lineUserId: 'Uboss', leave_id: r32.leave_id, reason: 'ติดประชุมด่วน' });
check('ลองใหม่ได้ปกติ + ปล่อยล็อกแล้ว', c32b.ok && row(r32.leave_id).final_status === 'cancelled' && lockHeld === false, [c32b, lockHeld]);

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทุกข้อ');
process.exit(fails ? 1 : 0);
