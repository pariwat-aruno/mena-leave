/**
 * utils.js — shared helpers สำหรับ LIFF frontend
 *
 * - fileToResizedBase64(file)   → resize image 1280px JPEG 85% before upload
 * - getGeolocation()            → navigator.geolocation wrapper (Promise)
 * - showToast(msg, type)        → bottom toast
 * - showAlert(target, msg, type)→ inline alert
 * - clearAlert(target)
 * - formatThaiDateShort(d)
 * - formatThaiDateTime(d)
 * - copyToClipboard(text)
 */
window.utils = {
  /**
   * อ่านไฟล์ image + resize ลงเป็น base64 (data URL)
   * @param {File} file
   * @returns {Promise<{ base64: string, filename: string }>}
   */
  async fileToResizedBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('no file'));
      if (!file.type.startsWith('image/')) return reject(new Error('not_image'));

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read_failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image_load_failed'));
        img.onload = () => {
          const max = window.CONFIG.IMAGE_MAX_DIMENSION || 1280;
          let w = img.width, h = img.height;
          if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
          else if (h > max)     { w = Math.round(w * max / h); h = max; }

          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const base64 = canvas.toDataURL('image/jpeg', window.CONFIG.IMAGE_QUALITY || 0.85);

          const safeName = (file.name || 'image.jpg').replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const finalName = safeName.match(/\.(jpe?g|png|gif|webp)$/i)
            ? safeName.replace(/\.\w+$/, '.jpg')
            : safeName + '.jpg';

          resolve({ base64: base64, filename: finalName });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * GPS — navigator.geolocation wrapper
   * @returns {Promise<{ lat, lng, accuracy }>}
   * @throws Error('permission_denied' | 'timeout' | 'unavailable' | 'unsupported')
   */
  getGeolocation(timeoutMs) {
    const limit = timeoutMs || 15000;
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('unsupported'));
      // iOS LIFF trap: ถ้า LINE ไม่ได้รับสิทธิ์ GPS ที่ระดับ OS, getCurrentPosition
      // จะไม่เรียก callback ทั้ง success/error และ option `timeout` ก็ไม่ทำงาน → ค้างถาวร
      // ป้องกันด้วย setTimeout เองเสมอ ไม่พึ่ง browser timeout
      let done = false;
      const guard = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, limit + 1000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          if (err.code === 1) return reject(new Error('permission_denied'));
          if (err.code === 3) return reject(new Error('timeout'));
          return reject(new Error('unavailable'));
        },
        { enableHighAccuracy: true, timeout: limit, maximumAge: 30000 }
      );
    });
  },

  showToast(msg, type) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (type ? (' ' + type) : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  },

  showAlert(targetSel, msg, type) {
    const t = typeof targetSel === 'string' ? document.querySelector(targetSel) : targetSel;
    if (!t) return;
    t.className = 'alert ' + (type || 'error');
    t.textContent = msg;
    t.classList.remove('hidden');
  },

  clearAlert(targetSel) {
    const t = typeof targetSel === 'string' ? document.querySelector(targetSel) : targetSel;
    if (!t) return;
    t.classList.add('hidden');
    t.textContent = '';
  },

  formatThaiDateShort(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
  },

  formatThaiDateTime(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return window.utils.formatThaiDateShort(date) + ' ' + hh + ':' + mm + ' น.';
  },

  countDaysBetween(from, to) {
    if (!from || !to) return 0;
    const d1 = new Date(from + 'T00:00:00');
    const d2 = new Date(to + 'T00:00:00');
    if (d2 < d1) return 0;
    return Math.floor((d2 - d1) / (24 * 3600 * 1000)) + 1;
  },

  countWeekdaysBetween(from, to) {
    if (!from || !to) return 0;
    const d1 = new Date(from + 'T00:00:00');
    const d2 = new Date(to + 'T00:00:00');
    if (d2 < d1) return 0;
    let days = 0;
    const cur = new Date(d1);
    while (cur <= d2) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) days++;
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  },

  async copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) { /* fallback */ }
    }
    // fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (e) { return false; }
  },

  escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};
