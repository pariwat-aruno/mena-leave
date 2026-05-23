# PROGRESS.md — mena-leave

> Status snapshot — อัปเดตล่าสุด 2026-05-24

## สรุปด่วน

| Phase | Status | หมายเหตุ |
|---|---|---|
| 0. Rebrand vorda → mena | ✅ Done | สี/ชื่อ/logo SVG/LINE OA placeholder |
| 1. Sheet + Drive setup | ✅ Done | setupAll() รันแล้ว 10 tab + Settings + Rules + Drive folder |
| 2. LINE channel + LIFF | ✅ Done | Messaging API + 1 LIFF app + bootstrap OWNER |
| 3. Apps Script foundation | ✅ Done | clasp project + 19 .gs files pushed |
| 4. Apps Script endpoints | ⏳ Code มี — ยังไม่เทสต์ flow จริง | doGet/doPost router + 25+ actions |
| 5. LIFF frontend | ⏳ Code มี — ยังไม่เทสต์ flow จริง | 9 HTML pages + shared JS |
| 6. Deploy + E2E test | 🔄 Web App deploy ✅ — รอเทสต์ end-to-end | ขั้นต่อไป |
| 7. Triggers | ❌ ยังไม่รัน | setupTriggers() |

---

## IDs สำคัญ (ทุกระบบ live แล้ว)

| Resource | ID / URL |
|---|---|
| **GitHub repo** | https://github.com/pariwat-aruno/mena-leave (public) |
| **GitHub Pages** | https://pariwat-aruno.github.io/mena-leave/ |
| **Apps Script** | https://script.google.com/d/1PkAqet3C7bToyMhTT5bjOA5EMsoTz_i7GZEUUjHqN1s1oP4LJnlCk5oL/edit |
| **Sheet (Database)** | https://docs.google.com/spreadsheets/d/1AsM39WfxQ1HtN3_49mpKnu2Sg01dRI2Y4ssdILN6_Bc/edit |
| **Drive folder** | `1Qqvo31hox77ZDJ1i8N0awAWhFBAskVUO` (mena-leave - Storage) |
| **Web App URL** | https://script.google.com/macros/s/AKfycbwhvhNvpUJ2LrOCsQ35JA9OpqOR55rBfYoiayWZcqFxo754Os-YXEfmbUNEhOJ_cYN_/exec |
| **LIFF ID** | `2010175593-Fqjuhv0q` (single LIFF, concat subpath) |
| **LIFF URL** | https://liff.line.me/2010175593-Fqjuhv0q |
| **LINE OA** | `@966nnfkr` (displayName: "mena") |
| **Bot userId** | `U441d1a7df291928046c3982c1bc41948` |
| **OWNER (พี่ปุ้ย)** | `EMP-0001` / LINE userId `Ub47d6b519be013dbe6e83c4fbd079c56` |

---

## Phase 1 — Sheet + Drive ✅

- ✅ TASK-01: `setupDatabase()` — สร้าง 10 tab ใน Sheet
- ✅ TASK-02: `seedSettings()` — 19 settings keys
- ✅ TASK-03: `seedDefaultRules()` — sick (0/0/3) · personal (3/0/0) · vacation (7/0/0)
- ✅ TASK-04: `setupDrive()` — root folder + `leave-proofs` sub-folder
- ✅ TASK-05: `setupAll()` one-shot

---

## Phase 2 — LINE + LIFF ✅

- ✅ TASK-06: สร้าง Messaging API channel
  - LINE_CHANNEL_ACCESS_TOKEN ✓
  - LINE_CHANNEL_SECRET ✓
  - `verifyLineSecrets()` ผ่าน (displayName "mena", basicId @966nnfkr)
- ✅ TASK-07: สร้าง LIFF apps — **ปรับเป็น 1 LIFF เดียว** (แทน 8) ด้วย concat subpath routing
  - LIFF endpoint: `https://pariwat-aruno.github.io/mena-leave` (no trailing slash)
  - `permanentLinkPattern: concat` → subpath append → ทุก .html เข้าถึงได้
  - ทุกหน้า size = **Full**
- ⏳ TASK-08: Rich menu — **ยังไม่ทำ** (TODO: รัน `scripts/setup_rich_menu.py`)

### Architecture decision (สำคัญ)
- เปลี่ยนจาก template เดิม 8 LIFF apps → **1 LIFF + concat subpath** เพราะ:
  - ง่ายในการตั้งค่า (สร้าง 1 อันใน Console แทน 8 อัน)
  - LINE LIFF API `/liff/v1/apps` สร้าง LIFF ผ่าน Messaging API channel ไม่ได้ — ต้อง Login channel แยก
  - userId ตรงกันข้าม channel ใน Provider เดียวกัน (verify แล้ว)

### Gotchas ที่เจอ + แก้
1. `clasp create-script` แรกได้ `invalid_grant` — re-`clasp login` แก้ได้
2. LIFF API สร้าง LIFF ผ่าน Messaging API channel token ไม่ได้ (`Channel must have Application Types`) — ใช้ Console UI แทน
3. `listLiffApps()` 404 — LIFF อยู่ใน Login channel (prefix 2010175593) ต่างจาก Messaging (prefix 2010175525) — expected, ไม่ใช่ปัญหา
4. **LIFF index.html redirect loop** — meta refresh / JS redirect ทิ้ง query string (มี `?liff.state=`) ทำให้ SDK loop. Fix: preserve `window.location.search + .hash` ก่อน redirect
5. curl POST ทำ Apps Script Web App ไม่ได้ (drop body ข้าม 302) — browser fetch + Python urllib ใช้ได้

