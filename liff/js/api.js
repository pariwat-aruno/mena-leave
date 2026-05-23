/**
 * api.js — POST helper to Apps Script Web App
 *
 * I-015: ใช้ text/plain content-type เพื่อ bypass CORS preflight
 *        (browser ส่ง preflight OPTIONS ตอน content-type=application/json
 *         แต่ Apps Script Web App ไม่ตอบ OPTIONS → fail)
 */
window.api = {
  /**
   * @param {string} action  endpoint name (ตรงกับ routeAction_ ใน WebApp.gs)
   * @param {object} payload
   * @returns {Promise<object>}  resolved with response JSON
   */
  post: async function (action, payload) {
    const body = JSON.stringify({ action: action, payload: payload || {} });
    try {
      const res = await fetch(window.CONFIG.API_URL, {
        method: 'POST',
        // text/plain เลี่ยง CORS preflight (I-015)
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow',
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        console.error('API parse error', text);
        return { ok: false, error: 'invalid_response', raw: text };
      }
    } catch (err) {
      console.error('API call failed', err);
      return { ok: false, error: 'network_error', message: err.message || String(err) };
    }
  },
};
