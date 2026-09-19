/**
 * Reminder.gs — เตือนซ้ำเมื่อผู้อนุมัติเงียบ
 *
 * โจทย์: "หัวหน้าไม่กดอะไรเลยเกิน 4 ชม. → เตือนอีกครั้ง"
 *
 * จุดที่ต้องระวัง: 4 ชั่วโมงนี้ต้องเป็น "ชั่วโมงทำงาน" ไม่ใช่ชั่วโมงนาฬิกา
 * ส่งใบลาสี่ทุ่ม แล้วเด้งเตือนหัวหน้าตอนตีสอง = ระบบกวนคน แล้วคนจะปิดแจ้งเตือนทิ้ง
 * ที่นี่นับเฉพาะช่วง work_start–work_end ของวันที่อยู่ใน work_days เท่านั้น
 *
 * ตั้งค่าได้ที่ Sheet `Settings`:
 *   work_start / work_end / work_days / reminder_hours / reminder_enabled
 *
 * ทำงานผ่าน trigger รายชั่วโมง (ดู Trigger.gs :: setupTriggers)
 */

/** อ่านค่าเวลาทำงานจาก Settings — คืนค่าที่ใช้คำนวณได้เสมอ */
function workHoursConfig_() {
  const cfg = getConfig();

  const parseHhmm = function (v, fallback) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return fallback;
    return h * 60 + mi;
  };

  const startMin = parseHhmm(cfg.work_start, 8 * 60 + 30);
  let endMin = parseHhmm(cfg.work_end, 17 * 60 + 30);
  if (endMin <= startMin) {
    logWarn('workHoursConfig_', 'work_end ไม่ได้อยู่หลัง work_start — ใช้ค่าเริ่มต้นแทน',
      { work_start: cfg.work_start, work_end: cfg.work_end });
    endMin = startMin + 8 * 60;
  }

  // work_days: "1,2,3,4,5,6" — 1=จันทร์ ... 7=อาทิตย์
  let days = String(cfg.work_days == null ? '1,2,3,4,5,6' : cfg.work_days)
    .split(',')
    .map(function (s) { return Number(String(s).trim()); })
    .filter(function (n) { return n >= 1 && n <= 7; });
  if (!days.length) {
    logWarn('workHoursConfig_', 'work_days ว่างหรือไม่ถูกต้อง — ใช้ จันทร์-เสาร์', { work_days: cfg.work_days });
    days = [1, 2, 3, 4, 5, 6];
  }

  return {
    startMin: startMin,
    endMin: endMin,
    days: days,
    reminderHours: Number(cfg.reminder_hours || 4) > 0 ? Number(cfg.reminder_hours) : 4,
    enabled: !(cfg.reminder_enabled === false || cfg.reminder_enabled === 'FALSE'),
  };
}

/** 1=จันทร์ ... 7=อาทิตย์ ของเวลานั้นตามเวลาไทย */
function isoWeekday_(date) {
  const dow = Number(Utilities.formatDate(date, 'Asia/Bangkok', 'u')); // 1=Mon..7=Sun
  return dow;
}

/** นาทีที่ผ่านไปในวันนั้น ตามเวลาไทย */
function minutesOfDay_(date) {
  const h = Number(Utilities.formatDate(date, 'Asia/Bangkok', 'H'));
  const m = Number(Utilities.formatDate(date, 'Asia/Bangkok', 'm'));
  return h * 60 + m;
}

/** ตอนนี้อยู่ในเวลาทำงานไหม */
function isWithinWorkHours_(date, wh) {
  const w = wh || workHoursConfig_();
  if (w.days.indexOf(isoWeekday_(date)) < 0) return false;
  const min = minutesOfDay_(date);
  return min >= w.startMin && min < w.endMin;
}

/**
 * นับ "นาทีทำงาน" ระหว่างสองเวลา
 * เดินทีละวันตามเวลาไทย แล้วบวกเฉพาะช่วงที่ทับกับเวลาทำงานของวันนั้น
 *
 * @param {Date} from
 * @param {Date} to
 * @return {number} นาที (0 ถ้า to <= from)
 */
