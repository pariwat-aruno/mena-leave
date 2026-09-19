/**
 * Export.gs — รายงานสถิติการลาและส่งออก CSV สำหรับ HR / ผู้บริหาร
 *
 * Actions:
 *   - getLeaveReport(payload)
 *   - exportLeaveReportCsv(payload)
 *   - getReportFilters(payload)
 */

/**
 * payload = {
 *   lineUserId,
 *   date_from: 'yyyy-MM-dd',
 *   date_to: 'yyyy-MM-dd',
 *   departments?: [string],
 *   user_ids?: [string],
 *   statuses?: [string]
 * }
 */
function getLeaveReport(payload) {
  try {
    payload = payload || {};
    if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
    return buildLeaveReport_(payload);
  } catch (err) {
    logError('getLeaveReport', err.message || String(err), { payload: payload || {} });
    return { ok: false, error: 'report_failed' };
  }
}

/** สร้าง CSV สองส่วน (สรุปรายบุคคล + รายละเอียดใบลา) แล้วบันทึกใน Drive */
function exportLeaveReportCsv(payload) {
  try {
    payload = payload || {};
    if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };

    const report = buildLeaveReport_(payload);
    if (!report.ok) return report;

    const lines = [];
    lines.push(reportCsvRow_(['สรุปรายบุคคล']));
    lines.push(reportCsvRow_([
      'รหัสพนักงาน', 'ชื่อพนักงาน', 'แผนก',
      'ลาป่วย (วัน)', 'ลากิจ (วัน)', 'ลาพักร้อน (วัน)', 'ลาอื่นตามกฎหมาย (วัน)',
      'ลาเป็นชั่วโมง', 'กรณีฉุกเฉิน (ครั้ง)', 'จำนวนใบลา',
    ]));
    report.summary.forEach(function (row) {
      lines.push(reportCsvRow_([
        row.emp_code, row.display_name, row.department,
        row.sick_days, row.personal_days, row.vacation_days, row.other_legal_days,
        row.hours, row.emergency_count, row.leave_count,
      ]));
    });

    lines.push('');
    lines.push(reportCsvRow_(['รายละเอียดใบลา']));
    lines.push(reportCsvRow_([
      'เลขที่ใบลา', 'รหัสพนักงาน', 'ชื่อพนักงาน', 'แผนก', 'ตำแหน่ง',
      'ประเภทการลา', 'วันที่เริ่ม', 'วันที่สิ้นสุด', 'หน่วย',
      'จำนวนวันในช่วงรายงาน', 'จำนวนชั่วโมง', 'กรณีฉุกเฉิน', 'สถานะ', 'ส่งเมื่อ',
    ]));
    report.rows.forEach(function (row) {
      lines.push(reportCsvRow_([
        row.leave_id, row.emp_code, row.display_name, row.department, row.position,
        row.leave_type_label, row.date_from, row.date_to,
        row.unit === 'hour' ? 'ชั่วโมง' : 'วัน',
        row.days_in_period, row.hours, row.is_emergency ? 'ใช่' : 'ไม่ใช่',
        reportStatusLabel_(row.final_status), row.submitted_at,
      ]));
    });

    const filename = 'leave-report_' + report.period.from + '_' + report.period.to + '.csv';
    const blob = Utilities.newBlob(
      '\uFEFF' + lines.join('\r\n'),
      'text/csv;charset=utf-8',
      filename
    );

    const rootId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
    if (!rootId) return { ok: false, error: 'drive_not_configured' };
    const root = DriveApp.getFolderById(rootId);
    const matches = root.getFoldersByName('reports');
    const folder = matches.hasNext() ? matches.next() : root.createFolder('reports');
    // ⭐ แชร์เฉพาะ "ไฟล์" ไม่แชร์ทั้งโฟลเดอร์ — โฟลเดอร์รวมรายงานทุกฉบับ (ชื่อพนักงาน + ลาป่วย)
    //    ใครได้ลิงก์โฟลเดอร์ไปจะเห็นย้อนหลังทั้งหมด

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { ok: true, url: file.getUrl(), filename: filename };
  } catch (err) {
    logError('exportLeaveReportCsv', err.message || String(err), { payload: payload || {} });
    return { ok: false, error: 'export_failed' };
  }
}

