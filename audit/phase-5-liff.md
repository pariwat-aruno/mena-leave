# Phase 5 — LIFF frontend ✅

## File structure
- [ ] `liff/css/style.css` มีอยู่
- [ ] `liff/js/` มี 6 ไฟล์: config.js / api.js / auth.js / role.js / utils.js / manual.js
- [ ] `liff/` มี 8 html: myid / register / request / my-requests / approve / admin / manual / manual-admin
- [ ] `liff/img/logo.svg` (placeholder) มี + วาง logo.jpg จริงเมื่อพร้อม

## Config
- [ ] `liff/js/config.js` `API_URL` ไม่ใช่ `REPLACE_*` (ใส่ Apps Script Web App URL จริง)
- [ ] `LIFF_IDS` ทั้ง 8 ไม่ใช่ `REPLACE_*`
- [ ] `DEV_MOCK_LIFF: false` (เปิด true เฉพาะ dev local)

## Each page in LINE
- [ ] เปิดผ่าน LINE App → LIFF SDK load ได้
- [ ] `liff.getProfile()` คืน userId ถูก → state.lineUserId
- [ ] POST API → text/plain content-type (I-015) → response JSON ok=true
- [ ] header + footer brand แสดงครบ

## myid.html
- [ ] แสดง LINE userId ของผู้ใช้
- [ ] กดปุ่ม copy → toast "คัดลอกแล้ว"
- [ ] แสดง status card ถูกตาม role
- [ ] ลิงก์ → register/request ใช้ได้

## register.html
- [ ] form fields ครบ
- [ ] submit → ตอบ "รอ HR อนุมัติ"
- [ ] re-open (status=pending) → state-pending แทน form
- [ ] re-open (status=active) → redirect/notice

## request.html (สำคัญที่สุด)
- [ ] Step 1: quota grid แสดง 3 type + เงื่อนไขครบ
- [ ] Step 2: เลือก leave_type → ข้อมูล quota update
- [ ] Step 2: เลือก date → days hint update
- [ ] Step 2: แนบรูป → preview แสดง
- [ ] Step 2: GPS deny → stage 3 block + ปุ่ม retry
- [ ] Step 3: GPS ok → ปุ่มส่งทำงาน → success
- [ ] submit เกินโควตา → block client + server
- [ ] ลาย้อนหลัง non-sick → block client

## my-requests.html
- [ ] list ใบลาตัวเอง
- [ ] กด row → overlay detail + timeline ลำดับอนุมัติ
- [ ] attachment ปุ่ม "ดูไฟล์แนบ" เปิด Drive ได้

## approve.html
- [ ] role auto-detect ถูก (supervisor / HR / Owner)
- [ ] list pending ที่ตัวเองต้องตัดสินใจเท่านั้น
- [ ] กด approve → push notification ถึง stage ถัดไป
- [ ] กด reject + note → all stage ก่อนหน้าได้แจ้ง

## admin.html
- [ ] non-admin → "ไม่มีสิทธิ์เข้าถึง"
- [ ] tab "พนักงาน" → list + invite + manage
- [ ] tab "หัวหน้างาน" → pair UI ใช้ได้
- [ ] tab "โควตา" → set quota ผ่าน (admin = proposed, owner = applied)
- [ ] tab "กฎ" → upsert rule
- [ ] tab "Settings" → กรอกค่าใหม่ → save
- [ ] tab "รออนุมัติ" (เฉพาะ OWNER) → approve/reject pending change
- [ ] tab "รายงาน" → filter + list

## manual.html / manual-admin.html
- [ ] accordion เปิด-ปิดได้
- [ ] manual-admin: USER เปิด → redirect ไป manual.html
- [ ] contact info แสดงตาม Settings

## GitHub Pages
- [ ] repo public หรือ paid Pages plan
- [ ] commit `liff/` + push → workflow `pages.yml` ทำงาน
- [ ] URL `https://<user>.github.io/<repo>/<page>.html` เปิดได้
- [ ] LIFF endpoint URL = pages URL ของแต่ละหน้า
