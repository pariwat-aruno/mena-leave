# CONTEXT.md — mena-leave (ระบบลางาน)

> **สำคัญ:** AI / Claude ต้องอ่านไฟล์นี้ก่อนทำงานบน project นี้ทุกครั้ง
> ห้ามใช้ศัพท์ที่ไม่ตรงกับที่จดไว้ในนี้

---

## 1. Project Identity

- **ชื่อ:** `mena-leave`
- **ชื่อไทย:** ระบบลางาน Mena
- **Description:** LIFF mini-app สำหรับพนักงานส่งใบลา + 3-stage approval (หัวหน้างาน → HR → เจ้าของ) บังคับ GPS + แนบไฟล์ optional
- **Type:** Mini app (ไม่ใช่ enterprise)
- **Stack:** Google Sheet + Apps Script + LINE Messaging API + LIFF + GitHub Pages
- **บริษัท:** บริษัท มีนา คอสเมติกส์ จำกัด (Mena Cosmetics Co., Ltd.)
- **เป้าหมาย:**
  1. ลดงาน HR (ไม่ต้องเซ็นใบลากระดาษ)
  2. ลดความรู้สึกไม่ดีของผู้ลา + HR ตอนเผชิญหน้า
  3. employee-friendly + ยังบังคับใช้กฎได้
  4. เสริมภาพลักษณ์องค์กรว่า modern + ใส่ใจพนักงาน

---

## 2. Glossary — ศัพท์ที่ใช้ใน project นี้

| คำที่ใช้ในระบบ | คำเทคนิค (ห้ามใช้) | ความหมาย |
|---|---|---|
| **พนักงาน** | employee / staff / member / user | USER ที่ HR approve register แล้ว |
| **หัวหน้างาน** | manager / leader / boss | USER ที่ `is_supervisor=TRUE` + มีลูกน้องผูกใน Supervisors |
| **ฝ่ายบุคคล** หรือ **HR** | hr / human-resources | ADMIN role — onboard + ผูก supervisor + ตั้ง quota |
| **เจ้าของ** | owner / boss / executive / ceo | OWNER role — config ระบบ + approve ชั้นสุดท้าย |
| **ยังไม่ลงทะเบียน** | guest / anonymous | VISITOR — ยังไม่กรอก register หรือยังไม่ approve |
| **ใบลา** | leave-request / lor / absence | record ใน `LeaveRequests` |
| **โควตา** | quota / balance / entitlement | สิทธิ์วันลาคงเหลือต่อปีต่อคน |
| **เงื่อนไขการลา** | rules / policy | กฎองค์กร (advance notice / doc required) |
| **ลูกน้อง** | subordinate / report / member | USER ที่ผูกใต้ supervisor |
| **อนุมัติ** | approve / accept | กดผ่านชั้นใดชั้นหนึ่ง |
| **ปฏิเสธ** | reject / decline / deny | กดไม่ผ่าน |
| **ส่งใบลา** | submit / create-request | กดส่งจาก request.html |
| **รออนุมัติ** | pending / awaiting | อย่างน้อยชั้น 1 ยังไม่ตัดสิน |
| **อนุมัติแล้ว** | approved | ผ่านครบ 3 ชั้น |
| **ปฏิเสธแล้ว** | rejected | ชั้นใดชั้นหนึ่งปฏิเสธ |

**กฎ:** ใน code, comment, doc, message ทั้งหมดใช้คอลัมน์ซ้าย ห้ามคอลัมน์กลาง (ตัวแปรในโค้ดอังกฤษได้แต่ map ตรง)

---

## 3. Roles & Permissions

| Role | จำนวน | ทำอะไรได้ | ทำไม่ได้ |
|---|---|---|---|
| **VISITOR** | ไม่จำกัด | ดู User ID + copy + ลงทะเบียน | ทุกอย่างอื่น |
| **USER** (พนักงาน) | 25-95 คน | ส่งใบลา · ดูเงื่อนไข+โควตา · ดูประวัติตัวเอง · ดูคู่มือ | อนุมัติ · แก้ config · ดู report ทั้งระบบ |
| **USER** (หัวหน้างาน) | 5-15 คน | + อนุมัติ stage 1 ของลูกน้อง | ขั้ามชั้น · แก้ config |
| **ADMIN** (ฝ่ายบุคคล) | 1-3 คน | + approve register · ผูก supervisor · ตั้งโควตาต่อคน · อนุมัติ stage 2 · ดู report · ปรับ Settings ผ่าน Pending_Changes | อนุมัติ stage 3 (final) · invite OWNER ใหม่ |
| **OWNER** (เจ้าของ) | 1-2 คน | + config โควตา default · config approval flow · config กฎ · อนุมัติ stage 3 · approve Pending_Changes · invite OWNER ใหม่ | — (ทุกอย่าง) |

