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

/** ปุ่มสีเข้ม (danger) แบบเปิด URL — ใช้กับ "ไม่อนุมัติ" ที่ต้องเปิด LIFF ไปกรอกเหตุผล */
function btnDangerUri_(label, url) {
  return {
    type: 'button', style: 'primary', height: 'sm', color: flexColors_().dark,
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
          flexKV_('จำนวน', leaveAmountText_(leave)),
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
function buildApprovalRequestCard(leave, requester, stage, opts) {
  opts = opts || {};
  const c = flexColors_();
  const isCancel = (leave.record_type || 'leave') === 'cancel';
  // ผู้อนุมัติขั้นแรกเป็นผู้บริหาร — ชั้น 2/3 ถูกข้าม (ดู computeInitialStages_)
  const ownerFirst = stage === 1 && leave.stage2_status === 'skipped' && leave.stage3_status === 'skipped';
  const who = opts.hrFallback ? '(HR อนุมัติแทนผู้บริหาร)'
    : ownerFirst ? '(ผู้บริหาร)'
    : stage === 1 ? '(หัวหน้างาน)' : stage === 2 ? '(HR)' : '(ผู้บริหาร)';
  const stageLabel = (isCancel ? 'ขออนุมัติยกเลิกวันลา ชั้น ' : 'ขออนุมัติชั้น ') + stage + ' ' + who;

  const body = {
    type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
      flexKV_('ผู้ลา', requester.display_name || requester.user_id),
      flexKV_('แผนก', requester.department || '-'),
      flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type) + (leave.is_retroactive && !isCancel ? ' (ย้อนหลัง)' : '')),
      flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
      flexKV_('จำนวน', leaveAmountText_(leave)),
      flexKV_(isCancel ? 'เหตุผลที่ขอยกเลิก' : 'เหตุผล', leave.reason || '-'),
    ],
  };

  if (isCancel) {
    body.contents.unshift({
      type: 'box', layout: 'vertical', margin: 'none', spacing: 'xs',
      backgroundColor: '#eef4ff', paddingAll: '10px', cornerRadius: '6px',
      contents: [
        { type: 'text', text: 'ใบขอยกเลิกวันลาที่อนุมัติไปแล้ว', size: 'sm', weight: 'bold', color: '#1a4fa0' },
        { type: 'text', size: 'xs', color: c.subtle, wrap: true,
          text: 'อนุมัติแล้ววันลาใบเดิม (' + (leave.parent_leave_id || '-') + ') จะถูกยกเลิกและคืนโควตาให้ผู้ลา' },
      ],
    });
  }

  if (opts.hrFallback) {
    body.contents.unshift({
      type: 'box', layout: 'vertical', margin: 'none', spacing: 'xs',
      backgroundColor: '#fff8e6', paddingAll: '10px', cornerRadius: '6px',
      contents: [
        { type: 'text', text: 'ผู้บริหารในสายของพนักงานคนนี้ยังรับใบลาไม่ได้', size: 'sm', weight: 'bold', color: c.warning, wrap: true },
        { type: 'text', size: 'xs', color: c.subtle, wrap: true,
          text: '(ยังไม่ผูกไลน์ หรือปิดบัญชีอยู่) ระบบจึงส่งให้ HR ตัดสินแทน' },
      ],
    });
  }

  // ลาป่วยส่งก่อน เอกสารตามมาทีหลัง — ผู้อนุมัติต้องรู้ว่ายังไม่มีใบรับรองแพทย์
  if (isTruthyCell_(leave.doc_pending)) {
    body.contents.push(flexKV_('เอกสาร', 'ยังไม่แนบ — ผู้ลาจะแนบตามมาภายหลัง', c.warning));
  }

  // ยื่นไม่ทันกำหนดแล้วติ๊กว่าเร่งด่วน — ผู้อนุมัติต้องเห็นก่อนกด
  if (leave.is_emergency === true || leave.is_emergency === 'TRUE') {
    body.contents.push(flexSeparator_());
    body.contents.push({
      type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
      backgroundColor: '#fdeaea', paddingAll: '10px', cornerRadius: '6px',
      contents: [
        { type: 'text', text: '⚠️ แจ้งไม่ทันกำหนด — ลากะทันหัน/ฉุกเฉิน',
          size: 'sm', weight: 'bold', color: '#b3261e', wrap: true },
        { type: 'text', size: 'xs', color: c.subtle, wrap: true,
          text: leave.emergency_reason ? 'เหตุผล: ' + leave.emergency_reason : 'ไม่ได้ระบุเหตุผล' },
      ],
    });
  }

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

  if (isCancel) {
    // ใบขอยกเลิกไม่ได้เก็บพิกัด — ไม่ต้องขึ้นธง "ไม่มีพิกัดยืนยัน" ให้เข้าใจผิดว่าผิดปกติ
  } else if (leave.gps_lat && leave.gps_lng) {
    const mapUrl = 'https://www.google.com/maps?q=' + leave.gps_lat + ',' + leave.gps_lng;
    body.contents.push(flexSeparator_());
    body.contents.push({
      type: 'box', layout: 'baseline', margin: 'md', contents: [
        { type: 'text', text: 'GPS', size: 'sm', color: c.subtle, flex: 2 },
        {
          type: 'text', text: 'ดูแผนที่', size: 'sm', color: c.primary, decoration: 'underline', flex: 5,
          action: { type: 'uri', uri: mapUrl },
        },
      ],
    });
  } else {
    // เปิด GPS ไม่ได้ — ผู้อนุมัติต้องเห็นว่าใบลานี้ไม่มีพิกัดยืนยัน พร้อมเหตุผลที่ผู้ลาแจ้ง
    body.contents.push(flexSeparator_());
    body.contents.push({
      type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
      backgroundColor: '#fff8e6', paddingAll: '10px', cornerRadius: '6px',
      contents: [
        { type: 'text', text: '⚠️ ไม่มีพิกัดยืนยัน', size: 'sm', weight: 'bold', color: c.warning },
        {
          type: 'text', size: 'xs', color: c.subtle, wrap: true,
          text: leave.gps_missing_reason
            ? 'ผู้ลาแจ้งว่า: ' + leave.gps_missing_reason
            : 'ผู้ลาไม่ได้ระบุเหตุผล',
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
      // อนุมัติ = กดในแชทได้เลย · ไม่อนุมัติ = เปิด LIFF เพื่อ "บังคับระบุเหตุผล" (PDF ข้อ 2)
      footer: flexFooter_([
        btnPrimary_(isCancel ? '✅ อนุมัติให้ยกเลิก' : '✅ อนุมัติ',
          'action=approve_leave&id=' + encodeURIComponent(leave.leave_id) +
          '&stage=' + stage + '&decision=approve'),
        btnDangerUri_('❌ ไม่อนุมัติ (ระบุเหตุผล)', getLiffPageUrl('approve') + '?id=' + encodeURIComponent(leave.leave_id)),
      ]),
    },
  };
}

/** ผู้ลาได้ flex: stage X passed (ระหว่างทาง) */
function buildApprovalUpdateCard(leave, stagePassed, approverName, nextStageLabel) {
  const c = flexColors_();
  const stageNames = { 1: 'หัวหน้างาน', 2: 'HR', 3: 'ผู้บริหาร' };
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
          flexKV_('จำนวน', leaveAmountText_(leave)),
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
  const stageNames = { 1: 'หัวหน้างาน', 2: 'HR', 3: 'ผู้บริหาร' };
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

/**
 * Report card (PDF ข้อ 2) — หัวหน้างานปฏิเสธใบลาตั้งแต่ชั้น 1
 * ส่งให้ HR + ผู้บริหารรับทราบ (ปกติจะไม่เห็นใบลาที่ถูกปฏิเสธชั้นแรกเลย)
 */
function buildStage1RejectReportCard(leave, requester, rejectedByName, note) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'รายงาน: หัวหน้างานปฏิเสธใบลา ' + leave.leave_id,
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('รายงาน: หัวหน้างานปฏิเสธใบลา', c.dark),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', text: 'ใบลานี้ถูกปฏิเสธที่ชั้นหัวหน้างาน จึงไม่ถูกส่งต่อมายัง HR/ผู้บริหาร แจ้งเพื่อรับทราบ',
            size: 'xs', color: c.subtle, wrap: true, margin: 'none' },
          flexSeparator_(),
          flexKV_('เลขที่ใบลา', leave.leave_id),
          flexKV_('ผู้ลา', requester.display_name || requester.user_id),
          flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('จำนวน', leaveAmountText_(leave)),
          flexKV_('ปฏิเสธโดย', 'หัวหน้างาน (' + (rejectedByName || '-') + ')'),
          flexKV_('เหตุผลการปฏิเสธ', note || '(ไม่ได้ระบุ)'),
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

// ========== ผังอำนาจอนุมัติ / cc HR / ยกเลิก / เตือนซ้ำ ==========

/** ผู้ลาได้รู้ว่าใบลาของตัวเองจะวิ่งไปหาใคร */
function buildApprovalChainSetCard(user, supervisor, executives) {
  const c = flexColors_();
  const execNames = (executives || []).map(function (u) { return u.display_name || u.user_id; });
  return {
    type: 'flex', altText: 'สายอนุมัติใบลาของคุณถูกปรับ',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('สายอนุมัติใบลาของคุณ'),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('พนักงาน', user.display_name || user.user_id),
          flexKV_('หัวหน้างาน', supervisor ? (supervisor.display_name || supervisor.user_id) : 'ยังไม่ได้กำหนด'),
          flexKV_('ผู้บริหาร', execNames.length ? execNames.join(', ') : 'ยังไม่ได้กำหนด'),
          flexSeparator_(),
          { type: 'text', margin: 'md', size: 'xs', color: c.subtle, wrap: true,
            text: 'ใบลาที่คุณส่งจะเข้าหัวหน้างานก่อน แล้วต่อไป HR และผู้บริหารตามลำดับ' },
        ],
      },
    },
  };
}

