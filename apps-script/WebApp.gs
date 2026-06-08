/**
 * WebApp.gs — Entry points doGet / doPost
 *
 * doGet  — health check
 * doPost — 2 endpoints (router by content-type / body shape):
 *   1) LINE webhook (body มี events[]) → handleLineEvent_ per event
 *   2) LIFF API call (body มี action + payload) → routeAction_
 *
 * NOTE: deploy "Anyone" — verify access ด้วย role check ที่ handler แต่ละตัว
 * NOTE: I-015 LIFF ใช้ text/plain POST เพื่อเลี่ยง CORS preflight
 */

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'mena-leave', time: nowBangkok() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'invalid_json' });
  }

  // dispatch
  if (body && Array.isArray(body.events)) {
    // LINE webhook
    body.events.forEach(function (ev) {
      try { handleLineEvent_(ev); }
      catch (err) { logError('handleLineEvent_', err.message, { event: ev }); }
    });
    return jsonResponse_({ ok: true });
  }

  if (body && body.action) {
    try {
      const res = routeAction_(body.action, body.payload || {});
      return jsonResponse_(res);
    } catch (err) {
      logError('doPost router', err.message, { action: body.action });
      return jsonResponse_({ ok: false, error: 'exception', message: err.message });
    }
  }

  return jsonResponse_({ ok: false, error: 'unknown_request' });
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Router: action → handler */
function routeAction_(action, payload) {
  const handlers = {
    // health / misc
    'health':                  function () { return { ok: true, time: nowBangkok() }; },

    // status / role
    'getMyStatus':             function (p) { return getMyStatus(p); },
    'getManualConfig':         function (p) { return getManualConfig(p); },

    // register flow
    'submitRegister':          function (p) { return submitRegister(p); },
    'approveRegister':         function (p) { return approveRegister(p); },
    'rejectRegister':          function (p) { return rejectRegister(p); },

    // pairing (used when ADMIN invites — Visitor redeems via myid/register)
    'redeemPairingCode':       function (p) { return redeemPairingCode(p.code, p.lineUserId, p.displayName); },

    // leave
    'getApprovalConditions':   function (p) { return getApprovalConditions(p); },
    'getRules':                function (p) { return getRules(p); },
    'getMyQuota':              function (p) { return getMyQuota(p); },
    'submitLeave':             function (p) { return submitLeave(p); },
    'getMyHistory':            function (p) { return getMyHistory(p); },
    'getOneRequest':           function (p) { return getOneRequest(p); },

    // approval
    'getPendingForMe':         function (p) { return getPendingForMe(p); },
    'approveLeave':            function (p) { return approveLeave(p); },

    // admin / supervisor
    'getAdminDashboard':       function (p) { return getAdminDashboard(p); },
    'getAllUsers':             function (p) { return getAllUsers(p); },
    'getAllLeaves':            function (p) { return getAllLeaves(p); },
    'setUserStatus':           function (p) { return setUserStatus(p); },
    'setUserRole':             function (p) { return setUserRole(p); },
    'getProxyTargets':         function (p) { return getProxyTargets(p); },
    'inviteUser':              function (p) { return inviteUser(p); },
    'inviteOwner':             function (p) { return inviteOwner(p); },

    'pairSupervisor':          function (p) { return pairSupervisor(p); },
    'unpairSupervisor':        function (p) { return unpairSupervisor(p); },
    'setSupervisorFlag':       function (p) { return setSupervisorFlag(p); },
    'listSupervisorPairs':     function (p) { return listSupervisorPairs(p); },

    // quota / rules
    'setQuota':                function (p) { return setQuota(p); },
    'upsertRule':              function (p) { return upsertRule(p); },

    // settings + pending_changes
    'updateSettings':          function (p) { return updateSettings(p); },
    'listPendingChanges':      function (p) { return listPendingChanges(p); },
    'approvePendingChange':    function (p) { return approvePendingChange(p); },
    'rejectPendingChange':     function (p) { return rejectPendingChange(p); },
  };

  const fn = handlers[action];
  if (!fn) return { ok: false, error: 'unknown_action', action: action };
  return fn(payload);
}

/** LINE webhook event handler */
function handleLineEvent_(ev) {
  if (!ev) return;
  const type = ev.type;
  if (type === 'postback') {
    handlePostback_(ev);
  } else if (type === 'follow') {
    // welcome message (optional)
    if (ev.replyToken) {
      replyText(ev.replyToken,
        'ยินดีต้อนรับสู่ระบบลางาน MENA COSMETICS\n' +
        'กดเมนู "ส่งใบลา" เพื่อเริ่มใช้งาน หรือ "คู่มือ" เพื่อดูวิธีใช้');
    }
  } else if (type === 'message' && ev.message && ev.message.type === 'text') {
    const text = ev.message.text || '';
    if (text === 'myid' || text.toLowerCase() === 'id') {
      replyText(ev.replyToken, 'LINE User ID ของคุณ: ' + ev.source.userId);
    } else {
      // ignore other text — user ใช้ rich menu / LIFF
    }
  }
}