**กฎเข้าระบบ:**
- ผู้ใช้ระบุตัวตนด้วย LINE User ID (จาก LIFF) — ไม่มี password
- Role เก็บใน Sheet `Users` column `role`
- หัวหน้างาน = USER + `is_supervisor=TRUE` (ไม่ใช่ role แยก)

---

## 4. Data Model

### Sheet: `Users` — ทะเบียนพนักงาน (universal 4-role)

| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `user_id` | string | `EMP-0001` | running ID (PK) |
| `line_user_id` | string | `Uxxx...` | unique จาก LIFF |
| `role` | enum | `USER` / `ADMIN` / `OWNER` | I-022 — uppercase |
| `display_name` | string | "สมชาย ใจดี" | จาก LINE profile หรือ register form |
| `emp_code` | string | "VRD-001" | code พนักงานภายในบริษัท |
| `phone` | string | "0812345678" | กรอกตอน register |
| `email` | string | (optional) | |
| `department` | string | "Marketing" | กรอกตอน register |
| `position` | string | "Senior Marketer" | กรอกตอน register |
| `is_supervisor` | boolean | `TRUE` / `FALSE` | HR ตั้ง — `TRUE` = หัวหน้างาน |
| `status` | enum | `pending` / `active` / `inactive` | register → pending → HR approve → active |
| `invited_by` | string | `EMP-0002` หรือ `(system)` | ใครชวน (สำหรับ owner invite owner) |
| `created_at` | datetime | ISO 8601 +07:00 | register time |
| `approved_at` | datetime | ISO 8601 +07:00 | HR approve time |
| `approved_by` | string | `EMP-0002` | ADMIN ที่ approve |

### Sheet: `Supervisors` — ผูก supervisor ↔ subordinate

| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `pair_id` | string | `SUP-0001` | running |
| `user_id` | string | `EMP-0010` | ลูกน้อง |
| `supervisor_user_id` | string | `EMP-0003` | หัวหน้างาน (ต้อง `is_supervisor=TRUE`) |
| `valid_from` | datetime | ISO 8601 +07:00 | |
| `valid_to` | datetime | nullable | null = active |
| `created_by` | string | `EMP-0001` | ADMIN ที่ผูก |

**กฎ:**
- USER 1 คนมี supervisor 1 คน active (1-to-1)
- เปลี่ยน supervisor → set old `valid_to` = now, insert new row
- หัวหน้างานเอง: ไม่มี row ใน Supervisors → flow ข้าม stage 1 ตรงไป stage 2

### Sheet: `LeaveRequests` — ใบลา (transaction หลัก)

| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `leave_id` | string | `LV-20260520-0001` | running by date |
| `user_id` | string | `EMP-0010` | ผู้ลา |
| `leave_type` | enum | `sick` / `personal` / `vacation` | ลาป่วย / ลากิจ / ลาพักร้อน |
| `date_from` | date | `2026-05-21` | วันเริ่มลา |
| `date_to` | date | `2026-05-22` | วันสิ้นสุด |
| `days` | number | `2` | จำนวนวัน (รวมเสาร์-อาทิตย์? — config ใน Settings) |
| `is_retroactive` | boolean | `TRUE` / `FALSE` | TRUE = ลาย้อนหลัง (date_from < submitted_at) |
| `reason` | string | "ไม่สบาย ปวดหัว" | text 200 chars |
| `gps_lat` | number | `13.7563` | บังคับเก็บตอน submit |
| `gps_lng` | number | `100.5018` | บังคับเก็บตอน submit |
| `gps_accuracy` | number | `15` | meters |
| `attachment_url` | string | Drive URL หรือ "" | optional — รูปใบรับรองแพทย์ ฯลฯ |
| `stage1_required` | boolean | `TRUE` / `FALSE` | FALSE ถ้าผู้ลา = หัวหน้างาน |
| `stage1_status` | enum | `pending` / `approved` / `rejected` / `skipped` | |
| `stage1_by` | string | `EMP-0003` | supervisor ที่ตัดสิน |
| `stage1_at` | datetime | ISO 8601 +07:00 | |
| `stage1_note` | string | (optional) | เหตุผลปฏิเสธ |
| `stage2_status` | enum | `pending` / `approved` / `rejected` | HR (ADMIN) |
| `stage2_by` | string | `EMP-0002` | |
| `stage2_at` | datetime | | |
| `stage2_note` | string | | |
| `stage3_status` | enum | `pending` / `approved` / `rejected` / `skipped` | OWNER — skipped ถ้า approval_levels < 3 |
| `stage3_by` | string | | |
| `stage3_at` | datetime | | |
| `stage3_note` | string | | |
| `final_status` | enum | `pending` / `approved` / `rejected` | derived from stages |
| `submitted_at` | datetime | ISO 8601 +07:00 | |