/** HR ได้รับสำเนา: มีใบลาเข้ามาแล้ว รอใครอยู่ (การ์ดอ่านอย่างเดียว ไม่มีปุ่มอนุมัติ) */
function buildHrNoticeCard(leave, requester, supervisor, statusLabel) {
  const c = flexColors_();
  const isCancel = (leave.record_type || 'leave') === 'cancel';
  return {
    type: 'flex', altText: 'สำเนาถึง HR: ' + (requester.display_name || '') + ' ส่งใบลา',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_(isCancel ? 'สำเนาถึง HR — ขอยกเลิกวันลา' : 'สำเนาถึง HR — มีใบลาเข้าใหม่', c.subtle),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('ผู้ลา', requester.display_name || requester.user_id),
          flexKV_('แผนก', requester.department || '-'),
          flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type)),
          flexKV_('จำนวน', leaveAmountText_(leave)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('หัวหน้างาน', supervisor ? (supervisor.display_name || supervisor.user_id) : 'ไม่มี (เข้า HR โดยตรง)'),
          flexKV_('สถานะ', statusLabel || 'รอดำเนินการ', c.warning),
          flexSeparator_(),
          { type: 'text', margin: 'md', size: 'xs', color: c.subtle, wrap: true,
            text: 'แจ้งเพื่อทราบ ยังไม่ถึงคิว HR ตัดสิน — จะมีการ์ดขออนุมัติส่งมาอีกครั้งเมื่อหัวหน้างานกดแล้ว' },
        ],
      },
      footer: flexFooter_([ btnUri_('เปิดหน้าอนุมัติ', getLiffPageUrl('approve')) ]),
    },
  };
}