function workingMinutesBetween_(from, to, wh) {
  const w = wh || workHoursConfig_();
  if (!(from instanceof Date) || !(to instanceof Date)) return 0;
  if (to <= from) return 0;

  // กันลูปยาวผิดปกติ (ข้อมูลวันที่เพี้ยน) — 400 วันพอเกินพอสำหรับทุกเคสจริง
  const MAX_DAYS = 400;

  let total = 0;
  let cursorYmd = Utilities.formatDate(from, 'Asia/Bangkok', 'yyyy-MM-dd');
  const lastYmd = Utilities.formatDate(to, 'Asia/Bangkok', 'yyyy-MM-dd');

  for (let guard = 0; guard <= MAX_DAYS; guard++) {
    const dayStart = new Date(cursorYmd + 'T00:00:00+07:00');
    if (w.days.indexOf(isoWeekday_(dayStart)) >= 0) {
      const workOpen = new Date(dayStart.getTime() + w.startMin * 60000);
      const workClose = new Date(dayStart.getTime() + w.endMin * 60000);
      const segStart = from > workOpen ? from : workOpen;
      const segEnd = to < workClose ? to : workClose;
      if (segEnd > segStart) total += (segEnd - segStart) / 60000;
    }
    if (cursorYmd === lastYmd) break;
    const next = new Date(dayStart.getTime() + 36 * 3600 * 1000); // +36 ชม. กันเหลื่อมวัน
    cursorYmd = Utilities.formatDate(next, 'Asia/Bangkok', 'yyyy-MM-dd');
    if (guard === MAX_DAYS) {
      logWarn('workingMinutesBetween_', 'ช่วงเวลายาวผิดปกติ หยุดนับที่ ' + MAX_DAYS + ' วัน',
        { from: String(from), to: String(to) });
    }
  }
  return total;
}

/** ชั้นที่ใบนี้ค้างอยู่ + เวลาที่ใบเข้าชั้นนั้น */
function pendingStageOf_(leave) {
  if (leave.stage1_status === 'pending') {
    return { stage: 1, since: leave.submitted_at };
  }
  if (leave.stage2_status === 'pending') {
    return { stage: 2, since: leave.stage1_at || leave.submitted_at };
  }
  if (leave.stage3_status === 'pending') {
    return { stage: 3, since: leave.stage2_at || leave.stage1_at || leave.submitted_at };
  }
  return null;
}

function toDateSafe_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * trigger รายชั่วโมง — ไล่ใบที่ค้าง แล้วเตือนผู้อนุมัติที่ยังไม่กด
 * เตือนซ้ำได้เรื่อย ๆ ทุก reminder_hours ชั่วโมงทำงาน จนกว่าจะมีคนกด
 */
function hourlyReminderTick(opts) {
  const force = !!(opts && opts.force);
  const wh = workHoursConfig_();
  if (!wh.enabled && !force) {
    logInfo('hourlyReminderTick', 'ปิดการเตือนซ้ำไว้ (reminder_enabled=FALSE) — ข้าม');
    return { ok: true, skipped: 'disabled' };
  }

  const now = new Date();
  if (!force && !isWithinWorkHours_(now, wh)) {
    // นอกเวลางาน ไม่เตือน — ค้างข้ามคืนจะไปเตือนเช้าวันทำงานถัดไปเอง
    return { ok: true, skipped: 'outside_work_hours' };
  }

  // ⭐ ถือล็อกเดียวกับ approveLeave ทั้งรอบ — ไม่งั้น tick ที่อ่านข้อมูลก่อนมีคนกดอนุมัติ
  //    จะเขียน reminder_count ทับหลังชั้นเปลี่ยนแล้ว → HR ได้สิทธิ์แทนผู้บริหารทั้งที่ผู้บริหารยังไม่เคยโดนเตือน
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    logWarn('hourlyReminderTick', 'ล็อกไม่ได้ — ข้ามรอบนี้');
    return { ok: false, error: 'lock_failed' };
  }
  const queue = [];
  const outbox = { push: function (to, msg) { queue.push([to, msg]); } };
  let res;
  try {
    res = hourlyReminderTickLocked_(wh, now, outbox);
  } finally {
    lock.releaseLock();
  }
  queue.forEach(function (q) {
    try { pushMessage(q[0], q[1]); }
    catch (e) { logError('hourlyReminderTick', 'push failed: ' + e.message, { to: q[0] }); }
  });
  return res;
}

