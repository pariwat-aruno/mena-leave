# Phase 4 — Apps Script endpoints ✅

## Direct test (Apps Script editor) — bypass HTTP

### Register
- [ ] `submitRegister({ lineUserId: 'Utest1', displayName: 'Test User', emp_code: 'T-001', phone: '0812345678', department: 'Test', position: 'Tester' })`
  - return `{ ok: true, status: 'pending', userId: 'EMP-XXXX' }`
  - Sheet `Users` มี row status=pending
  - OWNER ได้ flex card ใน LINE
- [ ] `approveRegister({ lineUserId: '<owner-line-id>', user_id: 'EMP-XXXX' })`
  - return `{ ok: true }`
  - status เปลี่ยน active + มี LeaveQuota row
  - user ได้ flex confirm card

### Supervisor
- [ ] เชิญ + activate USER อีก 2 คน (A, B)
- [ ] `setSupervisorFlag({ lineUserId: '<owner>', user_id: 'EMP-A', is_supervisor: true })`
- [ ] `pairSupervisor({ lineUserId: '<owner>', user_id: 'EMP-B', supervisor_user_id: 'EMP-A' })`
- [ ] `getSupervisorFor('EMP-B')` → 'EMP-A'
- [ ] B ได้ flex notify "มีหัวหน้างานใหม่"

### Leave
- [ ] `submitLeave({ lineUserId: 'U<B>', leave_type: 'sick', date_from: '2026-05-21', date_to: '2026-05-22', reason: 'ทดสอบ', gps_lat: 13.7, gps_lng: 100.5, gps_accuracy: 10 })`
  - return `{ ok: true, leave_id: 'LV-...' }`
  - Sheet `LeaveRequests` มี row + stage1_status=pending
  - LeaveQuota.sick_reserved += 2
  - A (supervisor) ได้ flex approval card stage 1
- [ ] `getMyHistory({ lineUserId: 'U<B>' })` → return 1 row

### Approval
- [ ] `approveLeave({ lineUserId: 'U<A>', leave_id: 'LV-...', stage: 1, decision: 'approve' })`
  - return ok + moved_to_stage: 2
  - B ได้ update card "หัวหน้างานอนุมัติแล้ว"
  - ADMIN/OWNER ได้ flex stage 2
- [ ] `approveLeave({ lineUserId: '<owner>', leave_id: 'LV-...', stage: 2, decision: 'approve' })`
  - moved_to_stage: 3
- [ ] `approveLeave({ lineUserId: '<owner>', leave_id: 'LV-...', stage: 3, decision: 'approve' })`
  - final_status = approved
  - LeaveQuota.sick_used += 2, sick_reserved -= 2

### Quota
- [ ] `getMyQuota({ lineUserId: 'U<B>' })` → return shape ครบ 3 type
- [ ] `setQuota({ lineUserId: '<owner>', user_id: 'EMP-B', year: 2026, sick_total: 45, personal_total: 8, vacation_total: 12 })`
  - mode = applied (OWNER)
  - B ได้ quota set card

### Quota validation
- [ ] submitLeave เกินโควตา → return error `quota_exceeded`
- [ ] submitLeave ลาย้อนหลัง + non-sick → return `retroactive_only_sick`
- [ ] submitLeave reject GPS → return `gps_required`

### Rules
- [ ] `getRules()` → return 3 default rules
- [ ] `upsertRule({ lineUserId: '<owner>', rule_id: 'R-0001', advance_notice_days: 1 })` → mode=applied
- [ ] `upsertRule({ lineUserId: '<admin>', ... })` → mode=proposed → row ใน Pending_Changes

### Admin
- [ ] `getAdminDashboard({ lineUserId: '<owner>' })` → summary มีตัวเลขครบ
- [ ] `inviteUser({ lineUserId: '<owner>', display_name: 'New One', emp_code: 'N-001' })` → ได้ pairing_code 6 หลัก + invite_text
- [ ] `inviteOwner({ lineUserId: '<owner>', display_name: 'Owner2' })` → I-016 ใหม่ทันที (active=invited จนกว่า redeem)

### Pending Changes
- [ ] `listPendingChanges({ lineUserId: '<owner>' })` → return pending
- [ ] `approvePendingChange({ lineUserId: '<owner>', change_id: 'CHG-XXXX' })` → status=approved + apply ตรง

## Permission check (security audit)
- [ ] เรียก `approveLeave` ด้วย lineUserId ที่ไม่ใช่ supervisor → return forbidden
- [ ] เรียก `setQuota` ด้วย USER → return forbidden
- [ ] เรียก `inviteOwner` ด้วย ADMIN → return forbidden

## Race condition
- [ ] 2 ADMINs กด approve stage 2 พร้อมกัน (simulate ด้วย 2 tabs):
  - คนแรก → ok
  - คนที่สอง → error `race_lost` หรือ `stage2_not_pending`
