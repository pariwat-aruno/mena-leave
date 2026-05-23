# TASKS.md — mena-leave

> Claude อ่านไฟล์นี้คู่กับ CONTEXT.md + docs/architecture.md
> ทำทีละ task ตามลำดับ ห้ามข้าม dependency

## วิธีใช้
1. หยิบ task แรกที่ยังไม่ติ๊ก
2. อ่าน acceptance criteria
3. Implement
4. รัน `clasp push --force` (สำหรับ apps-script) หรือ commit (สำหรับ liff)
5. ทดสอบตาม acceptance criteria
6. ติ๊ก ✅ → task ถัดไป

---

## Phase 1 — Sheet + Drive

### TASK-01: setupDatabase() — สร้าง 10 sheet tab
- เขียน `Setup.gs::setupDatabase()` สร้าง Sheet `mena-leave - Database`
- 10 tab: `Users`, `Supervisors`, `LeaveRequests`, `LeaveQuota`, `LeaveRules`, `Pairing_Codes`, `Pending_Changes`, `Audit_Log`, `Logs`, `Settings`
- Header ทุก tab ตาม CONTEXT.md § 4
- **Acceptance:** รันใน Apps Script editor → ได้ Sheet 10 tab + header แถวแรก + freeze row 1 + log SHEET_ID

### TASK-02: seedSettings() — Settings defaults
- `Setup.gs::seedSettings()` ใส่ค่า default ทั้งหมดใน CONTEXT.md § 4 Settings table
- **Acceptance:** รันแล้ว Settings มี 18 rows (ตามตาราง CONTEXT) skip ของที่มีอยู่แล้ว

### TASK-03: seedDefaultRules() — กฎเริ่มต้น
- `Setup.gs::seedDefaultRules()` ใส่ 3 rules: sick (0/0/3), personal (3/0/0), vacation (7/0/0)
- **Acceptance:** Sheet LeaveRules มี 3 active rows

### TASK-04: setupDrive() — Drive folder + sub-folder
- `Setup.gs::setupDrive()` สร้าง root `mena-leave - Storage` + sub `leave-proofs` + anyone-with-link
- **Acceptance:** ได้ DRIVE_FOLDER_ID + เช็คสิทธิ์ public viewable

### TASK-05: setupAll() — I-020 one-shot
- `Setup.gs::setupAll()` รัน TASK-01..04 ตามลำดับ + setupProperties() + log สรุป
- **Acceptance:** รันใน Apps Script editor 1 ครั้ง — ระบบพร้อมใช้ (เหลือแค่ใส่ secret + LIFF IDs)

---

## Phase 2 — LINE OA + LIFF + Rich menu

### TASK-06: สร้าง LINE Messaging API channel
- ผู้ใช้สร้างผ่าน https://developers.line.biz/console/
- ขอ: LINE_CHANNEL_ACCESS_TOKEN + LINE_CHANNEL_SECRET
- เปิด webhook + ปิด auto-reply

### TASK-07: สร้าง LIFF apps (8 ตัว)
- คนละ endpoint URL = `https://<gh-user>.github.io/<repo>/<page>.html`
- รายชื่อ:
  1. `myid.html` — LIFF_ID_MYID
  2. `register.html` — LIFF_ID_REGISTER
  3. `request.html` — LIFF_ID_REQUEST
  4. `my-requests.html` — LIFF_ID_HISTORY
  5. `approve.html` — LIFF_ID_APPROVE
  6. `admin.html` — LIFF_ID_ADMIN
  7. `manual.html` — LIFF_ID_MANUAL
  8. `manual-admin.html` — LIFF_ID_MANUAL_ADMIN
- Bot link: On (Aggressive) · Scopes: profile + openid · Channel: Published

### TASK-08: Rich menu
- รัน `scripts/setup_rich_menu.py` (กรอก ACCESS_TOKEN ใน env)
- 5 ปุ่ม: ส่งใบลา / ใบลาของฉัน / อนุมัติ / จัดการ / คู่มือ

---

## Phase 3 — Apps Script foundation