/** ตัวเลือกแผนกและพนักงานสำหรับหน้ารายงาน */
function getReportFilters(payload) {
  try {
    payload = payload || {};
    if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };
    const filters = buildReportFilters_(loadUsersIndex_());
    return {
      ok: true,
      departments: filters.departments,
      people: filters.people,
    };
  } catch (err) {
    logError('getReportFilters', err.message || String(err), { payload: payload || {} });
    return { ok: false, error: 'filters_failed' };
  }
}

/** อ่านข้อมูลจริงหนึ่งรอบแล้วสร้างทั้งรายละเอียดและยอดรวม */
function buildLeaveReport_(payload) {
  const validation = validateLeaveReportPayload_(payload);
  if (!validation.ok) return validation;

  const usersIndex = loadUsersIndex_();
  const filters = buildReportFilters_(usersIndex);
  const departmentSet = reportValueSet_(payload.departments);
  const userIdSet = reportValueSet_(payload.user_ids);
  const statuses = reportValueList_(payload.statuses);
  const statusSet = reportValueSet_(statuses.length ? statuses : ['approved', 'pending']);

  const cfg = getConfig();
  const countAllDays = reportBoolean_(cfg.count_weekends_as_leave);
  const workDays = workDaysIso_(cfg);

  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  if (!sh) throw new Error('sheet LeaveRequests not found');

  const rows = [];
  if (sh.getLastRow() >= 2) {
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

    data.forEach(function (raw) {
      const leave = {};
      hdr.forEach(function (h, i) { leave[h] = raw[i]; });

      if (String(leave.record_type || 'leave').toLowerCase() !== 'leave') return;
      const finalStatus = String(leave.final_status || '').toLowerCase();
      if (!statusSet[finalStatus]) return;

      const user = usersIndex.byId[leave.user_id] || {};
      const department = String(user.department || '');
      if (Object.keys(departmentSet).length && !departmentSet[department]) return;
      if (Object.keys(userIdSet).length && !userIdSet[String(leave.user_id || '')]) return;

      const leaveFrom = normalizeReportDate_(leave.date_from);
      const leaveTo = normalizeReportDate_(leave.date_to);
      if (!leaveFrom || !leaveTo) return;
      if (leaveFrom > validation.date_to || leaveTo < validation.date_from) return;

      const clippedFrom = leaveFrom < validation.date_from ? validation.date_from : leaveFrom;
      const clippedTo = leaveTo > validation.date_to ? validation.date_to : leaveTo;
      const unit = String(leave.leave_unit || 'day').toLowerCase() === 'hour' ? 'hour' : 'day';
      const hours = unit === 'hour' ? reportNonNegativeNumber_(leave.hours) : 0;
      const days = unit === 'hour'
        ? 0
        : countLeaveDays(clippedFrom, clippedTo, countAllDays, workDays);

      rows.push({
        leave_id: String(leave.leave_id || ''),
        emp_code: String(user.emp_code || ''),
        display_name: String(user.display_name || ''),
        department: department,
        position: String(user.position || ''),
        leave_type: String(leave.leave_type || ''),
        leave_type_label: String(leaveTypeLabel_(leave.leave_type) || leave.leave_type || ''),
        date_from: leaveFrom,
        date_to: leaveTo,
        unit: unit,
        days_in_period: days,
        hours: hours,
        is_emergency: reportBoolean_(leave.is_emergency),
        final_status: finalStatus,
        submitted_at: normalizeReportDateTime_(leave.submitted_at),
        _user_id: String(leave.user_id || ''),
      });
    });
  }

  rows.sort(function (a, b) {
    return a.date_from.localeCompare(b.date_from) ||
      a.display_name.localeCompare(b.display_name) ||
      a.leave_id.localeCompare(b.leave_id);
  });

  const summaryByUser = {};
  rows.forEach(function (row) {
    const key = row._user_id || row.emp_code || row.display_name || '(unknown)';
    if (!summaryByUser[key]) {
      summaryByUser[key] = {
        emp_code: row.emp_code,
        display_name: row.display_name,
        department: row.department,
        sick_days: 0,
        personal_days: 0,
        vacation_days: 0,
        other_legal_days: 0,
        hours: 0,
        emergency_count: 0,
        leave_count: 0,
      };
    }
    const item = summaryByUser[key];
    if (row.unit === 'hour') {
      item.hours += row.hours;
    } else if (row.leave_type === 'sick') {
      item.sick_days += row.days_in_period;
    } else if (row.leave_type === 'personal') {
      item.personal_days += row.days_in_period;
    } else if (row.leave_type === 'vacation') {
      item.vacation_days += row.days_in_period;
    } else {
      item.other_legal_days += row.days_in_period;
    }
    if (row.is_emergency) item.emergency_count++;
    item.leave_count++;
  });

  const summary = Object.keys(summaryByUser).map(function (key) { return summaryByUser[key]; });
  summary.sort(function (a, b) {
    return a.department.localeCompare(b.department) ||
      a.emp_code.localeCompare(b.emp_code) ||
      a.display_name.localeCompare(b.display_name);
  });

  rows.forEach(function (row) { delete row._user_id; });
  return {
    ok: true,
    period: { from: validation.date_from, to: validation.date_to },
    rows: rows,
    summary: summary,
    departments: filters.departments,
    people: filters.people,
  };
}