/** ผู้ลาถอนใบลาเอง (ยังไม่มีใครกด) */
function buildLeaveWithdrawnCard(leave, requester, byName, note) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'ใบลา ' + leave.leave_id + ' ถูกถอน',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ใบลาถูกถอน', c.subtle),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('เลขที่ใบลา', leave.leave_id),
          flexKV_('ผู้ลา', requester.display_name || requester.user_id),
          flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('ถอนโดย', byName || '-'),
          flexKV_('เหตุผล', note || '-'),
          flexSeparator_(),
          { type: 'text', margin: 'md', size: 'xs', color: c.subtle, wrap: true,
            text: 'ไม่ต้องดำเนินการใด ๆ ต่อ — โควตาที่จองไว้คืนให้ผู้ลาแล้ว' },
        ],
      },
    },
  };
}

/** ส่งใบขอยกเลิกวันลาแล้ว รออนุมัติ */
function buildCancelSubmittedCard(cancelRow, parent, nextStageLabel) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'ส่งใบขอยกเลิกวันลาแล้ว',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ส่งใบขอยกเลิกวันลาแล้ว'),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('เลขที่ใบขอยกเลิก', cancelRow.leave_id),
          flexKV_('ใบลาที่ขอยกเลิก', parent ? parent.leave_id : (cancelRow.parent_leave_id || '-')),
          flexKV_('ประเภท', leaveTypeLabel_(cancelRow.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(cancelRow.date_from) + ' - ' + formatThaiDateShort(cancelRow.date_to)),
          flexKV_('เหตุผล', cancelRow.reason || '-'),
          flexSeparator_(),
          { type: 'text', margin: 'md', size: 'sm', weight: 'bold', color: c.primary, wrap: true,
            text: 'ขั้นถัดไป: ' + (nextStageLabel || 'รออนุมัติ') },
          { type: 'text', margin: 'xs', size: 'xs', color: c.subtle, wrap: true,
            text: 'วันลาเดิมยังมีผลอยู่จนกว่าใบขอยกเลิกจะได้รับอนุมัติครบทุกชั้น' },
        ],
      },
    },
  };
}

