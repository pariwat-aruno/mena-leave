# PROGRESS.md — mena-leave

> Status snapshot — อัปเดตล่าสุด 2026-05-24 (end of session)

## สรุปด่วน

| Phase | Status | หมายเหตุ |
|---|---|---|
| 0. Rebrand vorda → mena | ✅ Done | สี/ชื่อ/logo SVG/LINE OA placeholder |
| 1. Sheet + Drive setup | ✅ Done | setupAll() รันแล้ว 10 tab + Settings + Rules + Drive folder |
| 2. LINE channel + LIFF + Rich menu | ✅ Done | Messaging API + 1 LIFF + Rich menu v2 + bootstrap OWNER |
| 3. Apps Script foundation | ✅ Done | clasp project + 20 .gs files pushed |
| 4. Apps Script endpoints | ⏳ Code มี — ยังไม่เทสต์ flow จริง | doGet/doPost router + 25+ actions |
| 5. LIFF frontend | ⏳ Code มี — myid.html เทสต์ผ่าน · หน้าอื่นรอเทสต์ | 9 HTML pages + shared JS + docs/ |
| 6. Deploy + E2E test | 🔄 Web App + Pages live — เทสต์ flow ต่อ | OWNER bootstrap ผ่าน |
| 7. Triggers | ❌ ยังไม่รัน | setupTriggers() — รอ 1 click |
| 8. Public docs | ✅ Done | คู่มือพนักงาน + คู่มือเจ้าของ + landing |

---

## Session ล่าสุด (2026-05-23 → 2026-05-24)