### TASK-09: clasp setup
```bash
cd apps-script
npm install --save-dev @google/clasp
./node_modules/.bin/clasp create-script --type standalone --title "mena-leave-backend"
./node_modules/.bin/clasp push --force
```
- **Acceptance:** Apps Script project มีไฟล์ครบ ใน editor

### TASK-10: setupProperties() + secrets
- Apps Script editor → Project Settings → Script Properties → ใส่ manual:
  - LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET
- รัน `setupProperties()` ใส่ SHEET_ID, DRIVE_FOLDER_ID, LIFF_IDs ทั้ง 8

### TASK-11..14: foundation modules
- Logger.gs (logInfo/logError → Sheet Logs)
- Config.gs (getConfig + ROLES + isOwner/isAdmin + role helpers I-022)
- Utils.gs (haversine, IDs, datetime, getCurrentUser, findSupervisor)
- LineApi.gs (push/reply + retry exponential backoff)
- DriveStore.gs (uploadImage + permission)

---

## Phase 4 — Apps Script endpoints

### TASK-15: WebApp.gs — doPost router
- route by `action`: register / approveRegister / submitLeave / approveLeave / getMyQuota / getMyHistory / getPendingForMe / getRules / getApprovalConditions / pairSupervisor / setQuota / upsertRule / getAdminDashboard / ...
- handle LINE webhook (postback for inline approval)
- **Acceptance:** doGet → JSON health check / doPost unknown action → error

### TASK-16: Pairing.gs (universal 4-role)
- `createPairingCode(forUserId)` → 6-digit code, TTL 24h, revoke เก่า
- `redeemPairingCode(code, lineUserId)` → set Users.line_user_id + status=active
- `expirePairingCodes()` — cron daily
- **Acceptance:** test สร้าง code → redeem → Users row update

### TASK-17: Register.gs
- `submitRegister(payload)` — Visitor กรอกฟอร์มสมัคร → insert Users row (status=pending) + push Flex card หา ADMIN ทุกคน
- `approveRegister(payload)` — ADMIN กด approve ใน flex → set status=active + create LeaveQuota row ตาม default + push Flex confirm หา user
- `rejectRegister(payload)` — ADMIN กด reject → delete row + push notify user
- **Acceptance:** Visitor submit → ADMIN ได้ flex card → approve → user เปลี่ยนเป็น active + มี quota row

### TASK-18: Supervisor.gs
- `pairSupervisor(payload)` — ADMIN เลือก subordinate + supervisor → insert Supervisors row + invalidate old
- `unpairSupervisor(payload)` — ADMIN ลบ pair
- `setSupervisorFlag(payload)` — ADMIN toggle `is_supervisor` ของ user
- `getSupervisorFor(userId)` — return current supervisor user_id หรือ null
- **Acceptance:** ADMIN กด pair → row ใน Supervisors + ลูกน้องเห็น supervisor ใน LIFF

### TASK-19: Rules.gs
- `getRules()` — return active rules ทั้งหมด (สำหรับ request.html "ดูเงื่อนไข")
- `getApprovalConditions(payload)` — input: leave_type, user_id → return { quota: {total, used, reserved, available}, rule: {...} }
- `upsertRule(payload)` — ADMIN/OWNER แก้ rule (ผ่าน Pending_Changes ถ้า ADMIN)
- **Acceptance:** USER กดดูเงื่อนไข → เห็น quota คงเหลือ + กฎทุก type

### TASK-20: Quota.gs
- `getMyQuota(payload)` — return quota ของ user ปี current
- `reserveQuota(userId, leaveType, days)` — reserve += days
- `commitQuota(userId, leaveType, days)` — used += days, reserved -= days
- `rollbackQuota(userId, leaveType, days)` — reserved -= days
- `resetQuotaYearly()` — cron 1 ม.ค. 00:00 — สร้าง row ใหม่ปีถัดไป (carry vacation? — config ใน Settings)
- `setQuota(payload)` — ADMIN set quota ของ user ใดๆ ผ่าน Pending_Changes
- **Acceptance:** quota ลบ-เพิ่มถูกต้องตลอด flow