/** ผลของใบขอยกเลิก — อนุมัติ (ใบลาเดิมถูกยกเลิก) หรือ ไม่อนุมัติ (ใบลาเดิมยังอยู่) */
function buildCancelResultCard(cancelRow, parent, requester, approved, byName, note) {
  const c = flexColors_();
  const body = {
    type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
      flexKV_('ผู้ลา', requester.display_name || requester.user_id),
      flexKV_('ใบลา', parent ? parent.leave_id : (cancelRow.parent_leave_id || '-')),
      flexKV_('ประเภท', leaveTypeLabel_(cancelRow.leave_type)),
      flexKV_('วันที่', formatThaiDateShort(cancelRow.date_from) + ' - ' + formatThaiDateShort(cancelRow.date_to)),
      flexKV_('จำนวน', leaveAmountText_(cancelRow)),
    ],
  };
  if (byName) body.contents.push(flexKV_('ผู้ตัดสิน', byName));
  if (note) body.contents.push(flexKV_('หมายเหตุ', note));
  body.contents.push(flexSeparator_());
  body.contents.push({
    type: 'text', margin: 'md', size: 'sm', weight: 'bold', wrap: true,
    color: approved ? c.success : c.warning,
    text: approved
      ? 'ยกเลิกวันลาเรียบร้อย — คืนโควตา ' + cancelRow.days + ' วันให้ผู้ลาแล้ว'
      : 'ไม่อนุมัติให้ยกเลิก — วันลาเดิมยังมีผลตามเดิม',
  });

  return {
    type: 'flex',
    altText: approved ? 'ยกเลิกวันลาเรียบร้อย' : 'ไม่อนุมัติให้ยกเลิกวันลา',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_(approved ? 'ยกเลิกวันลาเรียบร้อย' : 'ไม่อนุมัติให้ยกเลิกวันลา',
        approved ? c.success : c.warning),
      body: body,
    },
  };
}

/**
 * เตือนซ้ำ: ใบนี้ค้างอยู่ที่คุณ
 * ใช้โทนแดงตั้งแต่ครั้งแรก เพราะเป็นการ์ดที่ต้องสะดุดตากว่าการ์ดขออนุมัติปกติ
 */
