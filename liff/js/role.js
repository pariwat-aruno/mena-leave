/**
 * role.js — mirror Config.gs::ROLES + ROLE_LABELS_TH (I-022)
 */
window.ROLES = {
  OWNER:      'OWNER',
  ADMIN:      'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  SPECIAL:    'SPECIAL',
  USER:       'USER',
  VISITOR:    'VISITOR',
};

window.ROLE_LABELS_TH = {
  OWNER:      'ผู้บริหาร',
  ADMIN:      'HR',
  SUPERVISOR: 'หัวหน้างาน',
  SPECIAL:    'พนักงานพิเศษ',
  USER:       'พนักงาน',
  VISITOR:    'ยังไม่ลงทะเบียน',
};

window.ROLE_HIERARCHY = ['VISITOR', 'USER', 'SPECIAL', 'SUPERVISOR', 'ADMIN', 'OWNER'];

// role ที่ HR/ผู้บริหาร ตั้งให้พนักงานได้
window.ASSIGNABLE_ROLES = ['USER', 'SPECIAL', 'SUPERVISOR', 'ADMIN', 'OWNER'];

window.hasRole = function (userRole, requiredRole) {
  return window.ROLE_HIERARCHY.indexOf(userRole) >= window.ROLE_HIERARCHY.indexOf(requiredRole);
};

window.getRoleLabelTh = function (role, isSupervisor) {
  // legacy: USER ที่ติด flag is_supervisor → แสดงเป็นหัวหน้างาน
  if (isSupervisor && role === window.ROLES.USER) return 'หัวหน้างาน';
  return window.ROLE_LABELS_TH[role] || role;
};

window.getRoleBadgeClass = function (role, isSupervisor) {
  if (isSupervisor && role === window.ROLES.USER) return 'role-supervisor';
  if (role === window.ROLES.SUPERVISOR) return 'role-supervisor';
  return 'role-' + String(role).toLowerCase();
};

// proxy: พนักงานพิเศษ + HR + ผู้บริหาร กดลาแทนคนอื่นได้
window.canProxyLeave = function (role) {
  return role === window.ROLES.SPECIAL || window.hasRole(role, window.ROLES.ADMIN);
};

window.LEAVE_TYPE_LABELS = {
  sick:          'ลาป่วย',
  personal:      'ลากิจ',
  vacation:      'ลาพักร้อน',
  // ลาอื่น ๆ (ตามกฎหมายแรงงาน — ไม่หักโควตา)
  maternity:     'ลาคลอด',
  paternity:     'ลาช่วยภรรยาดูแลบุตร',
  sterilization: 'ลาเพื่อทำหมัน',
  military:      'ลาเพื่อรับราชการทหาร',
  training:      'ลาเพื่อรับการฝึกอบรม',
  ordination:    'ลาอุปสมบท',
};

// ประเภทลาที่มีโควตา (หัก sick/personal/vacation)
window.QUOTA_LEAVE_TYPES = ['sick', 'personal', 'vacation'];
window.isQuotaLeaveType = function (t) { return window.QUOTA_LEAVE_TYPES.indexOf(t) >= 0; };

// "ลาอื่น ๆ" — หัวข้อย่อยใน dropdown
// ⚠️ ห้ามเขียนจำนวนวันแจ้งล่วงหน้าไว้ที่นี่ — ค่าจริงอยู่ที่ Sheet LeaveRules (HR แก้เองได้)
//    หน้าจอต้องอ่านจาก getRules() เสมอ ไม่งั้นป้ายบอก 7 วัน แต่ระบบเช็ค 3 วัน
window.OTHER_LEAVE_TYPES = [
  { value: 'maternity',     label: 'ลาคลอด' },
  { value: 'paternity',     label: 'ลาช่วยภรรยาดูแลบุตร' },
  { value: 'sterilization', label: 'ลาเพื่อทำหมัน' },
  { value: 'military',      label: 'ลาเพื่อรับราชการทหาร' },
  { value: 'training',      label: 'ลาเพื่อรับการฝึกอบรม' },
  { value: 'ordination',    label: 'ลาอุปสมบท' },
];

window.STATUS_LABELS = {
  pending:   'รออนุมัติ',
  approved:  'อนุมัติแล้ว',
  rejected:  'ปฏิเสธ',
  skipped:   'ข้าม',
  withdrawn: 'ถอนแล้ว',
  cancelled: 'ยกเลิกแล้ว',
};

/** ข้อความเงื่อนไขของประเภทลา — สร้างจากกฎจริงที่ backend ส่งมา ไม่ใช่ข้อความตายในหน้าจอ */
window.ruleConditionText = function (rule) {
  if (!rule) return '';
  const parts = [];
  const advance = Number(rule.advance_notice_days || 0);
  if (rule.leave_type === 'sick') {
    // ลาป่วย: ป่วยกะทันหันส่งได้เลย ไม่ต้องติ๊กฉุกเฉิน (ตรงกับ UNFORESEEABLE_LEAVE_TYPES ฝั่ง backend)
    parts.push('ป่วยกะทันหันลาวันนี้หรือย้อนหลังได้เลย');
    const docAboveS = Number(rule.doc_required_above_days || 0);
    if (docAboveS > 0) parts.push('ลาตั้งแต่ ' + docAboveS + ' วันต้องมีใบรับรองแพทย์ — ส่งใบลาก่อนแล้วแนบทีหลังได้');
    const maxS = Number(rule.max_consecutive_days || 0);
    if (maxS > 0) parts.push('ลาติดกันได้ไม่เกิน ' + maxS + ' วัน');
    return parts.join(' · ');
  }
  if (advance > 0) {
    parts.push('เขียนใบลาล่วงหน้าอย่างน้อย ' + advance + ' วัน');
    const allowEmergency = !(rule.allow_emergency === false || rule.allow_emergency === 'FALSE');
    if (allowEmergency) parts.push('ถ้าไม่ทันให้ติ๊ก "เป็นกรณีฉุกเฉิน" พร้อมระบุเหตุผล');
  }
  const maxConsec = Number(rule.max_consecutive_days || 0);
  if (maxConsec > 0) parts.push('ลาติดกันได้ไม่เกิน ' + maxConsec + ' วัน');
  const docAbove = Number(rule.doc_required_above_days || 0);
  if (docAbove > 0) parts.push('ลาตั้งแต่ ' + docAbove + ' วันขึ้นไปต้องแนบเอกสาร');
  return parts.join(' · ');
};
