/**
 * LineApi.gs — wrapper เรียก LINE Messaging API
 *
 * - pushMessage(userId, messages[])
 * - replyMessage(replyToken, messages[])
 * - retry 3 ครั้ง exponential backoff (1s, 2s, 4s)
 * - log error ลง sheet Logs ทุกครั้ง
 */

const LINE_API_BASE = 'https://api.line.me/v2/bot';
const LINE_RETRY_MAX = 3;
const LINE_RETRY_BASE_MS = 1000;

/** Push API — ใช้ตอนส่ง flex card */
function pushMessage(userId, messages) {
  return callLineApi_('push', { to: userId, messages: arrify_(messages) });
}

/** Reply API — ใช้ใน webhook handler (ใช้ replyToken) */
function replyMessage(replyToken, messages) {
  return callLineApi_('reply', { replyToken: replyToken, messages: arrify_(messages) });
}

/** shortcut: push text ตัวเดียว */
function pushText(userId, text) {
  return pushMessage(userId, [{ type: 'text', text: text }]);
}

/** shortcut: reply text ตัวเดียว */
function replyText(replyToken, text) {
  return replyMessage(replyToken, [{ type: 'text', text: text }]);
}

function arrify_(x) {
  return Array.isArray(x) ? x : [x];
}

/** core: yield retry + log */
function callLineApi_(kind, body) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) {
    logError('LineApi.' + kind, 'LINE_CHANNEL_ACCESS_TOKEN not set');
    return { ok: false, error: 'no_token' };
  }
  const url = LINE_API_BASE + '/message/' + kind;
  const opts = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  };

  let lastErr = null;
  for (let attempt = 1; attempt <= LINE_RETRY_MAX; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, opts);
      const code = res.getResponseCode();
      if (code === 200) {
        // ส่งไปแล้ว — ห้ามให้ error ตอนล้างธงพาไป retry (การ์ดเด้งซ้ำ)
        if (kind === 'push') { try { clearLineMonthlyLimit_(); } catch (e) {} }
        return { ok: true };
      }
      lastErr = 'HTTP ' + code + ' ' + res.getContentText();
      // ⭐ โควตาข้อความรายเดือนของ OA หมด — ไม่ใช่ปัญหาชั่วคราว ยิงซ้ำก็ไม่ผ่าน
      //    เดิมยิงซ้ำ 3 รอบต่อข้อความ (หน้าส่งใบลาค้างนาน) และไม่มีใครรู้ว่าไลน์ส่งไม่ออกทั้งระบบ
      //    (ลูกค้าแจ้ง 1 ต.ค. 69: ใบลาค้าง 4-5 วัน หัวหน้า/ผู้บริหารไม่ได้การ์ดเลย)
      if (isLineMonthlyLimitError_(code, lastErr)) {
        markLineMonthlyLimit_(lastErr);
        return { ok: false, error: 'monthly_limit' };
      }
      // 4xx (ยกเว้น 429) ไม่ retry
      if (code >= 400 && code < 500 && code !== 429) {
        logError('LineApi.' + kind, lastErr, body);
        return { ok: false, error: lastErr };
      }
    } catch (err) {
      lastErr = err && err.message ? err.message : String(err);
    }

    if (attempt < LINE_RETRY_MAX) {
      Utilities.sleep(LINE_RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }

  logError('LineApi.' + kind, 'failed after ' + LINE_RETRY_MAX + ' retries: ' + lastErr, body);
  return { ok: false, error: lastErr };
}

// ========== โควตาข้อความรายเดือนของ LINE OA ==========

const LINE_MONTHLY_LIMIT_PROP = 'LINE_MONTHLY_LIMIT_AT';

/** 429 มีสองแบบ: ยิงถี่เกิน (ชั่วคราว ลองใหม่ได้) กับโควตาเดือนหมด (ลองใหม่ไม่มีประโยชน์) */
function isLineMonthlyLimitError_(code, text) {
  return code === 429 && /monthly limit/i.test(String(text || ''));
}

/** จดว่าโควตาหมดเมื่อไหร่ — log แค่ครั้งแรกของเหตุการณ์ ไม่งั้น Logs เต็มด้วยบรรทัดเดิม */
function markLineMonthlyLimit_(detail) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(LINE_MONTHLY_LIMIT_PROP)) return;
  props.setProperty(LINE_MONTHLY_LIMIT_PROP, nowBangkok());
  logError('LineApi', 'โควตาข้อความไลน์เดือนนี้หมด — การ์ด/การแจ้งเตือนทุกชนิดส่งไม่ออกจนกว่าจะขึ้นเดือนใหม่หรืออัปเกรดแพ็กเกจ',
    { detail: String(detail || '').slice(0, 300) });
}

function clearLineMonthlyLimit_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(LINE_MONTHLY_LIMIT_PROP)) props.deleteProperty(LINE_MONTHLY_LIMIT_PROP);
}

/**
 * โควตาข้อความเดือนนี้ (ไม่กินโควตา) — คืน { ok, limited, limit, used, remaining, blocked_at }
 *   limited=false = แพ็กเกจไม่จำกัดจำนวน
 * อ่านไม่ได้ (เน็ต/โทเคน) → ok:false ให้ผู้เรียกทำงานต่อตามปกติ ไม่ใช่หยุดทั้งระบบ
 */
function getLineMessageQuota_() {
  let blockedAt = '';
  let token = '';
  try {
    blockedAt = PropertiesService.getScriptProperties().getProperty(LINE_MONTHLY_LIMIT_PROP) || '';
    token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  } catch (e) {
    return { ok: false, error: 'props_unavailable', blocked_at: '' };
  }
  if (!token) return { ok: false, error: 'no_token', blocked_at: blockedAt };
  const get = function (path) {
    const res = UrlFetchApp.fetch(LINE_API_BASE + '/message/' + path, {
      method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
    return JSON.parse(res.getContentText());
  };
  try {
    const q = get('quota');
    const c = get('quota/consumption');
    const used = Number(c.totalUsage || 0);
    if (q.type !== 'limited') {
      return { ok: true, limited: false, limit: 0, used: used, remaining: null, blocked_at: blockedAt };
    }
    const limit = Number(q.value || 0);
    return { ok: true, limited: true, limit: limit, used: used, remaining: Math.max(0, limit - used),
             blocked_at: blockedAt };
  } catch (e) {
    logWarn('getLineMessageQuota_', 'อ่านโควตาไลน์ไม่ได้: ' + e.message);
    return { ok: false, error: e.message, blocked_at: blockedAt };
  }
}
