# CLAUDE.md — mena-leave (Leave Request LIFF)

> **อ่านไฟล์นี้ก่อนเริ่มทำงานบน project นี้ทุกครั้ง**
> Recipe นี้สรุปจาก partime-checkin ที่ build จริงและรู้ gotcha ทุกอย่าง

---

## 1. Stack ที่บังคับใช้

| Layer | ใช้อะไร | เหตุผล |
|---|---|---|
| Frontend (LIFF) | GitHub Pages (vanilla HTML + ES module) | ฟรี + LINE webview compat |
| Backend (API) | Google Apps Script Web App (doPost JSON) | ฟรี + ผูก Sheet ตรง |
| Database | Google Sheet (10 tab pattern) | ฟรี + เจ้าของแก้เองได้ |
| File storage | Google Drive (folder + sub-folders) | ฟรี + thumbnail URL render ใน flex |
| Channel | LINE Messaging API + LIFF + rich menu | ผู้ใช้ครอบคลุมในไทย |
| CI/CD | GitHub Actions (pages.yml) | auto-deploy ตอน push |

**ห้าม:**
- ห้าม host LIFF บน Apps Script HtmlService → LIFF SDK ใช้ไม่ได้ใน iframe sandbox
- ห้าม commit secret (token/secret) ลง git → ใช้ Script Properties แทน
- ห้าม set deployment access ผ่าน clasp → reset เป็น "Only myself" ทุกครั้ง — ใช้ UI เท่านั้น

---

## 2. โครงสร้าง project

```
mena-leave/
├── CONTEXT.md              # glossary + data model + conventions (บังคับใช้)
├── TASKS.md                # phased tasks
├── README.md               # public readme
├── CLAUDE.md               # ไฟล์นี้
├── docs/
│   └── architecture.md     # flows + setup checklist
├── audit/                  # I-019 audit checklist per phase
├── .github/workflows/
│   └── pages.yml           # auto-deploy liff/ → GitHub Pages
├── .gitignore
├── apps-script/            # backend (push ผ่าน clasp)
│   ├── .clasp.json         # script ID (gitignore)
│   ├── .claspignore
│   ├── appsscript.json     # timeZone Asia/Bangkok
│   ├── package.json        # clasp + scripts
│   ├── Setup.gs            # schema + setupDatabase + seedConfig + setupDrive + setupAll
│   ├── Logger.gs           # logInfo/logWarn/logError → Sheet Logs
│   ├── Config.gs           # getConfig + ROLES + ROLE_LABELS_TH + role helpers (I-022)
│   ├── Utils.gs            # haversine + IDs + datetime + role helpers
│   ├── LineApi.gs          # pushMessage/replyMessage/pushText/replyText + retry
│   ├── DriveStore.gs       # uploadImage (base64 → Drive subfolder + anyone-with-link)
│   ├── FlexCard.gs         # buildXxxCard functions + driveUrlToThumbnail_
│   ├── WebApp.gs           # doGet/doPost router + handleLineEvent_
│   ├── Pairing.gs          # 6-digit code + invite message (4-role foundation)
│   ├── Register.gs         # Visitor → User flow + HR approve
│   ├── Supervisor.gs       # HR pair supervisor ↔ subordinate
│   ├── LeaveRequest.gs     # ส่งใบลา + validate quota
│   ├── Approval.gs         # 3-stage approval flow
│   ├── Quota.gs            # คำนวณ + reset ปีปฏิทิน
│   ├── Rules.gs            # CRUD เงื่อนไขการลา
│   ├── Admin.gs            # owner/admin only endpoints
│   ├── Manual.gs           # คู่มือ config endpoint (I-021)
│   └── Trigger.gs          # daily expire codes + yearly reset quota
├── liff/                   # frontend (host GitHub Pages)
│   ├── css/style.css       # mena palette (cherry tint emphasis — employee friendly)
│   ├── js/
│   │   ├── config.js       # LIFF_IDs + API_URL + DEV_MOCK
│   │   ├── api.js          # POST helper (text/plain CORS workaround)
│   │   ├── auth.js         # initAuth (LIFF init + getProfile)
│   │   ├── role.js         # ROLES + ROLE_LABELS_TH (mirror backend)
│   │   ├── utils.js        # fileToResizedBase64 + getGeolocation + showError
│   │   └── manual.js       # accordion + role gate for manual pages
│   ├── img/logo.jpg
│   ├── myid.html           # show LINE userId (I-001 — Visitor first stop)
│   ├── register.html       # USER ลงทะเบียน (Visitor → pending)
│   ├── request.html        # USER ส่งใบลา + ดูเงื่อนไข
│   ├── my-requests.html    # USER ดูประวัติ
│   ├── approve.html        # หัวหน้างาน + ADMIN + OWNER ใช้ร่วม (stage-aware)
│   ├── admin.html          # ADMIN/OWNER LIFF — onboard + supervisor + quota + rules
│   ├── manual.html         # คู่มือ User (I-021)
│   └── manual-admin.html   # คู่มือ Admin/Owner (I-021)
└── scripts/
    └── setup_rich_menu.py  # generate image + upload via LINE API
```