---

## Phase 3 — Apps Script foundation ✅

- ✅ TASK-09: clasp 3.3.0 setup, Apps Script project สร้างแล้ว
- ✅ TASK-10: Script Properties ใส่ครบ — LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET (manual), SHEET_ID, DRIVE_FOLDER_ID, DRIVE_FOLDER_LEAVE_PROOFS, LIFF_ID, WEB_APP_URL (auto)
- ✅ TASK-11..14: foundation modules อยู่ใน 19 .gs files
  - Logger.gs / Config.gs / Utils.gs / LineApi.gs / DriveStore.gs

---

## Phase 4 — Apps Script endpoints (โค้ดมี — รอเทสต์)

โค้ดทุกไฟล์ push เข้า Apps Script แล้ว — flow E2E ยังไม่ผ่าน

- ⏳ TASK-15: WebApp.gs router — health check ผ่าน, postback handler รอเทสต์
- ⏳ TASK-16: Pairing.gs — 6-digit code + redeem
- ⏳ TASK-17: Register.gs — submitRegister/approveRegister/rejectRegister + getMyStatus (verify ผ่าน Python: visitor case ทำงาน)
- ⏳ TASK-18: Supervisor.gs
- ⏳ TASK-19: Rules.gs
- ⏳ TASK-20: Quota.gs
- ⏳ TASK-21: LeaveRequest.gs
- ⏳ TASK-22: Approval.gs (3-stage)
- ⏳ TASK-23: Admin.gs
- ⏳ TASK-24: Manual.gs
- ⏳ TASK-25: FlexCard.gs (9 card types)
- ⏳ TASK-26: Trigger.gs

---

## Phase 5 — LIFF frontend (โค้ดมี — รอเทสต์)

9 HTML pages live บน GitHub Pages:

- ⏳ TASK-27: shared modules (config.js / api.js / auth.js / role.js / utils.js / manual.js)
- ⏳ TASK-28: myid.html — userId + status check (verify ทาง LIFF: เปิดได้, แสดง userId ของ OWNER)
- ⏳ TASK-29: register.html
- ⏳ TASK-30: request.html (สำคัญที่สุด — GPS + form)
- ⏳ TASK-31: my-requests.html
- ⏳ TASK-32: approve.html
- ⏳ TASK-33: admin.html
- ⏳ TASK-34: manual.html + manual-admin.html

### เพิ่มเติม (นอก template)
- ✅ `liff/index.html` — redirect handler สำหรับ LIFF root URL (ต้องเพิ่มเพราะ concat subpath ทำให้ root โดน hit)

---

## Phase 6 — Deploy + E2E (กำลังทดสอบ)

- ✅ TASK-35: Web App deploy — Anyone access, doGet health check ผ่าน
- ✅ TASK-36: GitHub Pages enabled (workflow `.github/workflows/pages.yml` auto-deploy ทุกครั้งที่ push)
- ⏳ TASK-37: E2E test (กำลังทำ)
  - ✅ OWNER bootstrap
  - ✅ เปิด LIFF บนมือถือ — myid.html แสดง userId
  - ⏳ refresh myid → ต้องขึ้นสถานะ "ใช้งานอยู่" + badge "เจ้าของ"
  - ⏳ submit ใบลา (OWNER auto-approve)
  - ⏳ ตรวจ LeaveRequests + LeaveQuota
  - ⏳ test multi-user flow (ต้อง invite + register USER เพิ่ม)
- ⏳ LINE webhook URL ตั้งใน LINE Console (TODO ก่อน flex postback ทำงาน)

---

## Phase 7 — Triggers ❌

- ⏳ TASK-38: `setupTriggers()` daily 00:00 → expirePairingCodes + dailyTick (quota reset 1 ม.ค.)

---

## TODO ทันที (เรียง priority)

1. **เทสต์ LIFF บนมือถือ** — refresh myid.html → ต้องเห็นสถานะ active + ปุ่มส่งใบลา
2. **ตั้ง LINE webhook URL** ใน Messaging API channel = Web App URL (สำคัญสำหรับ flex postback button)
3. **ส่งใบลาทดสอบ** (OWNER) → ตรวจ auto-approve flow
4. **TASK-08:** Rich menu setup
5. **TASK-38:** setupTriggers()
6. **Multi-user E2E:** invite ADMIN → invite USER → pair supervisor → flow 3-stage
7. **Logo จริง:** drop `liff/img/logo.jpg` (ปัจจุบันใช้ SVG placeholder ตัว "m")

---

## TODO ระยะกลาง

- ทำ smart routing ใน `index.html` (เช็ค role จาก backend → redirect ไปหน้าที่เหมาะ แทน hardcoded myid.html)
- audit checklist files (`audit/phase-N.md`) ยังไม่ tick checklist
- ลบ emoji `📋` ออกจาก myid.html (CONTEXT §7 ห้าม emoji ยกเว้น ⚠️ ✅)
- เพิ่ม `verifyConfig()` function ตรวจ Script Properties ครบ + Sheet ตรงกับ schema

---

## Key files / refs

- `CONTEXT.md` — data model + glossary (บังคับใช้)
- `CLAUDE.md` — stack + workflow + gotchas
- `TASKS.md` — 38 tasks เรียง phase
- `apps-script/Setup.gs` — setupAll + bootstrapMe + verifyLineSecrets
- `apps-script/LiffSetup.gs` — listLiffApps (debug helper)
- `liff/js/config.js` — runtime config (API_URL + LIFF_ID)
- `liff/index.html` — LIFF root redirect (preserve query string)
