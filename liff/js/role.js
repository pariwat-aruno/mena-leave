/**
 * role.js — mirror Config.gs::ROLES + ROLE_LABELS_TH (I-022)
 */
window.ROLES = {
  OWNER:   'OWNER',
  ADMIN:   'ADMIN',
  USER:    'USER',
  VISITOR: 'VISITOR',
};

window.ROLE_LABELS_TH = {
  OWNER:   'เจ้าของ',
  ADMIN:   'ฝ่ายบุคคล (HR)',
  USER:    'พนักงาน',
  VISITOR: 'ยังไม่ลงทะเบียน',
};

window.ROLE_HIERARCHY = ['VISITOR', 'USER', 'ADMIN', 'OWNER'];

window.hasRole = function (userRole, requiredRole) {
  return window.ROLE_HIERARCHY.indexOf(userRole) >= window.ROLE_HIERARCHY.indexOf(requiredRole);
};

window.getRoleLabelTh = function (role, isSupervisor) {
  if (isSupervisor && role === window.ROLES.USER) return 'หัวหน้างาน';
  return window.ROLE_LABELS_TH[role] || role;
};

window.getRoleBadgeClass = function (role, isSupervisor) {
  if (isSupervisor && role === window.ROLES.USER) return 'role-supervisor';
  return 'role-' + String(role).toLowerCase();
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