---

## 3. Phased workflow (เคร่งครัด)

### Phase 1 — Sheet + Drive
- เขียน `Setup.gs::setupDatabase()` สร้าง Sheet 10 tab + headers
- `seedConfig()` ใส่ค่า default ใน Sheet `Settings`
- `setupDrive()` สร้าง Drive folder root + sub-folder `leave-proofs` + permission anyone-with-link
- ผู้ใช้รัน → ส่ง SHEET_ID + DRIVE_FOLDER_ID กลับมา → save ลง memory

### Phase 2 — LINE Channel + LIFF
- ผู้ใช้สร้าง: LINE OA + Messaging API channel + LIFF apps + rich menu (manual UI)
- Claude เขียน `setup_rich_menu.py` regenerate image + upload
- ขอ: LINE_CHANNEL_ACCESS_TOKEN + LINE_CHANNEL_SECRET + LIFF_IDs

### Phase 3 — Apps Script foundation
- Copy `Logger/Config/Utils/LineApi/DriveStore.gs` ตาม template (เกือบไม่ต้องแก้)
- Setup `clasp` (`npm install --save-dev @google/clasp` ใน apps-script/)
- `clasp create-script --type standalone --title "mena-leave-backend"`
- `clasp push --force`

### Phase 4 — Apps Script endpoints
- เขียน `<Flow>.gs` ตาม TASKS — แต่ละ flow มี handler function รับ payload, return JSON
- Update `WebApp.gs::routeAction_` เพิ่ม case ใหม่
- เขียน `FlexCard.gs::build*Card()` per card type
- ใส่ test functions: `testSendXxx()` bypass guards, `previewXxxToOwner()`

### Phase 5 — LIFF frontend
- เขียน HTML files ใน `liff/`
- ใช้ shared CSS + JS modules (`config.js / api.js / auth.js / role.js / utils.js / manual.js`)
- `<img class="logo" src="./img/logo.jpg" />` + `<div class="brand">MENA COSMETICS</div>` ทุกหน้า
- `<div class="page-footer">MENA COSMETICS</div>` ท้ายหน้า

### Phase 6 — Deploy + ทดสอบ
- ผู้ใช้ Apps Script → Deploy → New deployment → Web app → Anyone → Deploy → ส่ง URL กลับ
- update `liff/js/config.js` API_URL → push GitHub
- ผู้ใช้ตั้ง LINE webhook URL = web app URL
- ผู้ใช้ update LIFF endpoint URLs = GitHub Pages URLs
- ทดสอบ flow ผ่าน LINE จริง

### Phase 7 — Trigger
- `Trigger.gs::setupTriggers()` time-based (daily expire codes + yearly quota reset)

---

## 4. Workflow per code change (สำคัญ — clasp 3.x bug)

```
แก้ local
   ↓
clasp push --force                      # อัพ HEAD
   ↓
clasp create-version "<desc>"            # สร้าง immutable version snapshot
   ↓
[ผู้ใช้] Apps Script → Deploy → Manage  # ผ่าน UI เพราะ clasp reset access เป็น Only myself
        → Edit เก่า → Version: ใหม่ล่าสุด → Deploy
```

**ห้าม** `clasp create-deployment --deploymentId X` หรือ `clasp update-deployment` — reset access ทุกครั้ง → 404 จาก outside

---

## 5. Conventions (บังคับ)

### Code
- Comment ใน .gs/.html = ไทย, function/var = อังกฤษ
- Apps Script function ทุกตัวต้อง try-catch + log ลง Sheet `Logs`
- Datetime: `Asia/Bangkok` ISO 8601 พร้อม `+07:00` → ใช้ `nowBangkok()` / `todayBangkok()` / `formatThaiDateTime()`
- Idempotent: setup functions รันซ้ำได้ปลอดภัย
- ID format: `<PREFIX>-XXXX` (running) — เช่น `EMP-0001`, `LV-YYYYMMDD-XXXX`

### Role naming (I-022 — บังคับ)
- Code: `OWNER` / `ADMIN` / `USER` / `VISITOR` (uppercase) — ห้าม `HR`, `Manager`, `Staff`
- UI: ใช้ `ROLE_LABELS_TH` หรือ Sheet Config override per project
- mena-leave override:
  - `OWNER` = "เจ้าของ"
  - `ADMIN` = "ฝ่ายบุคคล (HR)"
  - `USER` (is_supervisor=TRUE) = "หัวหน้างาน"
  - `USER` (default) = "พนักงาน"
  - `VISITOR` = "ยังไม่ลงทะเบียน"

