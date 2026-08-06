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
 * ปี ค.ศ. ปัจจุบันตามเวลาไทย
 *
 * ⭐ ห้ามใช้ new Date().getFullYear() ตรง ๆ — getFullYear/getDay/getDate อ่านค่า
 * ตาม timezone ของ "โปรเจกต์ Apps Script" (ตั้งใน appsscript.json) ไม่ใช่เวลาไทย
 * ถ้าโปรเจกต์ถูกตั้งเป็นโซนอื่น เลขจะเพี้ยนเงียบ ๆ โดยไม่มี error ให้เห็น
 */
function currentYearBangkok_() {
  return Number(todayBangkok().slice(0, 4));
}

/**
 * แปลง 'yyyy-MM-dd' เป็น Date ที่ตรึงไว้ที่เที่ยงคืน UTC
 * ใช้คู่กับ getUTC* เท่านั้น เพื่อให้การคำนวณ "วันในปฏิทิน" ไม่ขึ้นกับ timezone ใด ๆ
 *
 * @param {string} ymd
 * @return {Date|null} null ถ้ารูปแบบไม่ใช่ yyyy-MM-dd
 */
function ymdToUtcDate_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').slice(0, 10));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

/** ปี ค.ศ. ของวันที่ 'yyyy-MM-dd' — ไม่ขึ้นกับ timezone ของโปรเจกต์ */
function yearOfYmd_(ymd) {
  const d = ymdToUtcDate_(ymd);
  return d ? d.getUTCFullYear() : currentYearBangkok_();
}

/**
 * นับจำนวนวันลา ระหว่าง date_from กับ date_to (inclusive)
 *
 * ⭐ ตรึงวันที่เป็นเที่ยงคืน UTC แล้วอ่านด้วย getUTCDay()
 * เดิมใช้ '+07:00' คู่กับ getDay() → getDay() แปลงกลับเป็น timezone ของโปรเจกต์
 * ตอนโปรเจกต์เป็น America/New_York เที่ยงคืนไทยคือ "บ่ายเมื่อวาน" ที่นิวยอร์ก
 * วันจันทร์เลยถูกมองเป็นวันอาทิตย์ → นับได้ 0 วัน → ส่งใบลาวันจันทร์ไม่ได้ทั้งปี
 * และวันเสาร์ถูกมองเป็นวันศุกร์ → โดนหักโควตาทั้งที่เป็นวันหยุด
 * ห้ามผสม '+07:00' กับ getUTC* หรือ 'Z' กับ getDay() เด็ดขาด
 *
 * @param {string} from yyyy-MM-dd
 * @param {string} to   yyyy-MM-dd
 * @param {boolean} countWeekends true=นับ ส-อา / false=ข้าม
 * @return {number}
 */
function countLeaveDays(from, to, countWeekends) {
  const d1 = ymdToUtcDate_(from);
  const d2 = ymdToUtcDate_(to);
  if (!d1 || !d2 || d2 < d1) return 0;
  let days = 0;
  const cur = new Date(d1.getTime());
  while (cur <= d2) {
    const dow = cur.getUTCDay(); // 0 = Sun, 6 = Sat
    if (countWeekends || (dow !== 0 && dow !== 6)) {
      days++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * เพิ่มแถวโดยอ้าง "ชื่อคอลัมน์" ไม่ใช่ลำดับ
 *
 * ตารางที่มีสามสิบกว่าคอลัมน์ ถ้าเขียน appendRow([...]) เรียงมือ
 * วันไหนแทรกคอลัมน์เพิ่ม ค่าจะเลื่อนไปลงผิดช่องทั้งแถวโดยไม่มี error ให้เห็น
 *
 * @param {Sheet} sh
 * @param {Object} obj  { ชื่อคอลัมน์: ค่า } — คอลัมน์ที่ไม่ได้ส่งมาจะเป็นค่าว่าง
 * @return {number} เลขแถวที่เพิ่ง append
 */
function appendRowByHeader_(sh, obj) {
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const unknown = Object.keys(obj).filter(function (k) { return hdr.indexOf(k) < 0; });
  if (unknown.length) {
    // เขียนลงคอลัมน์ที่ยังไม่มีในหัวตาราง = ค่าหายเงียบ ต้องดังไว้ก่อน
    throw new Error('ไม่มีคอลัมน์ ' + unknown.join(', ') + ' ใน tab ' + sh.getName() + ' — รัน setupDatabase() ก่อน');
  }
  const row = hdr.map(function (h) {
    return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
  });
  sh.appendRow(row);
  return sh.getLastRow();
}

/** แก้หลายคอลัมน์ในแถวเดียว โดยอ้างชื่อคอลัมน์ */
function updateRowByHeader_(sh, rowNumber, obj) {
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(obj).forEach(function (k) {
    const i = hdr.indexOf(k);
    if (i < 0) throw new Error('ไม่มีคอลัมน์ ' + k + ' ใน tab ' + sh.getName());
    sh.getRange(rowNumber, i + 1).setValue(obj[k]);
  });
}

/** สุ่ม 6-digit code (0-prefixed) */
function generate6DigitCode() {
  const n = Math.floor(Math.random() * 1000000);
  return padLeft_(n, 6);
}
