/**
 * FlexCard.gs — สร้าง Flex Bubble card (I-004)
 *
 * Card types:
 *   - buildRegisterPendingCard       → ADMIN: มีคนสมัครใหม่
 *   - buildRegisterApprovedCard      → User: HR approve แล้ว
 *   - buildRegisterRejectedCard      → User: HR ปฏิเสธ
 *   - buildLeaveSubmittedCard        → ผู้ลา: ส่งใบลาสำเร็จ
 *   - buildApprovalRequestCard       → ผู้อนุมัติ: ขออนุมัติ stage X
 *   - buildApprovalUpdateCard        → ผู้ลา: stage X passed
 *   - buildFinalApprovedCard         → ผู้ลา + supervisor + ADMIN: approved ครบ
 *   - buildFinalRejectedCard         → ผู้ลา + ทุกคนที่ผ่าน: rejected
 *   - buildPairingInviteCard         → I-018 invite พร้อมปุ่มคัดลอก
 *   - buildSupervisorPairedCard      → User: มี supervisor ใหม่
 *   - buildQuotaSetCard              → User: HR ปรับ quota
 *
 * พื้นฐาน:
 *   - Header มี logo + brand
 *   - Body มีข้อมูลสำคัญ
 *   - Footer มีปุ่ม action (postback หรือ URI)
 */

// ========== Color & Brand helpers ==========

function flexColors_() {
  let cfg = {};
  try { cfg = getConfig(); } catch (e) {}
  return {
    primary:   cfg.brand_color_primary || '#d51f7d',
    tint:      cfg.brand_color_tint    || '#fce4ef',
    dark:      '#a01560',
    text:      '#222222',
    subtle:    '#666666',
    success:   '#1f8b4c',
    warning:   '#c08400',
    danger:    '#d51f7d',
    light:     '#ffffff',
    border:    '#e0e0e0',
  };
}

function brandName_() {
  try { return getConfig().brand_name || 'MENA COSMETICS'; }
  catch (e) { return 'MENA COSMETICS'; }
}

function brandLogoUrl_() {
  try {
    const url = getConfig().brand_logo_url || '';
    return url ? driveUrlToThumbnail_(url) : 'https://via.placeholder.com/120x120.png?text=V';
  } catch (e) { return 'https://via.placeholder.com/120x120.png?text=V'; }
}

/** Header block สำหรับทุก card */
function flexHeader_(label, accentColor) {
  const c = flexColors_();
  return {
    type: 'box', layout: 'horizontal', backgroundColor: c.tint,
    paddingAll: '12px', spacing: 'md',
    contents: [
      { type: 'image', url: brandLogoUrl_(), size: '48px', aspectMode: 'cover', aspectRatio: '1:1' },
      {
        type: 'box', layout: 'vertical', spacing: 'xs', flex: 1, contents: [
          { type: 'text', text: brandName_(), size: 'xs', color: c.subtle, weight: 'regular' },
          { type: 'text', text: String(label || ''), size: 'md', weight: 'bold', color: accentColor || c.primary, wrap: true },
        ],
      },
    ],
  };
}

function flexSeparator_() {
  return { type: 'separator', margin: 'md', color: flexColors_().border };
}

/** key-value row ใน body */
function flexKV_(key, value, valueColor) {
  const c = flexColors_();
  return {
    type: 'box', layout: 'baseline', spacing: 'sm', margin: 'sm',
    contents: [
      { type: 'text', text: String(key), size: 'sm', color: c.subtle, flex: 2 },
      { type: 'text', text: String(value == null ? '-' : value), size: 'sm', color: valueColor || c.text, flex: 5, wrap: true },
    ],
  };
}

function flexFooter_(buttons) {
  return {
    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
    contents: buttons,
  };
}

function btnPrimary_(label, postbackData) {
  return {
    type: 'button', style: 'primary', height: 'sm', color: flexColors_().primary,
    action: { type: 'postback', label: label, data: postbackData, displayText: label },
  };
}

function btnSecondary_(label, postbackData) {
  return {
    type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'postback', label: label, data: postbackData, displayText: label },
  };
}

function btnDanger_(label, postbackData) {
  return {
    type: 'button', style: 'primary', height: 'sm', color: flexColors_().dark,
    action: { type: 'postback', label: label, data: postbackData, displayText: label },
  };
}

function btnUri_(label, url) {
  return {
    type: 'button', style: 'link', height: 'sm',
    action: { type: 'uri', label: label, uri: url },
  };
}

// ========== Card builders ==========

