# Phase 2 — LINE OA + LIFF setup ✅

## LINE Messaging API channel
- [ ] สร้าง channel ใน https://developers.line.biz/console/ — type: Messaging API
- [ ] Provider เดียวกับ LIFF channel (I-012 — สำคัญที่สุด — ไม่งั้น userId ข้ามไม่ได้)
- [ ] copy `Channel access token (long-lived)` แล้วใส่ใน Script Properties: `LINE_CHANNEL_ACCESS_TOKEN`
- [ ] copy `Channel secret` แล้วใส่ใน Script Properties: `LINE_CHANNEL_SECRET`
- [ ] ปิด Auto-reply messages + Greeting messages (ใน LINE Official Account Manager)
- [ ] เปิด Use webhooks = On
- [ ] webhook URL ใส่หลัง Apps Script deploy (Phase 6)

## LIFF apps (8 ตัว)
สร้างใน LINE Login channel (provider เดียวกับ Messaging API)

| # | name | size | endpoint URL | env var |
|---|---|---|---|---|
| 1 | mena-leave-myid | Full | `<pages>/myid.html` | LIFF_ID_MYID |
| 2 | mena-leave-register | Full | `<pages>/register.html` | LIFF_ID_REGISTER |
| 3 | mena-leave-request | Full | `<pages>/request.html` | LIFF_ID_REQUEST |
| 4 | mena-leave-history | Full | `<pages>/my-requests.html` | LIFF_ID_HISTORY |
| 5 | mena-leave-approve | Full | `<pages>/approve.html` | LIFF_ID_APPROVE |
| 6 | mena-leave-admin | Full | `<pages>/admin.html` | LIFF_ID_ADMIN |
| 7 | mena-leave-manual | Full | `<pages>/manual.html` | LIFF_ID_MANUAL |
| 8 | mena-leave-manual-admin | Full | `<pages>/manual-admin.html` | LIFF_ID_MANUAL_ADMIN |

ทุก LIFF:
- [ ] Bot link = On (Aggressive)
- [ ] Scopes = profile + openid
- [ ] LIFF size = Full
- [ ] Status = Published
- [ ] Scan QR ทดสอบเปิดได้

## Properties update
- [ ] เปิด NON_SECRET_PROPS ใน Setup.gs ใส่ LIFF IDs ทั้ง 8 ตัว
- [ ] รัน `setupProperties()` อีกครั้ง → console.log set 8+
- [ ] ใส่ LIFF IDs ใน `liff/js/config.js` `LIFF_IDS` object (เพื่อข้าม LIFF page ภายในระบบ)