/**
 * ส่วนที่อ่าน/เขียนชีตใต้ล็อก — "ไม่ยิงไลน์ตรงนี้" เก็บไว้ใน outbox แล้วค่อยส่งหลังปล่อยล็อก
 * (ยิงไลน์มี retry ช้าได้หลายวินาที ถ้าถือล็อกระหว่างนั้น คนกดอนุมัติจะได้ lock_failed)
 */
function hourlyReminderTickLocked_(wh, now, outbox) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (sh.getLastRow() < 2) return { ok: true, reminded: 0 };

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iRemindedAt = hdr.indexOf('last_reminded_at');
  const iRemindCount = hdr.indexOf('reminder_count');
  if (iRemindedAt < 0 || iRemindCount < 0) {
    logError('hourlyReminderTick', 'ยังไม่มีคอลัมน์ last_reminded_at / reminder_count — รัน setupDatabase() ก่อน');
    return { ok: false, error: 'missing_columns' };
  }

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const idx = loadUsersIndex_();
  const thresholdMin = wh.reminderHours * 60;

  let reminded = 0;
  let checked = 0;

  data.forEach(function (row, i) {
    const leave = {};
    hdr.forEach(function (h, j) { leave[h] = row[j]; });
    leave._rowNumber = i + 2;

    if (['pending'].indexOf(leave.final_status) < 0) return;
    const pending = pendingStageOf_(leave);
    if (!pending) return;
    checked++;

    const since = toDateSafe_(leave.last_reminded_at) || toDateSafe_(pending.since);
    if (!since) {
      logWarn('hourlyReminderTick', 'ใบลาไม่มีเวลาอ้างอิงให้นับ', { leaveId: leave.leave_id });
      return;
    }

    const quietMin = workingMinutesBetween_(since, now, wh);
    if (quietMin < thresholdMin) return;

    const requester = idx.byId[leave.user_id];
    if (!requester) {
      logWarn('hourlyReminderTick', 'ไม่พบผู้ลาของใบนี้', { leaveId: leave.leave_id, userId: leave.user_id });
      return;
    }

    const count = Number(leave.reminder_count || 0) + 1;
    const totalQuietMin = workingMinutesBetween_(toDateSafe_(pending.since), now, wh);
    const card = buildReminderCard(leave, requester, pending.stage, count, Math.round(totalQuietMin / 60));

    let sent = 0;
    try {
      if (leave.doc_request_status === 'requested') {
        // ผู้อนุมัติขอเอกสารเพิ่มไว้ — ตอนนี้รอผู้ลา ไม่ใช่รอผู้อนุมัติ → เตือนผู้ลาแทน
        if (requester.line_user_id && requester.status === 'active') {
          const asker = idx.byId[leave.doc_request_by] || {};
          outbox.push(requester.line_user_id,
            buildDocRequestCard(leave, requester, asker.display_name || '', leave.doc_request_note || '', true));
          sent++;
        }
      } else if (pending.stage === 1) {
        const sup = resolveStage1Approver_(leave.user_id, idx);
        if (sup && sup.line_user_id) { outbox.push(sup.line_user_id, card); sent++; }
      } else if (pending.stage === 2) {
        idx.list.forEach(function (u) {
          if (u.status === 'active' && u.role === ROLES.ADMIN && u.line_user_id) {
            outbox.push(u.line_user_id, card); sent++;
          }
        });
      } else if (pending.stage === 3) {
        const route = getExecutivesFor(leave.user_id, idx);
        route.users.forEach(function (u) {
          if (u.line_user_id) { outbox.push(u.line_user_id, card); sent++; }
        });
        // ⭐ ผู้บริหารไม่กด → แจ้ง HR ทุกรอบที่เตือน (ลูกค้าสั่ง 19 ก.ย. 69)
        //    HR อนุมัติ/ปฏิเสธแทนได้จากหน้าอนุมัติ (ดู hrMayActOnStage3_)
        const hrCard = buildReminderCard(leave, requester, pending.stage, count,
          Math.round(totalQuietMin / 60), { hrFallback: true, executivesUnreachable: route.hrFallback });
        idx.list.forEach(function (u) {
          if (u.status === 'active' && u.role === ROLES.ADMIN && u.line_user_id && u.user_id !== leave.user_id) {
            outbox.push(u.line_user_id, hrCard); sent++;
          }
        });
      }
    } catch (e) {
      logError('hourlyReminderTick', 'push reminder failed: ' + e.message, { leaveId: leave.leave_id });
      return;
    }

    if (!sent) {
      // ไม่มีใครให้ส่งเลย = ใบนี้ค้างแบบไม่มีผู้รับ ต้องดังให้ HR รู้ ไม่ใช่วนเงียบทุกชั่วโมง
      logError('hourlyReminderTick', 'ใบลาค้างโดยไม่มีผู้อนุมัติที่ติดต่อได้',
        { leaveId: leave.leave_id, stage: pending.stage, userId: leave.user_id });
      try {
        getUsersByRole_(ROLES.ADMIN).forEach(function (u) { if (u.line_user_id) outbox.push(u.line_user_id, buildStuckLeaveCard(leave, requester, pending.stage)); });
      } catch (e) {}
    }

    // บันทึกว่าเตือนไปแล้ว แม้กรณีไม่มีผู้รับ — กันวนเตือน HR ทุกชั่วโมง
    sh.getRange(leave._rowNumber, iRemindedAt + 1).setValue(nowBangkok());
    sh.getRange(leave._rowNumber, iRemindCount + 1).setValue(count);
    reminded++;
  });

  logInfo('hourlyReminderTick', 'ตรวจใบค้าง ' + checked + ' ใบ · เตือน ' + reminded + ' ใบ');
  return { ok: true, checked: checked, reminded: reminded };
}

