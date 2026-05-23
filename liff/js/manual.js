/**
 * manual.js — bootstrap คู่กับ manual.html / manual-admin.html
 *
 * - init auth → fetch /getManualConfig → render brand + contact
 * - role gate manual-admin: ถ้า role < ADMIN → redirect ไป manual.html
 * - accordion toggle
 */
async function initManual() {
  try {
    await window.auth.init();
  } catch (err) {
    document.body.innerHTML = '<div style="padding:20px;color:#d51f7d">เปิดผ่าน LINE App เท่านั้น (' + err.message + ')</div>';
    return;
  }

  const isAdminPage = window.location.pathname.indexOf('manual-admin') >= 0;
  const config = await window.api.post('getManualConfig', { lineUserId: window.state.lineUserId });

  // role gate
  if (isAdminPage) {
    if (!config.ok || !window.hasRole(config.role, window.ROLES.ADMIN)) {
      window.utils.showToast('หน้านี้สำหรับ HR/เจ้าของเท่านั้น');
      setTimeout(() => { window.location.href = './manual.html'; }, 1500);
      return;
    }
  }

  // brand
  if (config.ok) {
    const brandName = config.brand.name || window.CONFIG.BRAND_FALLBACK_NAME;
    document.querySelectorAll('.brand-name').forEach(el => el.textContent = brandName);
    document.querySelectorAll('.page-footer').forEach(el => el.textContent = brandName);
    if (config.brand.logo_url) {
      document.querySelectorAll('.logo').forEach(el => el.src = config.brand.logo_url);
    }
    const contact = document.querySelector('.help-contact');
    if (contact) {
      const lineId = config.contact.line_id || '';
      const phone = config.contact.phone || '';
      contact.innerHTML = '';
      if (lineId) contact.innerHTML += '<div>LINE: ' + window.utils.escapeHtml(lineId) + '</div>';
      if (phone) contact.innerHTML += '<div>โทร: ' + window.utils.escapeHtml(phone) + '</div>';
    }
  }

  // accordion
  document.querySelectorAll('.accordion-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
  });
}

document.addEventListener('DOMContentLoaded', initManual);