/** ADMIN ได้ flex: มีคนสมัครใหม่ */
function buildRegisterPendingCard(user) {
  // user = Users row object
  const c = flexColors_();
  const empCode = user.emp_code || '-';
  return {
    type: 'flex', altText: 'มีพนักงานสมัครใหม่: ' + (user.display_name || empCode),
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('มีผู้สมัครใหม่ รอการอนุมัติ'),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('ชื่อ', user.display_name || '-'),
          flexKV_('รหัสพนักงาน', empCode),
          flexKV_('แผนก', user.department || '-'),
          flexKV_('ตำแหน่ง', user.position || '-'),
          flexKV_('โทร', user.phone || '-'),
          flexKV_('เวลาสมัคร', formatThaiDateTime(user.created_at)),
          flexSeparator_(),
          { type: 'text', text: 'กดอนุมัติเพื่อเปิดสิทธิ์ใช้งานระบบ', size: 'xs', color: c.subtle, margin: 'md', wrap: true },
        ],
      },
      footer: flexFooter_([
        btnPrimary_('✅ อนุมัติ', 'action=approve_register&user_id=' + encodeURIComponent(user.user_id)),
        btnDanger_('❌ ปฏิเสธ', 'action=reject_register&user_id=' + encodeURIComponent(user.user_id)),
      ]),
    },
  };
}

/** ผู้สมัคร ได้ flex: HR approved */
function buildRegisterApprovedCard(user) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'การลงทะเบียนของคุณได้รับอนุมัติแล้ว',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('การลงทะเบียนได้รับอนุมัติ', c.success),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', text: 'ยินดีต้อนรับ ' + (user.display_name || '') + ' 🌸',
            size: 'md', weight: 'bold', color: c.text, wrap: true },
          { type: 'text', text: 'คุณสามารถส่งใบลาผ่านระบบได้แล้ว', size: 'sm', color: c.subtle, margin: 'sm', wrap: true },
          flexSeparator_(),
          flexKV_('รหัสพนักงาน', user.emp_code || '-'),
          flexKV_('แผนก', user.department || '-'),
          flexKV_('ตำแหน่ง', user.position || '-'),
        ],
      },
      footer: flexFooter_([
        btnSecondary_('ดูคู่มือใช้งาน', 'action=open_manual'),
      ]),
    },
  };
}

/** ผู้สมัคร ได้ flex: rejected */
function buildRegisterRejectedCard(user, note) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'การลงทะเบียนของคุณยังไม่ได้รับการอนุมัติ',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('การลงทะเบียนยังไม่ได้รับการอนุมัติ', c.dark),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', text: 'หาก HR ต้องการให้คุณสมัครใหม่ กรุณาติดต่อ HR โดยตรง',
            size: 'sm', color: c.text, wrap: true },
          note ? flexKV_('หมายเหตุ', note) : { type: 'filler' },
        ],
      },
    },
  };
}

/** ผู้ลาได้ flex: ส่งใบลาแล้ว */
function buildLeaveSubmittedCard(leave, nextStageLabel) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'ส่งใบลาสำเร็จ ' + leave.leave_id,
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ส่งใบลาสำเร็จ', c.success),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('เลขที่ใบลา', leave.leave_id),
          flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('จำนวนวัน', leave.days + ' วัน'),
          flexSeparator_(),
          { type: 'text', text: 'ขั้นถัดไป: ' + (nextStageLabel || 'รออนุมัติ'),
            size: 'sm', color: c.primary, margin: 'md', weight: 'bold', wrap: true },
          { type: 'text', text: 'เมื่อมีการตัดสินใจ ระบบจะแจ้งให้ทราบทันที',
            size: 'xs', color: c.subtle, margin: 'sm', wrap: true },
        ],
      },
      footer: flexFooter_([
        btnSecondary_('ดูใบลาของฉัน', 'action=open_my_requests'),
      ]),
    },
  };
}

/**
 * Card สำหรับผู้อนุมัติ (ใช้ทุก stage 1/2/3)
 * @param leave  LeaveRequests row
 * @param requester  Users row (ผู้ลา)
 * @param stage  1 | 2 | 3
 */
