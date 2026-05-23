# Phase 6 — Deploy + E2E test ✅

## Apps Script Web App deploy
- [ ] Apps Script editor → Deploy → New deployment → type: Web app
- [ ] Execute as: **Me**
- [ ] Who has access: **Anyone**
- [ ] กด Deploy → ได้ URL `https://script.google.com/macros/s/.../exec`
- [ ] copy URL ไปใส่ `liff/js/config.js` `API_URL` + commit + push GitHub
- [ ] copy URL ไปตั้ง LINE webhook URL (LINE Developers → Messaging API channel → Webhook URL)
- [ ] กด Verify ใน LINE ได้ 302 (ปกติ — LINE Verify ไม่ follow redirect แต่ event ปกติทำงาน)

## End-to-end test (มือถือจริง 4 บัญชี LINE)

### Setup ตัวละคร
- **Owner** = พี่ปุ้ย
- **HR** = บัญชี A
- **หัวหน้างาน** = บัญชี B (USER + is_supervisor=TRUE)
- **พนักงาน** = บัญชี C (USER under B)

### Run
- [ ] Owner รัน `bootstrapFirstOwner(<Owner-LINE-userId>)` ใน Apps Script
- [ ] Owner เปิด admin.html → tab "พนักงาน" → invite HR (A) → copy invite text → ส่ง LINE หา A
- [ ] A add OA + ใช้ code ลงทะเบียน → Owner ได้ flex → กด approve → A เป็น HR
- [ ] HR (A) invite B + C ผ่าน admin.html
- [ ] B + C ทำเหมือนกัน → HR approve register
- [ ] HR ตั้ง B `is_supervisor=TRUE`
- [ ] HR pair C → B ใน tab "หัวหน้างาน"
- [ ] C เปิด rich menu "ส่งใบลา" → step ครบ → submit
- [ ] B ได้ flex stage 1 → กด approve
- [ ] HR (A) ได้ flex stage 2 → กด approve
- [ ] Owner ได้ flex stage 3 → กด approve
- [ ] C ได้ flex final approved
- [ ] เช็ค Sheet LeaveRequests: final_status=approved, ทุก stage_at มีเวลา
- [ ] เช็ค LeaveQuota.sick_used += days
- [ ] เช็ค Audit_Log มี entries ครบ

### Edge cases
- [ ] B (หัวหน้างาน) ส่งใบลาเอง → skip stage 1, A (HR) ได้ flex stage 2 ทันที
- [ ] A (HR) ส่งใบลาเอง → skip stage 1+2, Owner ได้ flex stage 3
- [ ] Owner ส่งใบลาเอง → auto approved, ไม่มี flex ขอ approve
- [ ] กด reject ที่ stage ใดๆ → quota รoll back + ทุกคนที่ผ่านมาได้ flex แจ้ง
- [ ] ลาเกินโควตา → block + แสดง quota คงเหลือ
- [ ] GPS deny ที่หน้า request → block + ไม่ส่งได้

### Performance
- [ ] submitLeave latency < 3 วินาที (รวม Drive upload)
- [ ] approveLeave latency < 2 วินาที
- [ ] ไม่มี Apps Script execution > 30 วินาที (Logs check)