// ========== test helper (I-008) ==========

/** ทดสอบการนับชั่วโมงทำงาน โดยไม่ต้องรอเวลาจริง */
function testWorkingHoursMath() {
  const wh = workHoursConfig_();
  console.log('เวลาทำงาน: ' + Math.floor(wh.startMin / 60) + ':' + padLeft_(wh.startMin % 60, 2) +
              ' - ' + Math.floor(wh.endMin / 60) + ':' + padLeft_(wh.endMin % 60, 2) +
              ' · วัน ' + wh.days.join(',') + ' · เตือนทุก ' + wh.reminderHours + ' ชม.');

  const cases = [
    ['2026-08-06T09:00:00+07:00', '2026-08-06T13:00:00+07:00', 'ในวันเดียวกัน 9 โมง → บ่ายโมง'],
    ['2026-08-06T22:00:00+07:00', '2026-08-07T09:30:00+07:00', 'ส่งสี่ทุ่ม → เช้าวันถัดไป 9:30'],
    ['2026-08-06T16:30:00+07:00', '2026-08-07T10:00:00+07:00', 'ส่งบ่ายแก่ ๆ → เช้าวันถัดไป'],
  ];
  cases.forEach(function (c) {
    const min = workingMinutesBetween_(new Date(c[0]), new Date(c[1]), wh);
    console.log(c[2] + ' = ' + (min / 60).toFixed(2) + ' ชม.ทำงาน');
  });
}

/**
 * ยิง reminder tick ทันทีโดยไม่สนว่าตอนนี้อยู่ในเวลางานไหม
 * ⚠️ ส่งไลน์จริงถึงผู้อนุมัติจริง — ใช้ตอนทดสอบเท่านั้น
 */
function testReminderTickNow() {
  const res = hourlyReminderTick({ force: true });
  console.log(JSON.stringify(res));
  return res;
}