function buildApprovalRequestCard(leave, requester, stage) {
  const c = flexColors_();
  const stageLabel = stage === 1 ? 'ขออนุมัติชั้น 1 (หัวหน้างาน)' :
                     stage === 2 ? 'ขออนุมัติชั้น 2 (HR)' :
                                   'ขออนุมัติชั้น 3 (เจ้าของ)';

  const body = {
    type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
      flexKV_('ผู้ลา', requester.display_name || requester.user_id),
      flexKV_('แผนก', requester.department || '-'),
      flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type) + (leave.is_retroactive ? ' (ย้อนหลัง)' : '')),
      flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
      flexKV_('จำนวนวัน', leave.days + ' วัน'),
      flexKV_('เหตุผล', leave.reason || '-'),
    ],
  };

  if (leave.attachment_url) {
    body.contents.push(flexSeparator_());
    body.contents.push({
      type: 'image',
      url: driveUrlToThumbnail_(leave.attachment_url),
      size: 'full',
      aspectRatio: '4:3',
      aspectMode: 'cover',
      margin: 'md',
      action: { type: 'uri', uri: leave.attachment_url },
    });
    body.contents.push({
      type: 'text', text: 'แตะรูปเพื่อดูเต็ม', size: 'xs', color: c.subtle, align: 'center', margin: 'xs',
    });
  }

  if (leave.gps_lat && leave.gps_lng) {
    const mapUrl = 'https://www.google.com/maps?q=' + leave.gps_lat + ',' + leave.gps_lng;
    body.contents.push(flexSeparator_());
    body.contents.push({
      type: 'box', layout: 'baseline', margin: 'md', contents: [
        { type: 'text', text: '📍 GPS', size: 'sm', color: c.subtle, flex: 2 },
        {
          type: 'text', text: 'ดูแผนที่', size: 'sm', color: c.primary, decoration: 'underline', flex: 5,
          action: { type: 'uri', uri: mapUrl },
        },
      ],
    });
  }

  return {
    type: 'flex', altText: stageLabel + ': ' + (requester.display_name || ''),
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_(stageLabel),
      body: body,
      footer: flexFooter_([
        btnPrimary_('✅ อนุมัติ',
          'action=approve_leave&id=' + encodeURIComponent(leave.leave_id) +
          '&stage=' + stage + '&decision=approve'),
        btnDanger_('❌ ไม่อนุมัติ',
          'action=approve_leave&id=' + encodeURIComponent(leave.leave_id) +
          '&stage=' + stage + '&decision=reject'),
      ]),
    },
  };
}

/** ผู้ลาได้ flex: stage X passed (ระหว่างทาง) */
function buildApprovalUpdateCard(leave, stagePassed, approverName, nextStageLabel) {
  const c = flexColors_();
  const stageNames = { 1: 'หัวหน้างาน', 2: 'ฝ่ายบุคคล (HR)', 3: 'เจ้าของ' };
  return {
    type: 'flex', altText: 'ใบลา ' + leave.leave_id + ' ผ่านชั้น ' + stagePassed,
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_(stageNames[stagePassed] + 'อนุมัติแล้ว', c.success),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('เลขที่ใบลา', leave.leave_id),
          flexKV_('ผู้อนุมัติชั้นนี้', approverName || '-'),
          flexKV_('วันที่ลา', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexSeparator_(),
          { type: 'text', text: 'ขั้นถัดไป: ' + (nextStageLabel || 'รออนุมัติ'),
            size: 'sm', color: c.primary, margin: 'md', weight: 'bold', wrap: true },
        ],
      },
    },
  };
}

/** final approved — ส่งหา ผู้ลา + supervisor + ADMIN */
function buildFinalApprovedCard(leave, requester) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'ใบลา ' + leave.leave_id + ' ได้รับอนุมัติแล้ว',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ใบลาได้รับอนุมัติแล้ว', c.success),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('เลขที่ใบลา', leave.leave_id),
          flexKV_('ผู้ลา', requester.display_name || requester.user_id),
          flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('จำนวนวัน', leave.days + ' วัน'),
          flexSeparator_(),
          { type: 'text', text: '✓ ผ่านครบทุกชั้นแล้ว', size: 'sm', color: c.success, margin: 'md', weight: 'bold', wrap: true },
        ],
      },
    },
  };
}

/** final rejected */
function buildFinalRejectedCard(leave, requester, rejectedStage, rejectedByName, note) {
  const c = flexColors_();
  const stageNames = { 1: 'หัวหน้างาน', 2: 'ฝ่ายบุคคล (HR)', 3: 'เจ้าของ' };
  return {
    type: 'flex', altText: 'ใบลา ' + leave.leave_id + ' ไม่ได้รับอนุมัติ',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ใบลาไม่ได้รับการอนุมัติ', c.dark),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('เลขที่ใบลา', leave.leave_id),
          flexKV_('ผู้ลา', requester.display_name || requester.user_id),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('ปฏิเสธโดย', (stageNames[rejectedStage] || '-') + ' (' + (rejectedByName || '-') + ')'),
          note ? flexKV_('หมายเหตุ', note) : { type: 'filler' },
        ],
      },
    },
  };
}

