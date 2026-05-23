/**
 * config.js — runtime config สำหรับ LIFF frontend
 *
 * ⚠️ TODO ก่อน deploy:
 *   1. แทน API_URL ด้วย Apps Script Web App URL จริง (หลัง Deploy → New deployment → Anyone → copy)
 *   2. แทน LIFF_ID ด้วยค่าจริงจาก LINE Developers (1 LIFF app เดียว — ใช้ subpath routing)
 *   3. ถ้าทดสอบ local browser (ไม่ผ่าน LIFF) → set DEV_MOCK_LIFF: true
 *      จะ bypass liff.init + ใช้ DEV_MOCK_USER_ID แทน
 *
 * Routing model:
 *   - 1 LIFF app, endpoint URL = https://pariwat-aruno.github.io/mena-leave
 *   - permanentLinkPattern = "concat" → LIFF URL /<page>.html append เข้า endpoint
 *   - liff.line.me/<id>/request.html → github.io/mena-leave/request.html
 */
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec',

  LIFF_ID: '2010175593-Fqjuhv0q',

  DEV_MOCK_LIFF: false,
  DEV_MOCK_USER_ID: 'Udev0000000000000000000000000000',
  DEV_MOCK_DISPLAY_NAME: 'Dev Tester',

  BRAND_FALLBACK_NAME: 'MENA COSMETICS',
  IMAGE_MAX_DIMENSION: 1280,
  IMAGE_QUALITY: 0.85,
};

/** LIFF ID ของหน้าปัจจุบัน — single LIFF ทุกหน้าใช้ ID เดียว */
window.CONFIG.getCurrentLiffId = function () {
  return window.CONFIG.LIFF_ID;
};

/** absolute LIFF URL ของหน้าอื่น (สำหรับ flex card / redirect) */
window.CONFIG.getLiffUrl = function (page) {
  const id = window.CONFIG.LIFF_ID;
  if (!id || id.startsWith('REPLACE_')) return '#';
  return 'https://liff.line.me/' + id + '/' + page + '.html';
};