function buildReminderCard(leave, requester, stage, count, quietHours, opts) {
  opts = opts || {};
  const c = flexColors_();
  const alert = '#b3261e';
  const isCancel = (leave.record_type || 'leave') === 'cancel';
  const stageName = stage === 1 ? 'หัวหน้างาน' : stage === 2 ? 'HR' : 'ผู้บริหาร';
  // สำเนาถึง HR ตอนผู้บริหารเงียบ — HR ตัดสินแทนได้
  const headText = opts.hrFallback
    ? (opts.executivesUnreachable ? 'ผู้บริหารในสายยังรับใบไม่ได้ — HR ตัดสินแทนได้'
                                  : 'ผู้บริหารยังไม่อนุมัติ — HR ตัดสินแทนได้')
    : 'เตือนครั้งที่ ' + count + ' — ใบลายังรอคุณอยู่';

  return {
    type: 'flex',
    altText: 'เตือน: ใบลา ' + leave.leave_id + ' รอคุณอยู่ ' + quietHours + ' ชม.ทำงาน',
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'horizontal', backgroundColor: alert,
        paddingAll: '12px', spacing: 'md',
        contents: [{
          type: 'box', layout: 'vertical', spacing: 'xs', flex: 1, contents: [
            { type: 'text', text: brandName_(), size: 'xs', color: '#ffd9d6' },
            { type: 'text', size: 'md', weight: 'bold', color: '#ffffff', wrap: true,
              text: headText },
          ],
        }],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', size: 'sm', weight: 'bold', color: alert, wrap: true,
            text: 'ค้างที่ชั้น' + stageName + 'มา ' + quietHours + ' ชั่วโมงทำงานแล้ว' },
          flexSeparator_(),
          flexKV_('เลขที่', leave.leave_id),
          flexKV_('ผู้ลา', requester.display_name || requester.user_id),
          flexKV_('แผนก', requester.department || '-'),
          flexKV_('ประเภท', (isCancel ? 'ขอยกเลิก — ' : '') + leaveTypeLabel_(leave.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('จำนวน', leaveAmountText_(leave)),
          flexKV_('เหตุผล', leave.reason || '-'),
          (leave.is_emergency === true || leave.is_emergency === 'TRUE')
            ? flexKV_('กรณีฉุกเฉิน', leave.emergency_reason || 'ผู้ลาระบุว่าเร่งด่วน', alert)
            : { type: 'filler' },
        ],
      },
      footer: flexFooter_([
        btnPrimary_('✅ อนุมัติ',
          'action=approve_leave&id=' + encodeURIComponent(leave.leave_id) +
          '&stage=' + stage + '&decision=approve'),
        btnDangerUri_('❌ ไม่อนุมัติ (ระบุเหตุผล)', getLiffPageUrl('approve') + '?id=' + encodeURIComponent(leave.leave_id)),
      ]),
    },
  };
}

/** ใบค้างแบบไม่มีผู้อนุมัติให้ส่งเลย — HR ต้องเข้าไปแก้ผังอำนาจ */
function buildStuckLeaveCard(leave, requester, stage) {
  const c = flexColors_();
  const stageName = stage === 1 ? 'หัวหน้างาน' : stage === 2 ? 'HR' : 'ผู้บริหาร';
  return {
    type: 'flex', altText: 'ใบลา ' + leave.leave_id + ' ค้างโดยไม่มีผู้อนุมัติ',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ใบลาค้างโดยไม่มีผู้อนุมัติ', c.warning),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('เลขที่', leave.leave_id),
          flexKV_('ผู้ลา', requester.display_name || requester.user_id),
          flexKV_('ค้างที่ชั้น', stageName),
          flexSeparator_(),
          { type: 'text', margin: 'md', size: 'xs', color: c.subtle, wrap: true,
            text: 'ไม่มีผู้อนุมัติที่ติดต่อได้ในชั้นนี้ (ยังไม่ได้ตั้งสายงาน หรือคนที่ตั้งไว้ถูกปิดบัญชี/ยังไม่ผูกไลน์) กรุณาแก้ที่หน้าผังอำนาจอนุมัติ' },
        ],
      },
      footer: flexFooter_([ btnUri_('เปิดผังอำนาจอนุมัติ', getLiffPageUrl('approval-chain')) ]),
    },
  };
}

// ========== Helpers ==========

