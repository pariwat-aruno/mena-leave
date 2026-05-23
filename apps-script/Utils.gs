/**
 * Utils.gs — helper พื้นฐาน
 *
 * - haversineMeters: ระยะ GPS เป็นเมตร
 * - nowBangkok / todayBangkok: ISO 8601 + offset +07:00
 * - nextUserId / nextLeaveId / nextPairId: gen running ID
 * - formatThaiDateTime: "10 พ.ค. 2026 เวลา 17:05 น."
 * - countLeaveDays: นับวันลา (option: ข้ามเสาร์-อาทิตย์)
 * - padLeft_: zero-pad number
 */

/** ระยะ GPS เป็นเมตร — สูตร haversine */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = function (deg) { return deg * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** ISO 8601 +07:00 ของเวลาปัจจุบัน */
function nowBangkok() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** yyyy-MM-dd ของวันนี้ (Asia/Bangkok) */
function todayBangkok() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
}

/** gen user_id ใหม่ — `EMP-XXXX` running */
function nextUserId() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Users');
  const last = sh.getLastRow();
  if (last < 2) return 'EMP-0001';
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; });
  let maxN = 0;
  ids.forEach(function (id) {
    const m = String(id).match(/^EMP-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return 'EMP-' + padLeft_(maxN + 1, 4);
}

/** gen leave_id ใหม่ — `LV-YYYYMMDD-XXXX` running per date */
function nextLeaveId() {
  const dateStr = todayBangkok();
  const ymd = dateStr.replace(/-/g, '');
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('LeaveRequests');
  const last = sh.getLastRow();
  let count = 0;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    ids.forEach(function (row) {
      if (String(row[0]).startsWith('LV-' + ymd + '-')) count++;
    });
  }
  return 'LV-' + ymd + '-' + padLeft_(count + 1, 4);
}

/** gen pair_id (Supervisors) — `SUP-XXXX` */
function nextPairId() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Supervisors');
  const last = sh.getLastRow();
  if (last < 2) return 'SUP-0001';
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let maxN = 0;
  ids.forEach(function (row) {
    const m = String(row[0]).match(/^SUP-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return 'SUP-' + padLeft_(maxN + 1, 4);
}

/** gen change_id (Pending_Changes) — `CHG-XXXX` */
function nextChangeId() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Pending_Changes');
  const last = sh.getLastRow();
  if (last < 2) return 'CHG-0001';
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let maxN = 0;
  ids.forEach(function (row) {
    const m = String(row[0]).match(/^CHG-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return 'CHG-' + padLeft_(maxN + 1, 4);
}

function padLeft_(n, width) {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/** format วันที่+เวลาเป็นไทยอ่านง่าย: "10 พ.ค. 2026 เวลา 17:05 น." */
function formatThaiDateTime(d) {
  d = d || new Date();
  if (!(d instanceof Date)) d = new Date(d);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const day = Utilities.formatDate(d, 'Asia/Bangkok', 'd');
  const monthIdx = Number(Utilities.formatDate(d, 'Asia/Bangkok', 'M')) - 1;
  const year = Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy');
  const time = Utilities.formatDate(d, 'Asia/Bangkok', 'HH:mm');
  return day + ' ' + months[monthIdx] + ' ' + year + ' เวลา ' + time + ' น.';
}

/** format วันที่ไทย short: "10 พ.ค. 2026" */
function formatThaiDateShort(d) {
  if (!d) return '';
  if (!(d instanceof Date)) d = new Date(d);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const day = Utilities.formatDate(d, 'Asia/Bangkok', 'd');
  const monthIdx = Number(Utilities.formatDate(d, 'Asia/Bangkok', 'M')) - 1;
  const year = Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy');
  return day + ' ' + months[monthIdx] + ' ' + year;
}

/**
 * นับจำนวนวันลา ระหว่าง date_from กับ date_to (inclusive)
 * @param {string} from yyyy-MM-dd
 * @param {string} to   yyyy-MM-dd
 * @param {boolean} countWeekends true=นับ ส-อา / false=ข้าม
 * @return {number}
 */
function countLeaveDays(from, to, countWeekends) {
  const d1 = new Date(from + 'T00:00:00+07:00');
  const d2 = new Date(to + 'T00:00:00+07:00');
  if (d2 < d1) return 0;
  let days = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const dow = cur.getDay(); // 0 = Sun, 6 = Sat
    if (countWeekends || (dow !== 0 && dow !== 6)) {
      days++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** สุ่ม 6-digit code (0-prefixed) */
function generate6DigitCode() {
  const n = Math.floor(Math.random() * 1000000);
  return padLeft_(n, 6);
}