### TASK-21: LeaveRequest.gs
- `submitLeave(payload)` — validate: GPS, quota, rules → insert LeaveRequests row + reserve quota + trigger Stage 1 (push Flex)
- `getMyHistory(payload)` — return list ใบลาของผู้ลา (date desc)
- `getOneRequest(payload)` — return detail ของ leave_id 1 ใบ
- validateLeavePayload_ — บังคับ:
  - GPS lat/lng must present (gps_required=TRUE)
  - leave_type ∈ {sick, personal, vacation}
  - date_from ≤ date_to
  - days > 0 และ ≤ quota available
  - is_retroactive ถ้า date_from < today → ต้องเป็น sick เท่านั้น
  - attachment_required_above_days enforce
- **Acceptance:** submit ผ่าน LIFF → row ใน LeaveRequests + reserve quota + supervisor ได้ flex card

### TASK-22: Approval.gs (สำคัญที่สุด — 3 stage)
- `approveLeave(payload)` — input: leave_id, stage, decision (approve/reject), note → update stage column + trigger next stage หรือ finalize
- Stage logic (ดู CONTEXT § 8):
  - Stage 1: ใครเป็น supervisor ของ user_id? — backend check stage1_by must = that supervisor
  - Stage 2: ทุก ADMIN approve ได้ (1st wins) — backend check isAdmin(user_id)
  - Stage 3: ทุก OWNER approve ได้ — backend check isOwner(user_id)
  - หัวหน้างานลา → skip stage 1
  - ADMIN ลา → skip stage 1 + 2
  - OWNER ลา → auto-approve
- Notification per stage (ทุก stage push Flex):
  - Stage 1 approved → push Stage 2 flex หา ADMIN ทุกคน + push update card หาผู้ลา
  - Stage 2 approved → push Stage 3 flex หา OWNER ทุกคน + push update card หาผู้ลา + supervisor
  - Stage 3 approved → final approve card หาผู้ลา + supervisor + ADMIN + commit quota
  - Any reject → final reject card หาผู้ลา + ทุกคนที่ผ่านมา + rollback quota
- `getPendingForMe(payload)` — return list pending ที่ user ต้องตัดสิน (filter by role + stage)
- `handlePostback_(ev)` — webhook handler รับ postback จาก flex button (action=approve_leave&id=LV-XXX&stage=N&decision=approve)
- **Acceptance:** ส่งใบลาผ่าน flow ครบ 3 stage → final_status=approved + quota หัก

### TASK-23: Admin.gs
- `getAdminDashboard(payload)` — return summary: pending registers, pending leaves, low quota users, recent activity (limit 20)
- `getAllUsers(payload)` — ADMIN list users (filter active/inactive)
- `getAllLeaves(payload, filters)` — ADMIN/OWNER list leaves with filters (date range, leave_type, status, user_id)
- `setUserStatus(payload)` — ADMIN inactive/active (offboard)
- `inviteOwner(payload)` — OWNER add OWNER ใหม่ทันที (I-016) — สร้าง pairing code + send invite message
- **Acceptance:** ADMIN/OWNER เห็น dashboard ครบ

### TASK-24: Manual.gs (I-021)
- `getManualConfig(payload)` — return { brand: {name, logoUrl, color}, contact: {lineId, phone}, role }
- ใช้ใน manual.html + manual-admin.html

### TASK-25: FlexCard.gs (per card type)
- `buildRegisterCard` — แจ้ง ADMIN ว่ามีคนสมัครใหม่ (ปุ่ม approve/reject)
- `buildSubmittedCard` — confirm ผู้ลาว่าใบส่งแล้ว
- `buildApprovalRequestCard` — ขออนุมัติ (ใช้ทั้ง 3 stage — ปรับ headerLabel ตาม stage)
- `buildApprovalUpdateCard` — แจ้งผู้ลาว่า stage X passed
- `buildFinalApprovedCard` — แจ้ง approved ครบ
- `buildFinalRejectedCard` — แจ้ง rejected
- `buildPairingInviteCard` — I-018 (ปุ่มคัดลอก + ส่ง LINE)
- `buildSupervisorPairedCard` — แจ้ง user ว่ามี supervisor ใหม่
- `buildQuotaSetCard` — แจ้งผู้ใช้ว่า ADMIN ปรับ quota ของเขา
- Test: `previewAllCardsToOwner()` ส่งทุก card หา OWNER เพื่อดูหน้าตา