### Sheet: `LeaveQuota` — โควตาต่อคนต่อปี

| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `quota_id` | string | `Q-2026-EMP-0010` | composite key |
| `user_id` | string | `EMP-0010` | |
| `year` | number | `2026` | |
| `sick_total` | number | `30` | โควตาสิทธิ์ |
| `sick_used` | number | `5` | หักจริง (final_status=approved) |
| `sick_reserved` | number | `2` | กำลังรอ approve (pending) |
| `personal_total` | number | `6` | |
| `personal_used` | number | `1` | |
| `personal_reserved` | number | `0` | |
| `vacation_total` | number | `10` | |
| `vacation_used` | number | `3` | |
| `vacation_reserved` | number | `0` | |
| `updated_at` | datetime | | |

**กฎคำนวณ:**
- คงเหลือที่ลาได้ = total - used - reserved
- ตอน submit → reserved += days
- ตอน final approved → used += days, reserved -= days
- ตอน rejected ใดๆ → reserved -= days

### Sheet: `LeaveRules` — เงื่อนไขการลา (HR/Owner config)

| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `rule_id` | string | `R-0001` | running |
| `leave_type` | enum | `sick` / `personal` / `vacation` / `all` | |
| `advance_notice_days` | number | `3` | ต้องแจ้งล่วงหน้ากี่วัน (sick=0 ฉุกเฉิน) |
| `max_consecutive_days` | number | `5` | ลาติดกันสูงสุดกี่วัน (0=ไม่จำกัด) |
| `doc_required_above_days` | number | `3` | ลาเกินกี่วันต้องแนบเอกสาร |
| `note` | string | "ลาป่วย 3 วันขึ้นไปต้องใบรับรองแพทย์" | แสดงให้ผู้ลาดูในหน้า request |
| `is_active` | boolean | `TRUE` | |
| `updated_at` | datetime | | |
| `updated_by` | string | `EMP-0001` | |

### Sheet: `Pairing_Codes` — pairing code 6 หลัก (universal 4-role)

| Column | Type | หมายเหตุ |
|---|---|---|
| `code_id` | string | `PC-0001` |
| `code` | string | "123456" (6 digits) |
| `for_user_id` | string | `EMP-0010` — code นี้ผูกกับใคร |
| `created_by` | string | `EMP-0002` (HR) |
| `created_at` | datetime | |
| `expires_at` | datetime | created_at + TTL (default 24h) |
| `redeemed_at` | datetime | nullable |
| `redeemed_line_user_id` | string | nullable |
| `status` | enum | `active` / `redeemed` / `expired` / `revoked` |

### Sheet: `Pending_Changes` — ADMIN propose → OWNER approve (universal)

| Column | Type | หมายเหตุ |
|---|---|---|
| `change_id` | string | `CHG-0001` |
| `proposed_by` | string | ADMIN user_id |
| `target_entity` | enum | `Users` / `LeaveQuota` / `LeaveRules` / `Settings` / `Supervisors` |
| `target_id` | string | row id ใน target |
| `change_type` | enum | `create` / `update` / `delete` |
| `payload_json` | string | JSON ของ field ที่จะแก้ |
| `proposed_at` | datetime | |
| `status` | enum | `pending` / `approved` / `rejected` |
| `decided_by` | string | OWNER user_id |
| `decided_at` | datetime | |
| `decision_note` | string | |

### Sheet: `Audit_Log` — ทุก action

| Column | Type | หมายเหตุ |
|---|---|---|
| `audit_id` | string | `AUD-...` |
| `timestamp` | datetime | |
| `actor_user_id` | string | |
| `actor_role` | string | |
| `action` | string | `register` / `approve_leave_s1` / `set_quota` / ... |
| `target_entity` | string | |
| `target_id` | string | |
| `payload` | string | JSON |
| `ip_or_gps` | string | |

### Sheet: `Logs` — error log (มาตรฐาน)
| timestamp | level | function | message | payload |

### Sheet: `Settings` — ค่าตั้งระบบ

| key | value (ตัวอย่าง) | note |
|---|---|---|
| `brand_name` | "MENA COSMETICS" | I-017 |
| `brand_logo_url` | Drive URL | I-017 |
| `brand_color_primary` | "#d51f7d" | I-017 |
| `brand_color_tint` | "#fce4ef" | I-017 |
| `approval_levels` | `3` | จำนวน stage (default 3) |
| `approval_stage1_role` | `supervisor` | who approves stage 1 |
| `approval_stage2_role` | `ADMIN` | |
| `approval_stage3_role` | `OWNER` | |
| `default_sick_total` | `30` | สำหรับ HR ที่ตั้ง quota รายคน |
| `default_personal_total` | `6` | |
| `default_vacation_total` | `10` | |
| `count_weekends_as_leave` | `FALSE` | true=นับ ส-อา / false=ข้าม |
| `pairing_code_ttl_hours` | `24` | universal |
| `quota_reset_month` | `1` | ม.ค. = 1 |
| `quota_reset_day` | `1` | |
| `gps_required` | `TRUE` | บังคับ GPS ตอน submit |
| `attachment_required_above_days` | `3` | (override per leave_type ผ่าน LeaveRules) |
| `support_line_id` | "@966nnfkr" | สำหรับ manual.html contact |
| `support_phone` | "" | |