### Config separation
- **Script Properties** = secret + immutable IDs (ACCESS_TOKEN, SECRET, SHEET_ID, DRIVE_FOLDER_ID, LIFF_IDs)
- **Sheet `Settings` row** = ค่าที่เจ้าของอาจอยากแก้เอง (quota defaults, rules, approval flow, brand)

### Multi-owner pattern
- Sheet `Users` rows where role=OWNER (ไม่ใช้ comma-separated ใน Settings แล้ว — ใช้ Users tab)
- ใช้ `isOwner(userId)` / `isAdmin(userId)` / `getUserRole(userId)` helpers ใน Config.gs

### Brand & UI (I-013 + I-017)
- Cherry palette base (#d51f7d primary, #fce4ef tint) — **mena-leave เน้น tint มากกว่า dark** สำหรับ employee-friendly tone
- ห้าม emoji ยกเว้น ⚠️ สำหรับ warning + ✅ สำหรับ success status
- Logo + brand text ทุกหน้า + flex card header
- Footer brand ทุก LIFF page
- Brand customization via Sheet `Settings`: brand_name, brand_logo_url, brand_color_primary

### GPS (project-specific override)
- ใช้ `getGeolocation()` จาก `utils.js` — บังคับ capture ตอน submit ใบลา
- ห้ามบังคับเปิดกล้อง / เซลฟี่
- ถ้า GPS ไม่ออก (deny permission / timeout) → block submission + แสดง error friendly

### Attachment (project-specific override)
- ใช้ `<input type="file" accept="image/*">` — **อนุญาตเลือก gallery** (ต่างจาก partime-checkin)
- เหตุผล: ผู้ใช้แนบใบรับรองแพทย์ที่ถ่ายไว้แล้ว / บัตรคิว / รูปอุบัติเหตุ
- ผ่าน `fileToResizedBase64()` resize 1280px JPEG 85% ก่อน upload
- Optional ทุก leave_type — ห้าม block submission ถ้าไม่แนบ

---

## 6. Access control — 4-role hierarchy

ทุก LIFF mini-app ต้องบังคับใช้:

### ชั้น 1 — LIFF apps แยกตัว
- **User LIFF apps** (5 ตัว): myid / register / request / my-requests / approve / manual
- **Admin LIFF app** (2 ตัว แยก): admin / manual-admin
- คนละ LIFF ID

### ชั้น 2 — Rich menu (1 menu สำหรับทุกคน)
- ปุ่ม 1: "ส่งใบลา" → request.html
- ปุ่ม 2: "ใบลาของฉัน" → my-requests.html
- ปุ่ม 3: "อนุมัติ" → approve.html (visible แต่ backend filter ตาม role)
- ปุ่ม 4: "จัดการ" → admin.html (visible แต่ backend block VISITOR/USER)
- ปุ่ม 5: "คู่มือ" → manual.html (everyone)

### ชั้น 3 — Backend verify (ห้ามขาดเด็ดขาด)
- ทุก endpoint ของ admin/owner: `if (!isAdmin(payload.lineUserId)) return { ok: false, error: 'forbidden' };`
- ทุก endpoint stage-3 approval: `if (!isOwner(...)) return ...`
- LIFF admin frontend: catch `forbidden` → แสดง "คุณไม่มีสิทธิ์เข้าถึงหน้านี้"

```js
function someOwnerOnlyAction(payload) {
  if (!isOwner(payload && payload.lineUserId)) return { ok: false, error: 'forbidden' };
  // ... actual logic ...
}
```

---

## 7. Approval flow (project-specific — สำคัญที่สุด)

### Stages
```
USER submit
  → Stage 1: Supervisor (USER with is_supervisor=TRUE, ผูกผ่าน Supervisors sheet)
    → Stage 2: ADMIN (HR) — แต่ละคน approve ได้
      → Stage 3: OWNER — แต่ละคน approve ได้
        → final_status = approved
```

### Special cases
- **หัวหน้างานลาเอง** → ข้าม stage 1 (supervisor ของ supervisor = HR) → เริ่มที่ stage 2
- **ADMIN ลาเอง** → ข้าม stage 1 + stage 2 → ตรงไป stage 3 (OWNER)
- **OWNER ลาเอง** → auto approve (มี note ใน Audit_Log)
- **ปฏิเสธชั้นใดชั้นหนึ่ง** → final_status = rejected + แจ้งทุกชั้นที่ผ่านมา + ผู้ลา

### Quota deduction
- ตอน submit → ยังไม่หัก (pending แค่ reserve)
- ตอน stage-3 approved → หักจริง (sick_used += days)
- ตอน rejected ใด ๆ → ยกเลิก reserve

---

## 8. Gotchas (เจอจริงตอน build partime-checkin)

| ปัญหา | สาเหตุ | วิธีแก้ |
|---|---|---|
| LIFF + Apps Script HtmlService = iframe sandbox block LIFF SDK | webview bridge | host LIFF บน GitHub Pages |
| GitHub Pages บน private repo = paid plan | GitHub Free | repo ต้องเป็น public (ตรวจให้ไม่มี secret) |
| `clasp create-deployment` reset access เป็น "Only myself" → 404 | clasp 3.x | ใช้ Apps Script UI ทำ Web App deployment |
| Apps Script Web App POST → 302 redirect | normal behavior | browser fetch + LINE webhook follow ได้ |
| LINE webhook Verify = 302 fail | LINE Verify ไม่ follow redirect | ignore Verify, real event ทำงานปกติ |
| Sheet `08:00` กลายเป็น Date object ตอน read | Sheets auto-convert | format Date → 'HH:mm' string |
| Drive URL `/file/d/.../view` แสดง HTML viewer | Drive default URL | แปลง → `https://drive.google.com/thumbnail?id=ID&sz=w800` |
| iOS file input บางครั้ง show gallery แม้ใส่ `capture` | browser ignore hint | (ตั้งใจให้เลือก gallery ได้สำหรับ leave attachment) |
| `clasp push` รายงานสำเร็จแต่ server มีไฟล์ไม่ครบ | OAuth expired silently | `clasp login` ใหม่ + force push |

---

## 9. Test pattern

ทุก Apps Script flow ต้องมี:
- `testSubmitLeave_xxx()` — call handler ตรง bypass time/state check
- `previewLeaveCardToOwner()` — ส่ง flex card หา owner เพื่อดูหน้าตา (bypass employee filter)
- บน LIFF: `DEV_MOCK_LIFF: true` ใน config.js ทดสอบใน browser ปกติได้

ทดสอบ POST API จาก CLI:
```bash
python3 -c "
import urllib.request, json
url = 'https://script.google.com/macros/s/.../exec'
data = json.dumps({'action':'getMyQuota','payload':{'lineUserId':'U...'}}).encode()
req = urllib.request.Request(url, data=data, headers={'Content-Type':'text/plain;charset=utf-8'})
print(urllib.request.urlopen(req).read().decode())
"
```

---

## 10. ห้ามทำ (out of scope — Phase 2)

- ❌ Auth เกินกว่า LINE Login
- ❌ Real-time websocket / push UI update
- ❌ Mobile native app
- ❌ OCR ใบรับรองแพทย์อัตโนมัติ
- ❌ Integration กับระบบ HR/payroll ภายนอก
- ❌ คำนวณเงินเดือนหักวันลา
- ❌ Export PDF ใบลา
- ❌ Multi-company / multi-tenant
- ❌ Calendar integration (Google Calendar / Outlook)

ถ้าผู้ใช้ขอเหล่านี้ → ตอบ "ออก scope mini-app — Phase 2"

---

## 11. Instincts ที่ใช้ (ทุกตัวบังคับ)

### Global (มาพร้อมทุก mini-app)
- ✅ I-016 Owner add Owner ทันที
- ✅ I-017 Brand customization (Sheet Settings + Drive logo)
- ✅ I-018 Pairing invite + copy button
- ✅ I-019 Audit checklist files (folder `audit/`)
- ✅ I-020 setupAll() one-shot
- ✅ I-021 Manual pages (manual.html + manual-admin.html)
- ✅ I-022 Standard role naming (OWNER/ADMIN/USER/VISITOR)

### 4-role specifics
- ✅ I-001 User ID Copy Button (myid.html)
- ✅ I-002 setupProperties() (subsumed by I-020)
- ✅ I-003 Claude Code รัน clasp push เอง
- ✅ I-004 Flex Bubble + Action Button (all LINE messages)
- ✅ I-005 LIFF userId ผ่าน auth.js
- ✅ I-007 Error page เมื่อ unregistered (Visitor first stop)
- ✅ I-008 Test functions bypass guards
- ✅ I-009 Logger.gs → Sheet Logs
- ✅ I-011 ห้าม commit secret
- ✅ I-012 LINE Provider เดียวกัน (LIFF + Messaging API)
- ✅ I-013 Cherry palette + brand (override: tint emphasis)
- ✅ I-014 กล้องใช้ getUserMedia — **mena-leave override: ใช้ `<input type=file>` สำหรับ attachment** (ตั้งใจ)
- ✅ I-015 text/plain POST CORS workaround