### TASK-26: Trigger.gs
- `setupTriggers()` — สร้าง daily 00:00 → `expirePairingCodes` + `dailyTick`
- `dailyTick()` — เช็คว่าวันนี้ 1 ม.ค. → `resetQuotaYearly()`
- `dailyExpireCodes()` — set status=expired สำหรับ Pairing_Codes ที่ expires_at < now
- **Acceptance:** trigger ทำงานจริง — เช็ค Apps Script execution log

---

## Phase 5 — LIFF frontend

### TASK-27: liff/js/config.js + shared modules
- `config.js` — API_URL + LIFF_IDS (8 keys)
- `api.js` — POST text/plain helper
- `auth.js` — initAuth + getProfile + state
- `role.js` — ROLES + ROLE_LABELS_TH mirror backend
- `utils.js` — fileToResizedBase64 + getGeolocation + showError + clearError + dateUtils
- `manual.js` — accordion + role gate

### TASK-28: liff/myid.html (I-001)
- Show LINE userId + copy button (universal)
- ลิงก์ "ลงทะเบียน" ถ้ายังไม่ register
- ลิงก์ "เข้าระบบ" ถ้า register แล้ว
- **Acceptance:** Visitor เปิด → เห็น userId + copy ได้

### TASK-29: liff/register.html
- Form fields: display_name (pre-filled จาก LINE), emp_code, phone, email, department, position
- Submit → POST /submitRegister → success page "รอ HR อนุมัติ"
- ถ้า user มี row pending แล้ว → แสดง "รอการอนุมัติอยู่"
- ถ้า approved แล้ว → redirect ไป request.html
- **Acceptance:** Visitor กรอกครบ + submit → ADMIN ได้ flex card

### TASK-30: liff/request.html (สำคัญที่สุด)
- Step 1: หน้า "เงื่อนไขการลา" — แสดง quota คงเหลือ + กฎ per leave_type (ผ่าน /getApprovalConditions)
- Step 2: ฟอร์ม — เลือก leave_type, date_from, date_to (auto-calc days), reason, attachment (optional)
- Step 3: บังคับ GPS — แสดง "กำลังจับพิกัด..." แล้ว preview ก่อน submit
- Submit → POST /submitLeave (พร้อม gps_lat/lng + base64 attachment)
- success → "ส่งแล้ว ส่งต่อหัวหน้างาน" + ลิงก์ดูประวัติ
- **Acceptance:** USER ส่งใบลาได้ครบ flow + ถ้า GPS deny → block

### TASK-31: liff/my-requests.html
- List ใบลาของตัวเอง (date desc, paginated 20)
- แต่ละ row: leave_type, date range, days, final_status badge, current stage
- กดเข้าไปดู detail (stage timeline + attachment preview)
- **Acceptance:** USER เห็นประวัติทุกใบ

### TASK-32: liff/approve.html
- Backend auto-detect role + stage (จาก /getPendingForMe)
- List pending ที่ user ต้องตัดสิน (filter ตาม role):
  - หัวหน้างาน → stage 1 ของลูกน้อง
  - ADMIN → stage 2
  - OWNER → stage 3 + pending registers + Pending_Changes
- แต่ละ row: ผู้ลา, leave_type, dates, reason, attachment preview, GPS map link
- 2 ปุ่ม: ✅ อนุมัติ / ❌ ไม่อนุมัติ (มี note input)
- **Acceptance:** USER กดอนุมัติได้ flow ถูกต้อง