ทำมาทั้งหมด:
1. Rebrand vorda-leave → mena-leave (ชื่อ, สี #d51f7d, LINE OA @966nnfkr, logo SVG placeholder)
2. setupAll() — สร้าง Sheet/Drive/Settings/Rules ครบ
3. สร้าง Messaging API channel + 1 LIFF app (concat subpath)
4. clasp setup + push 20 .gs files
5. Deploy Apps Script Web App
6. สร้าง GitHub repo + Pages + workflow auto-deploy
7. แก้ index.html redirect loop (preserve query string)
8. bootstrap OWNER (พี่ปุ้ย = EMP-0001)
9. ติดตั้ง Rich menu v2 (logo "mena" + card buttons)
10. ลบ emoji ที่เกินมาจาก CONTEXT §7 (10 จุด)
11. สร้าง public docs (`liff/docs/`) — user-guide + owner-guide + landing

---

## IDs สำคัญ (ทุกระบบ live แล้ว)

| Resource | ID / URL |
|---|---|
| **GitHub repo** | https://github.com/pariwat-aruno/mena-leave (public) |
| **GitHub Pages** | https://pariwat-aruno.github.io/mena-leave/ |
| **Public docs** | https://pariwat-aruno.github.io/mena-leave/docs/ |
| **Apps Script** | https://script.google.com/d/1PkAqet3C7bToyMhTT5bjOA5EMsoTz_i7GZEUUjHqN1s1oP4LJnlCk5oL/edit |
| **Sheet (Database)** | https://docs.google.com/spreadsheets/d/1AsM39WfxQ1HtN3_49mpKnu2Sg01dRI2Y4ssdILN6_Bc/edit |
| **Drive folder** | `1Qqvo31hox77ZDJ1i8N0awAWhFBAskVUO` (mena-leave - Storage) |
| **Web App URL** | https://script.google.com/macros/s/AKfycbwhvhNvpUJ2LrOCsQ35JA9OpqOR55rBfYoiayWZcqFxo754Os-YXEfmbUNEhOJ_cYN_/exec |
| **LIFF ID** | `2010175593-Fqjuhv0q` (single LIFF, concat subpath) |
| **LIFF URL** | https://liff.line.me/2010175593-Fqjuhv0q |
| **LINE OA** | `@966nnfkr` (displayName: "mena") |
| **Bot userId** | `U441d1a7df291928046c3982c1bc41948` |
| **Rich menu ID** | `richmenu-991b333252cd9892550774d5d228618a` (v2, default) |
| **OWNER (พี่ปุ้ย)** | `EMP-0001` / LINE userId `Ub47d6b519be013dbe6e83c4fbd079c56` |

---

## Phase 1 — Sheet + Drive ✅

- ✅ TASK-01: `setupDatabase()` — สร้าง 10 tab ใน Sheet
- ✅ TASK-02: `seedSettings()` — 19 settings keys
- ✅ TASK-03: `seedDefaultRules()` — sick (0/0/3) · personal (3/0/0) · vacation (7/0/0)
- ✅ TASK-04: `setupDrive()` — root folder + `leave-proofs` sub-folder
- ✅ TASK-05: `setupAll()` one-shot

---

## Phase 2 — LINE + LIFF + Rich menu ✅

- ✅ TASK-06: สร้าง Messaging API channel
  - LINE_CHANNEL_ACCESS_TOKEN ✓
  - LINE_CHANNEL_SECRET ✓
  - `verifyLineSecrets()` ผ่าน (displayName "mena", basicId @966nnfkr)
- ✅ TASK-07: สร้าง LIFF apps — **ปรับเป็น 1 LIFF เดียว** (แทน 8) ด้วย concat subpath routing
  - LIFF endpoint: `https://pariwat-aruno.github.io/mena-leave` (no trailing slash)
  - `permanentLinkPattern: concat` → subpath append → ทุก .html เข้าถึงได้
  - ทุกหน้า size = **Full**
- ✅ TASK-08: Rich menu v2 (`richmenu-991b333252cd9892550774d5d228618a`)
  - **Header band 280px:** logo "mena" cursive (Brush Script) + tagline "ระบบลางาน"
  - **Body:** 5 ปุ่ม card-style (shadow + accent stripe + divider) — Prompt-Bold + Prompt-Regular
  - **ส่งใบลา** = primary (filled magenta) · อื่น = white card
  - URL ผูก `liff.line.me/<LIFF_ID>/<page>.html` ทุกปุ่ม
  - Set default สำหรับทุก user — เห็นเลยตอนเปิดแชท OA
  - **History:** v1 (richmenu-38a26c35fa11d64a7c77893e3b1793ae) ลบไปแล้ว — v2 ใช้แทน

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
- ✅ TASK-11..14: foundation modules อยู่ใน 20 .gs files
  - Logger.gs / Config.gs / Utils.gs / LineApi.gs / DriveStore.gs / LiffSetup.gs (added)

---

## Phase 4 — Apps Script endpoints (โค้ดมี — รอเทสต์ flow จริง)

โค้ดทุกไฟล์ push เข้า Apps Script แล้ว — flow E2E ยังไม่ผ่าน

- ⏳ TASK-15: WebApp.gs router — health check ผ่าน (`{"ok":true,"service":"mena-leave",...}`) · postback handler รอเทสต์
- ⏳ TASK-16: Pairing.gs — 6-digit code + redeem
- ⏳ TASK-17: Register.gs — submitRegister/approveRegister/rejectRegister + getMyStatus
  - **verify ผ่านแล้ว** (Python urllib): visitor + active cases ตอบถูกต้อง
- ⏳ TASK-18: Supervisor.gs
- ⏳ TASK-19: Rules.gs
- ⏳ TASK-20: Quota.gs
- ⏳ TASK-21: LeaveRequest.gs
- ⏳ TASK-22: Approval.gs (3-stage)
- ⏳ TASK-23: Admin.gs
- ⏳ TASK-24: Manual.gs
- ⏳ TASK-25: FlexCard.gs (9 card types) — ลบ emoji แล้ว
- ⏳ TASK-26: Trigger.gs (function setupTriggers รอ user click)

---

## Phase 5 — LIFF frontend (live บน GH Pages — รอเทสต์ flow)

9 HTML pages + index.html redirect:

- ⏳ TASK-27: shared modules (config.js / api.js / auth.js / role.js / utils.js / manual.js) — config.js มี LIFF_ID + API_URL จริงแล้ว
- ⏳ TASK-28: myid.html — userId + status check
  - **verify ผ่านแล้ว**: เปิด LIFF บนมือถือ → แสดง userId ของ OWNER ได้
- ⏳ TASK-29: register.html
- ⏳ TASK-30: request.html (สำคัญที่สุด — GPS + form)
- ⏳ TASK-31: my-requests.html
- ⏳ TASK-32: approve.html
- ⏳ TASK-33: admin.html
- ⏳ TASK-34: manual.html + manual-admin.html

### เพิ่มเติม (นอก template)
- ✅ `liff/index.html` — redirect handler สำหรับ LIFF root URL (preserve query string ป้องกัน SDK loop)
- ✅ `liff/docs/` — public documentation site (3 หน้า + CSS)
  - `index.html` (landing + flowchart)
  - `user-guide.html` (mockup + flow ของ 7 หน้า · สำหรับพนักงาน/หัวหน้างาน/HR)
  - `owner-guide.html` (สิทธิ์พิเศษ OWNER · Pending_Changes · Settings table 15+ keys)

---

## Phase 6 — Deploy + E2E ✅ Backend / 🔄 Flow test

- ✅ TASK-35: Web App deploy — Anyone access, doGet health check ผ่าน
- ✅ TASK-36: GitHub Pages enabled (workflow `.github/workflows/pages.yml` auto-deploy ทุกครั้งที่ push)
- 🔄 TASK-37: E2E test
  - ✅ OWNER bootstrap (`bootstrapMe()` รันแล้ว)
  - ✅ เปิด LIFF บนมือถือ — myid.html แสดง userId
  - ✅ Backend verify: getMyStatus → `status=active, role=OWNER, role_label=เจ้าของ`
  - ⏳ refresh myid → ต้องขึ้นสถานะ "ใช้งานอยู่" + badge "เจ้าของ" (ยังไม่ verify)
  - ⏳ submit ใบลา (OWNER auto-approve)
  - ⏳ ตรวจ LeaveRequests + LeaveQuota
  - ⏳ test multi-user flow (ต้อง invite + register USER เพิ่ม)
- ⏳ **LINE webhook URL ตั้งใน LINE Console** (TODO ก่อน flex postback ทำงาน)

---

## Phase 7 — Triggers ❌

- ⏳ TASK-38: `setupTriggers()` daily 00:00 → expirePairingCodes + dailyTick (quota reset 1 ม.ค.)
  - **TODO**: รัน `setupTriggers` ใน `apps-script/Trigger.gs` ครั้งเดียว (1 click)

---

## Phase 8 — Public docs ✅

- ✅ `liff/docs/index.html` — landing เลือก guide + flowchart 3-stage approval
- ✅ `liff/docs/user-guide.html` — คู่มือพนักงาน/หัวหน้างาน/HR (7 sections)
- ✅ `liff/docs/owner-guide.html` — คู่มือเจ้าของ (9 sections, Settings table)
- ✅ `liff/docs/docs.css` — shared brand styling (Prompt + magenta)

URL live:
- https://pariwat-aruno.github.io/mena-leave/docs/
- https://pariwat-aruno.github.io/mena-leave/docs/user-guide.html
- https://pariwat-aruno.github.io/mena-leave/docs/owner-guide.html

---

## TODO ทันที (เริ่ม session ใหม่ได้เลย)

1. **เทสต์ LIFF myid.html บนมือถือ** — เปิด/refresh `liff.line.me/2010175593-Fqjuhv0q/myid.html` → ต้องเห็นสถานะ active + ปุ่มส่งใบลา (Backend ตอบถูกต้องแล้ว — รอ verify frontend แสดงผล)
2. **ตั้ง LINE webhook URL** ใน Messaging API channel = Web App URL (สำคัญสำหรับ flex postback button ที่ใช้อนุมัติในแชท)
3. **รัน `setupTriggers`** ใน `apps-script/Trigger.gs` (1 click — สร้าง daily cron 00:00 สำหรับ expire pairing codes + quota reset ปีใหม่)
4. **ส่งใบลาทดสอบ** (OWNER) → ตรวจ auto-approve flow ใน LeaveRequests + LeaveQuota
5. **Multi-user E2E:** invite ADMIN → invite USER → pair supervisor → flow 3-stage
6. **Logo จริง:** drop `liff/img/logo.jpg` (ปัจจุบันใช้ SVG placeholder ตัว "m") — Rich menu ใช้ Brush Script render "mena" cursive แล้วโอเค

---

## TODO ระยะกลาง

- ทำ smart routing ใน `index.html` (เช็ค role จาก backend → redirect ไปหน้าที่เหมาะ แทน hardcoded myid.html)
- audit checklist files (`audit/phase-N.md`) ยังไม่ tick checklist
- เพิ่ม `verifyConfig()` function ตรวจ Script Properties ครบ + Sheet ตรงกับ schema
- ✅ ลบ emoji `📋` `📍` `📎` `⚙️` ออกจาก LIFF + FlexCard (CONTEXT §7) — done 2026-05-24

---

## Key files / refs

- `CONTEXT.md` — data model + glossary (บังคับใช้)
- `CLAUDE.md` — stack + workflow + gotchas
- `TASKS.md` — 38 tasks เรียง phase
- `apps-script/Setup.gs` — setupAll · bootstrapMe · verifyLineSecrets · setupProperties
- `apps-script/LiffSetup.gs` — listLiffApps (debug helper)
- `apps-script/Trigger.gs` — setupTriggers (รอ run)
- `liff/js/config.js` — runtime config (API_URL + LIFF_ID)
- `liff/index.html` — LIFF root redirect (preserve query string)
- `liff/docs/` — public guide pages
- `scripts/setup_rich_menu.py` — rich menu generator (v2 layout)
