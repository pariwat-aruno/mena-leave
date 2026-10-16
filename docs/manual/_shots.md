# รายการภาพในคู่มือ (สัญญากลาง — ห้ามตั้งชื่อไฟล์นอกรายการนี้)

## ชุดเดิม — เล่มผูกบัญชี (`claim-manual`)

ถ่ายจาก `liff/` ที่รันบนเครื่อง (`python3 -m http.server`) + `js/_mock.js` สตับข้อมูลสมมติ
**ไม่ได้ถ่ายจาก prod และไม่มีข้อมูลพนักงานจริงในรูปใด ๆ** — ชื่อที่เห็นคือ "สมชาย ใจดี" รหัส 5502 เป็นตัวอย่าง
viewport 500x1500 · deviceScaleFactor 2 · ตัดพื้นที่ว่างท้ายรูปอัตโนมัติ · jpeg q82

| ไฟล์ | หน้า | สภาพที่ถ่าย |
|---|---|---|
| `00-poster.png` | โปสเตอร์ QR | รูปที่ฝ่ายบุคคลส่งเข้าไลน์กลุ่ม (ไม่ใช่หน้าจอในระบบ) |
| `01-claim-form.jpg` | `claim.html` | ฟอร์มผูกบัญชี ยังไม่กรอกอะไร |
| `02-claim-filled.jpg` | `claim.html` | กรอกรหัสพนักงาน + ชื่อ-นามสกุลแล้ว ก่อนกดปุ่ม |
| `03-claim-done.jpg` | `claim.html` | ผูกสำเร็จ แสดงชื่อ/รหัส/แผนก + ปุ่มไปส่งใบลา |
| `04-claim-error.jpg` | `claim.html` | กรอกชื่อไม่ตรงทะเบียน ขึ้นข้อความว่าข้อมูลไม่ตรง |
| `05-claim-code.jpg` | `claim.html` | เปิดหัวข้อทางสำรอง กรอกรหัสจับคู่ 6 หลัก |
| `06-request-gate.jpg` | `request.html` | กดเมนู "ส่งใบลา" ทั้งที่ยังไม่ผูกบัญชี |

## ชุดใหม่ 16 ต.ค. 2569 — เล่มพนักงาน / ผู้อนุมัติ / ฝ่ายบุคคล

วิธีถ่าย: `liff/` รันบนเครื่อง (เซิร์ฟเวอร์ไฟล์ในเครื่อง) + **โค้ด Apps Script จริงทุกไฟล์** โหลดลง Node (vm) คู่กับชีตจำลอง
ในหน่วยความจำ — หน้าจอเรียก API แล้วได้คำตอบจากฟังก์ชันจริง (submitLeave / approveLeave / getPendingForMe ฯลฯ) ไม่ได้แต่งข้อมูลหน้าจอเอง
LIFF SDK สตับให้เปิดนอก LINE ได้ · ไม่ยิง API_URL จริง ไม่แตะ prod · ชื่อทุกคนเป็นชื่อสมมติ ("สมชาย ใจดี" รหัส 5502 ฯลฯ)
ภาพ "การ์ดไลน์" = การ์ดที่ฟังก์ชันจริงใน FlexCard.gs สร้างออกมา แล้ววาดเป็นภาพด้วยตัววาดจำลอง (หน้าตาในแอป LINE จริงอาจต่างเล็กน้อย)
สคริปต์ถ่ายอยู่นอกเรพ (scratchpad) ไม่ commit · viewport กว้าง 500 · deviceScaleFactor 2 · jpeg q82