### TASK-33: liff/admin.html (ADMIN/OWNER LIFF)
- Backend check: ถ้าไม่ใช่ ADMIN/OWNER → แสดง "ไม่มีสิทธิ์เข้าถึง"
- Tabs:
  - "พนักงาน" — list + invite (สร้าง pairing code) + set status + set is_supervisor + offboard
  - "หัวหน้างาน" — pair subordinate → supervisor (dropdown)
  - "โควตา" — set quota per user (ผ่าน Pending_Changes ถ้า ADMIN)
  - "กฎ" — CRUD LeaveRules (ผ่าน Pending_Changes ถ้า ADMIN)
  - "Settings" — brand, approval levels (ผ่าน Pending_Changes)
  - "อนุมัติ pending changes" — OWNER เท่านั้น
  - "Report" — filter leaves
- **Acceptance:** ADMIN ทำ onboard + pair supervisor + set quota ได้ครบ

### TASK-34: liff/manual.html + manual-admin.html (I-021)
- Accordion sections:
  - manual.html: "เริ่มใช้งาน", "ส่งใบลายังไง", "ดูประวัติ", "ติดต่อ HR"
  - manual-admin.html: "Onboard พนักงานใหม่", "ผูกหัวหน้างาน", "ตั้งโควตา", "อนุมัติใบลา", "อนุมัติ pending changes"
- Footer: contact line_id + brand (จาก /getManualConfig)
- **Acceptance:** USER กดดูคู่มือได้ทุก section

---

## Phase 6 — Deploy + ทดสอบ end-to-end

### TASK-35: Deploy Apps Script Web App
- Apps Script UI → Deploy → New deployment → Web app → Anyone → copy URL
- ใส่ใน:
  - `liff/js/config.js` API_URL
  - LINE Developers webhook URL
- push GitHub

### TASK-36: Enable GitHub Pages
- repo Settings → Pages → Source: GitHub Actions → wait deploy → check URL works
- update LIFF endpoint URLs ใน LINE Developers ทั้ง 8 ตัว

### TASK-37: E2E test
1. Bootstrap OWNER (รัน `bootstrapFirstOwner(lineUserId)` ครั้งเดียว)
2. OWNER invite ADMIN ผ่าน admin.html → ADMIN ได้ invite message → redeem code → register → status=active
3. ADMIN invite USER (2 คน — A กับ B) → ทำเหมือนกัน → set A.is_supervisor=TRUE → pair B → A
4. B ส่งใบลา ผ่าน request.html
5. A (supervisor) approve stage 1
6. ADMIN approve stage 2
7. OWNER approve stage 3
8. ตรวจ Sheet: final_status=approved, sick_used updated, audit log ครบ
9. ตรวจ LINE chat: B ได้ flex update 4 ใบ (submitted + s1 passed + s2 passed + final approved)

---

## Phase 7 — Trigger setup

### TASK-38: setupTriggers()
- รัน 1 ครั้ง → สร้าง daily trigger
- **Acceptance:** Apps Script Triggers panel มี 1 row

---

## Definition of Done
- [ ] ทุก task ติ๊กครบ
- [ ] Test E2E (TASK-37) ผ่านในมือถือจริง
- [ ] CONTEXT.md ตรงกับ implementation
- [ ] audit/phase-N.md checklist ผ่าน (I-019)
- [ ] commit + push GitHub
- [ ] ส่ง LIFF URL + admin LIFF URL ให้พี่ปุ้ย

---

## Reference order (อย่าข้าม)

```
TASK-01 → 02 → 03 → 04 → 05 (Sheet+Drive ready)
       → 06 → 07 → 08 (LINE + LIFF + rich menu ready)
       → 09 → 10 → 11..14 (Apps Script foundation)
       → 15 → 16 (router + Pairing) [universal core]
       → 17 → 18 (Register + Supervisor — depends on Users + Supervisors sheets)
       → 19 → 20 (Rules + Quota — depends on LeaveRules + LeaveQuota)
       → 21 → 22 (LeaveRequest + Approval — depends on all above)
       → 23 → 24 → 25 → 26 (Admin + Manual + FlexCard + Trigger)
       → 27..34 (LIFF frontend — depends on backend endpoints)
       → 35 → 36 → 37 → 38 (deploy + test + trigger)
```