/** I-018 Pairing invite card — สำหรับ ADMIN/OWNER ส่งให้พนักงานใหม่ */
function buildPairingInviteCard(code, expiresAt, liffMyIdUrl) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'เชิญลงทะเบียน — รหัส ' + code,
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('เชิญเข้าใช้ระบบลางาน'),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', text: 'ใช้รหัสนี้ลงทะเบียน', size: 'sm', color: c.subtle, align: 'center' },
          {
            type: 'text', text: code,
            size: 'xxl', weight: 'bold', color: c.primary, align: 'center', margin: 'md',
          },
          flexKV_('หมดอายุ', formatThaiDateTime(expiresAt)),
          flexSeparator_(),
          { type: 'text', text: 'กดปุ่ม "เข้าระบบ" → ใส่รหัส 6 หลักนี้',
            size: 'xs', color: c.subtle, margin: 'md', wrap: true },
        ],
      },
      footer: flexFooter_([
        btnUri_('เข้าระบบลงทะเบียน', liffMyIdUrl || 'https://line.me'),
      ]),
    },
  };
}

/** USER: มี supervisor ใหม่ */
function buildSupervisorPairedCard(user, supervisor) {
  return {
    type: 'flex', altText: 'มีหัวหน้างานใหม่: ' + (supervisor.display_name || ''),
    contents: {
      type: 'bubble', size: 'kilo',
      header: flexHeader_('ระบบได้กำหนดหัวหน้างาน'),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('หัวหน้างาน', supervisor.display_name || '-'),
          flexKV_('แผนก', supervisor.department || '-'),
          flexKV_('ตำแหน่ง', supervisor.position || '-'),
        ],
      },
    },
  };
}

/** USER: HR ปรับ quota */
function buildQuotaSetCard(user, quota) {
  return {
    type: 'flex', altText: 'โควตาวันลาของคุณได้รับการปรับ',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('โควตาวันลาได้รับการปรับ'),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('ปี', String(quota.year)),
          flexKV_('ลาป่วย', quota.sick_total + ' วัน/ปี'),
          flexKV_('ลากิจ', quota.personal_total + ' วัน/ปี'),
          flexKV_('ลาพักร้อน', quota.vacation_total + ' วัน/ปี'),
        ],
      },
    },
  };
}

// ========== Helpers ==========

function leaveTypeLabel_(t) {
  return ({
    sick:     'ลาป่วย',
    personal: 'ลากิจ',
    vacation: 'ลาพักร้อน',
  })[t] || t;
}

// ========== Preview / test ==========

/** preview ทุก card หา OWNER เพื่อดูหน้าตา (I-008) */
function previewAllCardsToOwner() {
  const owners = getUsersByRole_(ROLES.OWNER);
  if (!owners.length) {
    console.log('ไม่มี OWNER ในระบบ — bootstrapFirstOwner() ก่อน');
    return;
  }
  const owner = owners[0];

  const mockUser = {
    user_id: 'EMP-9999', display_name: 'ทดสอบ นามสมมุติ',
    emp_code: 'TEST-001', department: 'Marketing', position: 'Tester',
    phone: '0812345678', created_at: nowBangkok(),
  };
  const mockLeave = {
    leave_id: 'LV-20260520-TEST', leave_type: 'sick',
    date_from: '2026-05-21', date_to: '2026-05-22', days: 2,
    reason: 'ทดสอบใบลา ไม่สบาย', is_retroactive: false,
    gps_lat: 13.7563, gps_lng: 100.5018,
    attachment_url: '',
  };
  const mockQuota = {
    year: 2026, sick_total: 30, personal_total: 6, vacation_total: 10,
  };

  pushMessage(owner.line_user_id, [
    buildRegisterPendingCard(mockUser),
    buildRegisterApprovedCard(mockUser),
    buildLeaveSubmittedCard(mockLeave, 'หัวหน้างานตรวจ'),
  ]);
  Utilities.sleep(500);
  pushMessage(owner.line_user_id, [
    buildApprovalRequestCard(mockLeave, mockUser, 1),
    buildApprovalRequestCard(mockLeave, mockUser, 2),
    buildApprovalRequestCard(mockLeave, mockUser, 3),
  ]);
  Utilities.sleep(500);
  pushMessage(owner.line_user_id, [
    buildApprovalUpdateCard(mockLeave, 1, 'หัวหน้า ก', 'รอ HR'),
    buildFinalApprovedCard(mockLeave, mockUser),
    buildFinalRejectedCard(mockLeave, mockUser, 2, 'HR ทดสอบ', 'เอกสารไม่ครบ'),
  ]);
  Utilities.sleep(500);
  pushMessage(owner.line_user_id, [
    buildPairingInviteCard('123456', nowBangkok(), 'https://liff.line.me/xxx'),
    buildSupervisorPairedCard(mockUser, { display_name: 'หัวหน้า ทดสอบ', department: 'Marketing', position: 'Manager' }),
    buildQuotaSetCard(mockUser, mockQuota),
  ]);
  console.log('preview ส่งให้ ' + owner.display_name + ' แล้ว');
}
