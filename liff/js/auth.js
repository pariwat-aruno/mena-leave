/**
 * auth.js — LIFF init + profile (I-005)
 *
 * usage:
 *   await window.auth.init();
 *   const userId = window.state.lineUserId;
 */
window.state = {
  lineUserId: '',
  displayName: '',
  pictureUrl: '',
  initialized: false,
};

window.auth = {
  async init() {
    if (window.state.initialized) return window.state;

    const cfg = window.CONFIG;

    // DEV mock (local browser test ผ่าน file:// หรือ localhost)
    if (cfg.DEV_MOCK_LIFF) {
      window.state.lineUserId = cfg.DEV_MOCK_USER_ID;
      window.state.displayName = cfg.DEV_MOCK_DISPLAY_NAME;
      window.state.initialized = true;
      console.log('[auth] DEV mock mode — userId =', window.state.lineUserId);
      return window.state;
    }

    const liffId = cfg.getCurrentLiffId();
    if (!liffId || liffId.startsWith('REPLACE_')) {
      throw new Error('LIFF_ID ยังไม่ได้ตั้งค่าใน config.js — กรุณาแก้ก่อน deploy');
    }

    if (typeof liff === 'undefined') {
      throw new Error('LIFF SDK ยังไม่โหลด — ตรวจ <script src="https://static.line-scdn.net/liff/edge/2/sdk.js">');
    }

    await liff.init({ liffId: liffId });

    if (!liff.isLoggedIn()) {
      liff.login();
      // หลัง login จะ redirect กลับมา ฟังก์ชันนี้จะถูกเรียกอีกครั้ง
      return new Promise(() => {});
    }

    const profile = await liff.getProfile();
    window.state.lineUserId = profile.userId;
    window.state.displayName = profile.displayName;
    window.state.pictureUrl = profile.pictureUrl || '';
    window.state.initialized = true;
    return window.state;
  },
};