function leaveTypeLabel_(t) {
  // อ่านจากนิยามกลาง LEAVE_TYPE_META (Quota.gs) — รองรับทั้งประเภทมีโควตา + ลาอื่นๆ
  if (typeof LEAVE_TYPE_META !== 'undefined' && LEAVE_TYPE_META[t] && LEAVE_TYPE_META[t].label) {
    return LEAVE_TYPE_META[t].label;
  }
  return t;
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

/**
 * HR ได้ flex: มีพนักงานผูกบัญชีเข้าระบบเอง (ไม่ต้องกดอะไร — แจ้งให้เห็นความคืบหน้า)
 * ใช้ตอนพาพนักงานทั้งบริษัทเข้าระบบ HR จะได้รู้ว่าใครเข้ามาแล้วบ้างโดยไม่ต้องเปิดหน้าจอเช็ค
 */
function buildClaimNoticeCard(user) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'ผูกบัญชีแล้ว: ' + (user.display_name || user.emp_code || ''),
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('พนักงานผูกบัญชีเข้าระบบแล้ว', c.success),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('ชื่อ', user.display_name || '-'),
          flexKV_('รหัสพนักงาน', normEmpCode_(user.emp_code) || '-'),
          flexKV_('แผนก', user.department || '-'),
          flexKV_('ตำแหน่ง', user.position || '-'),
          flexKV_('เวลา', formatThaiDateTime(nowBangkok())),
          flexSeparator_(),
          { type: 'text', text: 'ผูกด้วยรหัสพนักงาน + ชื่อ-นามสกุล ใช้งานระบบได้แล้ว ไม่ต้องกดอนุมัติ',
            size: 'xs', color: c.subtle, margin: 'md', wrap: true },
        ],
      },
    },
  };
}

/**
 * คนที่เพิ่งเพิ่มเพื่อน OA ได้ flex: บอกว่าต้องผูกบัญชีก่อน + ปุ่มพาไปหน้าผูกเลย
 * ⭐ นี่คือจุดที่ถูกที่สุดในการบอกวิธี — ยิงเองอัตโนมัติตอนสแกน QR เพิ่มเพื่อน
 *    ไม่ต้องให้ HR ส่งอะไรตามหลัง
 */
function buildWelcomeClaimCard(liffClaimUrl) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'ยินดีต้อนรับ — ผูกบัญชีเพื่อเริ่มใช้ระบบลางาน',
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ยินดีต้อนรับสู่ระบบลางาน'),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', text: 'อีก 1 ขั้นตอนก่อนเริ่มใช้งาน', size: 'md', weight: 'bold',
            color: c.text, wrap: true },
          { type: 'text', text: 'กดปุ่มด้านล่าง แล้วกรอก 2 อย่าง', size: 'sm', color: c.subtle,
            margin: 'md', wrap: true },
          flexKV_('1', 'รหัสพนักงานของคุณ'),
          flexKV_('2', 'ชื่อ-นามสกุล'),
          flexSeparator_(),
          { type: 'text', text: 'ทำครั้งเดียวจบ หลังจากนี้กดเมนูด้านล่างส่งใบลาได้เลย',
            size: 'xs', color: c.subtle, margin: 'md', wrap: true },
          { type: 'text', text: 'ถ้าผูกไม่ได้ กรุณาติดต่อฝ่ายบุคคล',
            size: 'xs', color: c.subtle, margin: 'sm', wrap: true },
        ],
      },
      footer: flexFooter_([
        btnUri_('ผูกบัญชีของฉัน', liffClaimUrl || 'https://line.me'),
      ]),
    },
  };
}

// ========== ขอเอกสารเพิ่ม / แนบเอกสารทีหลัง ==========

/**
 * ผู้ลาได้: ผู้อนุมัติขอเอกสารเพิ่ม — ปุ่มพาไปหน้าใบลานั้นเพื่อแนบรูป
 * isReminder = การ์ดเตือนซ้ำ (ผู้ลายังไม่แนบ)
 */
function buildDocRequestCard(leave, requester, askerName, note, isReminder) {
  const c = flexColors_();
  const url = getLiffPageUrl('my-requests') + '?id=' + encodeURIComponent(leave.leave_id);
  return {
    type: 'flex', altText: (isReminder ? 'เตือน: ' : '') + 'ผู้อนุมัติขอเอกสารเพิ่ม ใบลา ' + leave.leave_id,
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_(isReminder ? 'เตือน: ยังรอเอกสารเพิ่มจากคุณ' : 'ผู้อนุมัติขอเอกสารเพิ่ม', c.warning),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', size: 'sm', weight: 'bold', color: c.text, wrap: true,
            text: 'ใบลายังไม่ถูกตัดสิน — กรุณาแนบเอกสารตามที่ขอ แล้วระบบจะส่งกลับไปให้ผู้อนุมัติ' },
          flexSeparator_(),
          flexKV_('ต้องการ', note || '-', c.warning),
          flexKV_('ขอโดย', askerName || '-'),
          flexKV_('เลขที่ใบลา', leave.leave_id),
          flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('จำนวน', leaveAmountText_(leave)),
        ],
      },
      footer: flexFooter_([
        { type: 'button', style: 'primary', height: 'sm', color: c.primary,
          action: { type: 'uri', label: 'แนบเอกสาร', uri: url } },
      ]),
    },
  };
}

