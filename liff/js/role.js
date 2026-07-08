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

// "ลาอื่น ๆ" — หัวข้อย่อย + เงื่อนไขการแจ้งล่วงหน้า (แสดงในหน้าเงื่อนไข + dropdown)
window.OTHER_LEAVE_TYPES = [
  { value: 'maternity',     label: 'ลาคลอด',                condition: 'เขียนใบลาล่วงหน้าอย่างน้อย 3 วัน หรือกรณีฉุกเฉินแจ้งฝ่ายบุคคลทันที' },
  { value: 'paternity',     label: 'ลาช่วยภรรยาดูแลบุตร',   condition: 'เขียนใบลาล่วงหน้า 7 วัน' },
  { value: 'sterilization', label: 'ลาเพื่อทำหมัน',         condition: 'เขียนใบลาล่วงหน้า 7 วัน' },
  { value: 'military',      label: 'ลาเพื่อรับราชการทหาร',  condition: 'เขียนใบลาล่วงหน้า 7 วัน' },
  { value: 'training',      label: 'ลาเพื่อรับการฝึกอบรม',  condition: 'เขียนใบลาล่วงหน้า 3 วัน' },
  { value: 'ordination',    label: 'ลาอุปสมบท',             condition: 'เขียนใบลาล่วงหน้า 15 วัน' },
];

window.STATUS_LABELS = {
  pending:  'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  skipped:  'ข้าม',
};