| ไฟล์ | หน้า | สภาพที่ถ่าย |
|---|---|---|
| `emp-01-richmenu.jpg` | เมนูด้านล่างแชท | ภาพเมนูจริง (`scripts/richmenu-source.png`) ย่อขนาด |
| `emp-02-request-step1.jpg` | `request.html` | ขั้น 1 โควตาคงเหลือ + เงื่อนไขการลา |
| `emp-03-request-fullday.jpg` | `request.html` | ขั้น 2 ลากิจทั้งวัน 2 วัน กรอกครบ |
| `emp-04-request-hourly.jpg` | `request.html` | ขั้น 2 กด "เป็นชั่วโมง" เลือกช่วงเวลา 13:00-15:00 |
| `emp-05-request-emergency.jpg` | `request.html` | ขั้น 2 ลากิจพรุ่งนี้ (ไม่ทันกำหนด) กล่องกรณีฉุกเฉินติ๊ก + เหตุผล |
| `emp-06-request-sick.jpg` | `request.html` | ขั้น 2 ลาป่วยวันนี้ 3 วัน ป้ายลาป่วยกะทันหัน + แนบใบแพทย์ทีหลังได้ |
| `emp-07-request-summary.jpg` | `request.html` | ขั้น 3 GPS พร้อมส่ง + สรุปก่อนส่ง |
| `emp-08-request-gps-fallback.jpg` | `request.html` | ขั้น 3 อ่าน GPS ไม่ได้ + ช่องเหตุผล |
| `emp-09-request-done.jpg` | `request.html` | ส่งใบลาสำเร็จ |
| `emp-10-card-submitted.jpg` | การ์ดไลน์ | "ส่งใบลาสำเร็จ" ที่ผู้ลาได้รับ |
| `emp-11-my-list.jpg` | `my-requests.html` | รายการใบลาหลายสถานะ |
| `emp-12-detail-pending.jpg` | `my-requests.html` | รายละเอียดใบรออนุมัติ + กล่องถอนใบลา + ลำดับการอนุมัติ |
| `emp-13-detail-approved.jpg` | `my-requests.html` | ใบอนุมัติแล้ว + กล่องขอยกเลิกวันลา |
| `emp-14-detail-docpending.jpg` | `my-requests.html` | ลาป่วยรอแนบใบรับรองแพทย์ + กล่องแนบเอกสารเพิ่ม |
| `emp-15-card-docrequest.jpg` | การ์ดไลน์ | ผู้อนุมัติขอเอกสารเพิ่ม (ที่ผู้ลาได้รับ) |
| `emp-16-detail-docrequest.jpg` | `my-requests.html` | ใบที่ถูกขอเอกสาร (กล่องแดง) + เลือกรูปแล้ว |
| `emp-17-card-approved.jpg` | การ์ดไลน์ | อนุมัติครบทุกชั้นแล้ว |
| `emp-18-myid.jpg` | `myid.html` | บัญชีของคุณ (สถานะใช้งานอยู่) |
| `emp-19-proxy.jpg` | `request.html` | พนักงานพิเศษ: ช่อง "ส่งใบลาให้" |
| `appr-01-card-request.jpg` | การ์ดไลน์ | ขออนุมัติชั้น 1 (หัวหน้างาน) |
| `appr-02-list.jpg` | `approve.html` | รายการรออนุมัติของหัวหน้างาน (2 ใบแรก) |
| `appr-02b-nogps.jpg` | `approve.html` | ใบฉุกเฉินที่ไม่มีพิกัดยืนยัน (เฉพาะการ์ดใบนั้น) |
| `appr-03-decision.jpg` | `approve.html` | กล่องตัดสินใจ (อนุมัติ / ไม่อนุมัติ / ขอเอกสารเพิ่ม) |
| `appr-04-request-doc.jpg` | `approve.html` | พิมพ์หมายเหตุขอเอกสาร ก่อนกด "ขอเอกสารเพิ่มจากผู้ลา" |
| `appr-05-doc-status.jpg` | `approve.html` | ใบที่รอผู้ลาแนบเอกสาร / ผู้ลาแนบแล้ว |
| `appr-06-owner-first.jpg` | `approve.html` | ผู้บริหารเห็นใบ "ชั้น 1 (ผู้บริหาร · อนุมัติในนามหัวหน้างาน)" |
| `appr-07-card-owner-first.jpg` | การ์ดไลน์ | ขออนุมัติชั้น 1 แบบผู้บริหารในนามหัวหน้างาน |
| `appr-08-card-reminder.jpg` | การ์ดไลน์ | การ์ดเตือนซ้ำเมื่อผู้อนุมัติเงียบ |
| `appr-09-hr-fallback.jpg` | `approve.html` | HR เห็นใบชั้น 3 "HR แทนผู้บริหาร" หลังผู้บริหารโดนเตือน |
| `appr-10-already-decided.jpg` | `approve.html` | เปิดจากการ์ดแต่ใบตัดสินไปแล้ว |
| `appr-11-cancel.jpg` | `approve.html` | ใบขอยกเลิกวันลาในรายการ |
| `appr-12-my-line.jpg` | `approval-chain.html` | ผู้บริหารดู "สายงานของฉัน" (ส่วนบนของหน้า) |
| `hr-01-admin.jpg` | `admin.html` | หน้าจัดการระบบ + สรุประบบ + แท็บพนักงาน |
| `hr-02-line-quota-warn.jpg` | `admin.html` | แถบเหลือง ข้อความไลน์ใกล้หมด (เฉพาะกล่องสรุป) |
| `hr-03-line-quota-out.jpg` | `admin.html` | แถบแดง ไลน์ส่งข้อความไม่ออกแล้ว (เฉพาะกล่องสรุป) |
| `hr-04-user-edit.jpg` | `admin.html` | กล่องแก้ไขพนักงาน (ระดับ + พ้นสภาพ) |
| `hr-05-register-approve.jpg` | `admin.html` | คนที่ใช้รหัสจับคู่แล้ว รอ HR กดอนุมัติ |
| `hr-06-employees.jpg` | `employees.html` | ฐานข้อมูลพนักงาน |
| `hr-07-issue-code.jpg` | `employees.html` | ออกรหัสจับคู่ 6 หลัก + ข้อความเชิญ |
| `hr-08-new-form.jpg` | `employee-new.html` | ฟอร์มสร้างพนักงานใหม่ กรอกแล้ว |
| `hr-09-new-preview.jpg` | `employee-new.html` | ตรวจสอบก่อนสร้าง |
| `hr-10-new-done.jpg` | `employee-new.html` | สร้างเรียบร้อย + รหัสจับคู่สำรอง |
| `hr-11-chain.jpg` | `approval-chain.html` | ตั้งสายอนุมัติให้พนักงาน 1 คน |
| `hr-12-rules.jpg` | `admin.html` | แท็บกฎ |
| `hr-13-rule-edit.jpg` | `admin.html` | กล่องแก้ไขกฎ |
| `hr-14-quota-edit.jpg` | `admin.html` | กล่องตั้งโควตา (HR = รอผู้บริหารอนุมัติ) |
| `hr-15-settings.jpg` | `admin.html` | แท็บ Settings |
| `hr-16-owner-pending.jpg` | `admin.html` | ผู้บริหาร: แท็บรออนุมัติ (ข้อเสนอจาก HR) |
| `hr-17-report.jpg` | `report.html` | รายงานสถิติการลา ตัวเลือกช่วงเวลา/ขอบเขต |
| `hr-18-report-result.jpg` | `report.html` | ผลสรุปรายบุคคล |
