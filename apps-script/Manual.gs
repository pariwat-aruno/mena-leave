/**
 * Manual.gs — I-021 cookbook config สำหรับ manual.html + manual-admin.html
 *
 * return { brand: { name, logo_url, color }, contact: { line_id, phone }, role, role_label }
 */
function getManualConfig(payload) {
  payload = payload || {};
  const cfg = getConfig();
  let role = ROLES.VISITOR;
  let roleLabel = ROLE_LABELS_TH.VISITOR;
  let displayName = '';

  if (payload.lineUserId) {
    const user = findUserByLineId_(payload.lineUserId);
    if (user) {
      role = user.role;
      const isSup = isSupervisorUser_(user);
      roleLabel = getRoleLabelTh(role, { isSupervisor: isSup });
      displayName = user.display_name || '';
    }
  }

  return {
    ok: true,
    brand: {
      name: cfg.brand_name || 'MENA COSMETICS',
      logo_url: cfg.brand_logo_url ? driveUrlToThumbnail_(cfg.brand_logo_url) : '',
      color_primary: cfg.brand_color_primary || '#d51f7d',
      color_tint: cfg.brand_color_tint || '#fce4ef',
    },
    contact: {
      line_id: cfg.support_line_id || '',
      phone: cfg.support_phone || '',
    },
    role: role,
    role_label: roleLabel,
    display_name: displayName,
  };
}
