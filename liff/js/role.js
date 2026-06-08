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
  sick:     'ลาป่วย',
  personal: 'ลากิจ',
  vacation: 'ลาพักร้อน',
};

window.STATUS_LABELS = {
  pending:  'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  skipped:  'ข้าม',
};
