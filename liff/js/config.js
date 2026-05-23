/**
 * config.js — runtime config สำหรับ LIFF frontend
 *
 * ⚠️ TODO ก่อน deploy:
 *   1. แทน API_URL ด้วย Apps Script Web App URL จริง (หลัง Deploy → New deployment → Anyone → copy)
 *   2. แทน LIFF_IDS ทั้ง 8 ด้วยค่าจริงจาก LINE Developers
 *   3. ถ้าทดสอบ local browser (ไม่ผ่าน LIFF) → set DEV_MOCK_LIFF: true
 *      จะ bypass liff.init + ใช้ DEV_MOCK_USER_ID แทน
 */
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec',

  LIFF_IDS: {
    myid:          'REPLACE_LIFF_ID_MYID',
    register:      'REPLACE_LIFF_ID_REGISTER',
    request:       'REPLACE_LIFF_ID_REQUEST',
    'my-requests': 'REPLACE_LIFF_ID_HISTORY',
    approve:       'REPLACE_LIFF_ID_APPROVE',
    admin:         'REPLACE_LIFF_ID_ADMIN',
    manual:        'REPLACE_LIFF_ID_MANUAL',
    'manual-admin': 'REPLACE_LIFF_ID_MANUAL_ADMIN',
  },

  DEV_MOCK_LIFF: false,
  DEV_MOCK_USER_ID: 'Udev0000000000000000000000000000',
  DEV_MOCK_DISPLAY_NAME: 'Dev Tester',

  BRAND_FALLBACK_NAME: 'MENA COSMETICS',
  IMAGE_MAX_DIMENSION: 1280,
  IMAGE_QUALITY: 0.85,
};

/** หา LIFF ID สำหรับหน้าปัจจุบัน — ใช้ filename เป็น key */
window.CONFIG.getCurrentLiffId = function () {
  const path = window.location.pathname;
  const m = path.match(/\/([^\/]+)\.html$/);
  if (!m) return '';
  return window.CONFIG.LIFF_IDS[m[1]] || '';
};

/** absolute LIFF URL ของหน้าอื่น (สำหรับ flex card / redirect) */
window.CONFIG.getLiffUrl = function (page) {
  const id = window.CONFIG.LIFF_IDS[page];
  return id ? ('https://liff.line.me/' + id) : '#';
};