/** ตรวจรูปแบบวันที่ ลำดับวัน และจำกัดช่วงไม่เกิน 366 วัน */
function validateLeaveReportPayload_(payload) {
  const rawFrom = String((payload && payload.date_from) || '').trim();
  const rawTo = String((payload && payload.date_to) || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(rawTo)) {
    return { ok: false, error: 'invalid_dates' };
  }
  const from = normalizeReportDate_(rawFrom);
  const to = normalizeReportDate_(rawTo);
  if (!from || !to) return { ok: false, error: 'invalid_dates' };

  const fromDate = reportUtcDate_(from);
  const toDate = reportUtcDate_(to);
  if (!fromDate || !toDate || fromDate > toDate) {
    return { ok: false, error: 'invalid_date_range' };
  }
  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  if (days > 366) return { ok: false, error: 'range_too_large' };
  return { ok: true, date_from: from, date_to: to };
}

/** แปลง Date หรือข้อความจาก Sheet ให้เป็น yyyy-MM-dd ตามเวลาไทย */
function normalizeReportDate_(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return '';
  const ymd = match[1] + '-' + match[2] + '-' + match[3];
  return reportUtcDate_(ymd) ? ymd : '';
}

/** แปลงวันที่เป็น UTC โดยไม่ให้ timezone ของ runtime ทำให้วันเลื่อน */
function reportUtcDate_(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** แปลงเวลาที่ส่งใบลาให้อยู่ในรูปแบบคงที่เมื่อค่าใน Sheet เป็น Date */
function normalizeReportDateTime_(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(value);
}

/** สร้างตัวเลือกจากทะเบียนพนักงาน โดยเก็บประวัติของบัญชีที่ปิดไว้ด้วย */
function buildReportFilters_(usersIndex) {
  const departments = {};
  const people = [];
  (usersIndex.list || []).forEach(function (user) {
    if (!user.user_id) return;
    const department = String(user.department || '');
    if (department) departments[department] = true;
    people.push({
      user_id: String(user.user_id),
      emp_code: String(user.emp_code || ''),
      display_name: String(user.display_name || ''),
      department: department,
    });
  });
  people.sort(function (a, b) {
    return a.department.localeCompare(b.department) ||
      a.emp_code.localeCompare(b.emp_code) ||
      a.display_name.localeCompare(b.display_name);
  });
  return {
    departments: Object.keys(departments).sort(function (a, b) { return a.localeCompare(b); }),
    people: people,
  };
}

function reportValueList_(value) {
  if (!Array.isArray(value)) return [];
  const seen = {};
  return value.map(function (item) { return String(item == null ? '' : item).trim(); })
    .filter(function (item) {
      if (!item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
}

function reportValueSet_(value) {
  const out = {};
  reportValueList_(value).forEach(function (item) { out[item] = true; });
  return out;
}

function reportBoolean_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function reportNonNegativeNumber_(value) {
  const number = Number(value);
  return isFinite(number) && number > 0 ? number : 0;
}

/** ป้องกันสูตร CSV และครอบค่าที่มี comma/newline/quote */
function reportCsvCell_(value) {
  let text = String(value == null ? '' : value).replace(/\r\n|\r|\n/g, ' ');
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function reportCsvRow_(values) {
  return values.map(reportCsvCell_).join(',');
}

function reportStatusLabel_(status) {
  const labels = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    rejected: 'ปฏิเสธแล้ว',
    withdrawn: 'ถอนแล้ว',
    cancelled: 'ยกเลิกแล้ว',
  };
  return labels[status] || String(status || '');
}
