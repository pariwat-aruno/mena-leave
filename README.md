# mena-leave — ระบบลางาน Mena Cosmetics

LIFF mini-app สำหรับพนักงานส่งใบลา + 3-stage approval (หัวหน้างาน → HR → เจ้าของ) บังคับ GPS + แนบไฟล์ optional

**Stack:** GitHub Pages (LIFF) + Apps Script (API) + Google Sheet (DB) + LINE Messaging API + Drive (storage)

---

## 📌 เป้าหมาย

1. **ลดงาน HR** — ไม่ต้องเซ็นใบลากระดาษ ระบบ track ทุก stage อัตโนมัติ
2. **ลด friction** — ไม่ต้องเผชิญหน้า ส่งผ่าน LINE ได้เลย
3. **Employee-friendly** — UI ผ่อนคลาย ไม่บีบให้ถ่ายเซลฟี่ มีแค่ GPS + attachment optional
4. **เสริมภาพลักษณ์** — modern HR system ใส่ใจพนักงาน

---

## 🏗️ Architecture

```
USER (พนักงาน) → LIFF → POST → Apps Script → Sheet (10 tab) + Drive (attachment)
                                          ↓
                            Stage 1: Supervisor (USER + is_supervisor)
                                          ↓
                            Stage 2: ADMIN (HR)
                                          ↓
                            Stage 3: OWNER → final approved + quota หัก
```

ดูรายละเอียดที่ [docs/architecture.md](docs/architecture.md)

---

## 📁 ไฟล์สำคัญ

- **`CLAUDE.md`** — recipe + gotchas + workflow (Claude อ่านอัตโนมัติ)
- **`CONTEXT.md`** — glossary + data model + role mapping
- **`TASKS.md`** — phased tasks (38 tasks)
- **`docs/architecture.md`** — flows + setup checklist + edge cases
- **`audit/`** — checklist per phase สำหรับ AI agent ตรวจ (I-019)

---

## 🚀 ขั้นตอน Setup

### Step 1 — Sheet + Drive
1. เปิด Apps Script editor ใหม่
2. ผ่าน clasp push code ใน `apps-script/` ขึ้นไป
3. รัน `setupAll()` 1 ครั้ง — สร้าง Sheet + Drive + Settings + Rules
4. copy SHEET_ID + DRIVE_FOLDER_ID

### Step 2 — LINE
1. สร้าง LINE OA + Messaging API channel ใน LINE Developers
2. สร้าง LIFF apps 8 ตัว (รายชื่อใน TASKS.md TASK-07)
3. ตั้ง channel เป็น Published

### Step 3 — Properties
1. Apps Script UI → Project Settings → Script Properties → ใส่:
   - LINE_CHANNEL_ACCESS_TOKEN
   - LINE_CHANNEL_SECRET
2. แก้ NON_SECRET_PROPS ใน Setup.gs ใส่ LIFF IDs + SHEET_ID + DRIVE_FOLDER_ID
3. รัน `setupProperties()`

### Step 4 — Deploy
1. Apps Script → Deploy → New deployment → Web app → Anyone → copy URL
2. แก้ `liff/js/config.js` API_URL = URL ที่ได้
3. push GitHub → wait Pages deploy
4. ตั้ง LINE webhook URL = Apps Script URL
5. ตั้ง LIFF endpoint URLs ใน LINE Developers (ทั้ง 8 ตัว) = GitHub Pages URLs

### Step 5 — Rich menu
```bash
export LINE_CHANNEL_ACCESS_TOKEN=xxx
pip install Pillow requests
python3 scripts/setup_rich_menu.py
```

### Step 6 — Bootstrap OWNER คนแรก
- ใน Apps Script editor รัน `bootstrapFirstOwner('Uxxx...')` 1 ครั้ง (ใส่ LINE userId ของพี่ปุ้ย)
- เปิด admin LIFF → เพิ่ม ADMIN/USER ผ่าน UI ได้แล้ว

### Step 7 — Trigger
- รัน `setupTriggers()` 1 ครั้ง

---

## 🎯 LIFF Pages (8 หน้า)

| Page | Role | จุดประสงค์ |
|---|---|---|
| myid.html | ทุกคน | ดู User ID + copy (I-001) |
| register.html | VISITOR | ลงทะเบียน + รอ HR approve |
| request.html | USER | ส่งใบลา + ดูเงื่อนไข+โควตา |
| my-requests.html | USER | ดูประวัติใบลาตัวเอง |
| approve.html | USER (supervisor) / ADMIN / OWNER | อนุมัติใบลา (auto stage-aware) |
| admin.html | ADMIN / OWNER | onboard + supervisor + quota + rules + settings |
| manual.html | ทุกคน | คู่มือ User (I-021) |
| manual-admin.html | ADMIN / OWNER | คู่มือ Admin/Owner (I-021) |

---

## 📋 Manual setup ที่ Claude ทำให้ไม่ได้

- สร้าง LINE OA + Messaging API channel (LINE Developers UI)
- สร้าง LIFF apps 8 ตัว (LINE Developers UI)
- Deploy Apps Script Web App "Anyone" (Apps Script UI — clasp 3.x ไม่รองรับ)
- Enable GitHub Pages ใน repo (Settings → Pages → GitHub Actions)
- วาง `liff/img/logo.jpg`

---

## 🔒 Role hierarchy (I-022)

```
VISITOR → USER (พนักงาน) → ADMIN (HR) → OWNER (เจ้าของ)
            └ is_supervisor=TRUE → หัวหน้างาน (USER ที่อนุมัติ stage 1 ของลูกน้องได้)
```

---

## 🛠️ Tech notes

- Apps Script timeout 6 นาที — งาน batch ใหญ่ต้อง chunk
- LINE Provider เดียวกัน LIFF + Messaging API (I-012)
- LIFF host GitHub Pages (ห้าม HtmlService)
- POST text/plain (CORS workaround I-015)
- รูปแนบ resize 1280px JPEG 85% ก่อน upload
- GPS บังคับเก็บ ห้ามให้ submit ถ้า deny permission