---

## 5. Conventions

1. **ภาษา:** Comment ไทย, ตัวแปร/function อังกฤษ
2. **Error handling:** ทุก function Apps Script try-catch + log Sheet `Logs`
3. **Idempotent:** setup functions รันซ้ำได้ปลอดภัย
4. **Timeout:** Apps Script ต้องจบใน 6 นาที (I-010)
5. **Secrets:** Script Properties (LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, SHEET_ID, DRIVE_FOLDER_ID, LIFF_IDs) — ห้ามใส่ใน code (I-011)
6. **Time zone:** Asia/Bangkok ISO 8601 +07:00
7. **ID format:** `<PREFIX>-XXXX` running
8. **Image storage:** Drive folder + URL ใน Sheet (ห้าม base64 ในเซลล์)
9. **Role naming (I-022):** OWNER / ADMIN / USER / VISITOR — uppercase ใน code

---

## 6. ห้ามทำ (Out of Scope)

- ❌ Authentication เกินกว่า LINE Login
- ❌ Real-time websocket
- ❌ Mobile native app
- ❌ Custom domain / SSL ของตัวเอง
- ❌ เปลี่ยน stack เป็น Firebase / Supabase / AWS
- ❌ OCR ใบรับรองแพทย์อัตโนมัติ
- ❌ Integration ระบบ HR/payroll ภายนอก
- ❌ คำนวณเงินเดือนหักวันลา
- ❌ Export PDF ใบลา
- ❌ Multi-company / multi-tenant

ถ้าขอเหล่านี้ → "ออก scope mini app — Phase 2"

---

## 7. Brand & UI (I-013 + I-017)

- Logo: `liff/img/logo.jpg`
- ชื่อ: บริษัท มีนา คอสเมติกส์ จำกัด (MENA COSMETICS)
- Palette: cherry tint emphasis (`#d51f7d` primary / `#fce4ef` tint dominant)
  - **mena-leave ใช้ tint dominant** (พื้นหลังอ่อน) ไม่ใช่ dark dominant — employee friendly
- Style: minimal professional — **ห้าม emoji** (ยกเว้น `⚠️` warning + `✅` success status)
- ทุก LIFF page: logo + brand text + footer brand
- ทุก flex card: header มี logo + brand
- Cherry-dark (`#a01560`) ใช้เฉพาะปุ่ม reject + critical warning เท่านั้น

---

## 8. Approval Flow Diagram (text)

```
USER submit (LIFF request.html)
  ↓ POST /submitLeave
  ↓ validate: quota, rules, GPS
  ↓ INSERT LeaveRequests row (stage1_status=pending)
  ↓
  ├─ ผู้ลาเป็น USER ปกติ
  │     ↓
  │     Stage 1: lookup supervisor จาก Supervisors
  │             push Flex card "ขออนุมัติชั้น 1" → supervisor
  │             supervisor กดปุ่ม approve/reject ใน flex
  │             ├─ approve → set stage1_status=approved, stage1_by, stage1_at
  │             │           → trigger Stage 2
  │             └─ reject → final_status=rejected
  │                       → push notify ผู้ลา + cancel reserve quota
  │
  ├─ ผู้ลาเป็นหัวหน้างาน (is_supervisor=TRUE)
  │     ↓
  │     stage1_required=FALSE, stage1_status=skipped
  │     → ตรงไป Stage 2
  │
  ├─ ผู้ลาเป็น ADMIN
  │     ↓
  │     stage1=skipped, stage2=skipped
  │     → ตรงไป Stage 3
  │
  └─ ผู้ลาเป็น OWNER
        ↓
        auto-approve final_status=approved (log audit)

Stage 2 (HR):
  push Flex card → ADMIN ทุกคน
  ADMIN คนใดคนหนึ่งกด approve → ล็อค (1st ADMIN wins)
  approve → stage2_status=approved → trigger Stage 3
  reject → final_status=rejected → notify ผู้ลา + supervisor

Stage 3 (Owner):
  push Flex card → OWNER ทุกคน
  OWNER คนใดคนหนึ่งกด approve → ล็อค (1st OWNER wins)
  approve → stage3_status=approved → final_status=approved
           → deduct quota (used += days, reserved -= days)
           → push final notification card → ผู้ลา + supervisor + HR
  reject → final_status=rejected → notify ทุกคนที่เกี่ยวข้อง
```