/** HR ได้สำเนา: มีการขอเอกสารเพิ่ม (บอกด้วยว่าส่งถึงผู้ลาไหม) */
function buildDocRequestHrNoticeCard(leave, requester, askerName, note, delivered) {
  const c = flexColors_();
  return {
    type: 'flex', altText: 'แจ้ง HR: ขอเอกสารเพิ่ม ใบลา ' + leave.leave_id,
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_('ขอเอกสารเพิ่มจากผู้ลา (สำเนาถึง HR)', c.warning),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('ผู้ลา', (requester && requester.display_name) || leave.user_id),
          flexKV_('แผนก', (requester && requester.department) || '-'),
          flexKV_('เลขที่', leave.leave_id),
          flexKV_('ขอโดย', askerName || '-'),
          flexKV_('ต้องการ', note || '-'),
          flexSeparator_(),
          delivered
            ? { type: 'text', margin: 'md', size: 'xs', color: c.success, wrap: true, text: '✅ ส่งแจ้งผู้ลาทางไลน์แล้ว' }
            : { type: 'text', margin: 'md', size: 'sm', weight: 'bold', color: '#b3261e', wrap: true,
                text: '⚠️ ส่งถึงผู้ลาไม่ได้ (ยังไม่ผูกไลน์/ไลน์ขัดข้อง) — กรุณาแจ้งผู้ลาโดยตรง ได้รูปมาแล้ว HR แนบแทนได้' },
        ],
      },
      // HR รับรูปจากผู้ลาที่ไม่มีไลน์ แล้วแนบแทนได้จากหน้านี้
      footer: flexFooter_([
        btnUri_('เปิดใบลานี้ / แนบเอกสารแทน', getLiffPageUrl('my-requests') + '?id=' + encodeURIComponent(leave.leave_id)),
      ]),
    },
  };
}

/** ผู้ที่ขอเอกสาร + HR ได้: ผู้ลาแนบเอกสารเพิ่มแล้ว */
function buildDocAddedCard(leave, requester, url, wasRequested, note) {
  const c = flexColors_();
  const pending = leave.final_status === 'pending';
  const buttons = [btnUri_('ดูเอกสาร', url)];
  if (pending) buttons.unshift(btnUri_('เปิดหน้าอนุมัติ', getLiffPageUrl('approve') + '?id=' + encodeURIComponent(leave.leave_id)));
  return {
    type: 'flex', altText: 'ผู้ลาแนบเอกสารเพิ่มแล้ว ใบลา ' + leave.leave_id,
    contents: {
      type: 'bubble', size: 'mega',
      header: flexHeader_(wasRequested ? 'ได้รับเอกสารที่ขอแล้ว' : 'ผู้ลาแนบเอกสารเพิ่ม', c.success),
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          flexKV_('ผู้ลา', (requester && requester.display_name) || leave.user_id),
          flexKV_('เลขที่', leave.leave_id),
          flexKV_('ประเภท', leaveTypeLabel_(leave.leave_type)),
          flexKV_('วันที่', formatThaiDateShort(leave.date_from) + ' - ' + formatThaiDateShort(leave.date_to)),
          flexKV_('สถานะใบลา', pending ? 'รออนุมัติ' : 'อนุมัติแล้ว'),
          note ? flexKV_('คำอธิบาย', note) : { type: 'filler' },
          {
            type: 'image', url: driveUrlToThumbnail_(url), size: 'full',
            aspectRatio: '4:3', aspectMode: 'cover', margin: 'md',
            action: { type: 'uri', uri: url },
          },
        ],
      },
      footer: flexFooter_(buttons),
    },
  };
}
