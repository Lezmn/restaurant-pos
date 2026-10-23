---
target: หน้า Check (dual-agent)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\CheckPage.tsx"
target_fingerprint: "sha256:3e6bedd2ac1ee4fe78d25909804bb0293d9e959f4d0db11dddc0e59d15a4d737"
target_path: "C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\CheckPage.tsx"
timestamp: 2026-10-18T18-50-57Z
slug: frontend-src-pages-employee-checkpage-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

# Critique รอบ 3: Check และ Manage (หลังเพิ่ม toast/เลิกทำ, เงินด่วน, "/", เลือกหลายเมนู, help, validation)

| # | Heuristic | Check | Manage |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | 3 |
| 2 | Match System / Real World | 3 | 3 |
| 3 | User Control and Freedom | 3 | 3 |
| 4 | Consistency and Standards | 2 | 2 |
| 5 | Error Prevention | 2 | 2 |
| 6 | Recognition Rather Than Recall | 3 | 3 |
| 7 | Flexibility and Efficiency | 3 | 3 |
| 8 | Aesthetic and Minimalist Design | 3 | 2 |
| 9 | Error Recovery | 3 | 2 |
| 10 | Help and Documentation | 3 | 3 |
| **Total** | | **28/40** | **26/40** |

Detector (B): CLI 0 findings (regex เท่านั้น), ในหน้าเว็บ 0 findings ทั้ง Check / Manage เมนู / Manage วัตถุดิบ ที่ 1024×768 และ 768×1024
นอกขอบเขต: ชื่อร้านใน header 4.4:1 ที่จอ <640px (EmployeeLayout.tsx:111) — ของจริง ไม่ใช่ false positive
detector ไม่ได้เปิด dialog จึงไม่เห็นปุ่มพิมพ์ใบเสร็จ 2.3:1 ที่ A เจอ (ReceiptDialog.tsx:139)

## Priority Issues
- [P1] Check: ส่วนลดตรวจสอบไม่ได้ — "ราคาที่เก็บจริง" ลดถึง ฿0 ได้ทุก role ไม่บังคับเหตุผล ช่องอยู่ก่อน "รับเงินมา" (CheckPage.tsx:623-648) → /impeccable harden
- [P1] Manage: กล่องแก้ไขเมนูมีสองโมเดลการบันทึก (ตัวเลือกบันทึกทันที แต่มีปุ่มยกเลิก/บันทึก) กล่องแคบ 448px บนแท็บเล็ต แถวเพิ่มตัวเลือกที่พิมพ์ค้างหายเงียบ → /impeccable distill + layout
- [P2] Check: ตอนจบรับเงิน — ปุ่มพิมพ์ใบเสร็จ 2.3:1 เขียนเอง, toast จมใต้ modal, เงินทอนหายจากจอ → /impeccable polish
- [P2] Check: หยิบเงินออก/ปิดยอด/ยกเลิกบิล/ยืนยันสลิป ไม่มีข้อความแจ้งผล → /impeccable harden
- [P2] Manage: แท็บวัตถุดิบขัด DESIGN.md — ปุ่มลบบนการ์ด, ไม่มี LoadError (โหลดไม่ขึ้นขึ้น "ยังไม่มีวัตถุดิบ"), ไม่เรียงของหมดก่อน → /impeccable harden
- [P2] Manage: รูป 4:3 กินการ์ด เห็นสวิตช์แค่แถวเดียวที่ 1024×768 → /impeccable layout
- [P2] Manage: หมวดหมู่ default เงียบ ๆ เป็นหมวดแรก (MenuFormDialog.tsx:132) → /impeccable harden
- [P2] Manage: แถบเครื่องมือ ~11 control, bulk bar ไม่มีปุ่มออก/ปุ่มที่ไม่มีผลไม่ disable → /impeccable distill
- [P2] ทั้งคู่: nav อังกฤษ + role ดิบ "(Admin · ADMIN)", Logout น้ำหนักเท่าแท็บอื่น → /impeccable clarify

## Minor
- ConfirmDialog / ReceiptDialog ยังเขียนปุ่มเอง ไม่ผ่าน button()
- ปุ่ม "แก้ไข" / "ใบเสร็จ" / "ยกเลิกบิล" ชื่อซ้ำกันทุกแถว (screen reader)
- toast ไม่หยุดนับตอน hover/focus, อยู่บนจอห่างมือครัว
- quickCash ไม่มีขั้น ฿50/฿20
- emoji ⏳ ✓ 🍴 แทนไอคอน
- IngredientsPanel busy/undo ติดตามได้ทีละตัว
