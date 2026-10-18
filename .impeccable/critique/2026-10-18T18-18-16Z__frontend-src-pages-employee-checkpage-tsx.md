---
target: หน้า Check ของพนักงาน (หลังแก้)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\CheckPage.tsx"
target_fingerprint: "sha256:6aeaebdbe3816f78012b80bc6faee37136715131dc0bab90a1595749ebf0b939"
target_path: "C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\CheckPage.tsx"
timestamp: 2026-10-18T18-18-16Z
slug: frontend-src-pages-employee-checkpage-tsx
---
⚠️ DEGRADED: single-context (ตรวจซ้ำหลังแก้ ในบริบทเดียวกับที่แก้)

# Re-check หลังแก้ 6 ขั้น: Check และ Manage

| # | Heuristic | Check | Manage | หมายเหตุ |
|---|---|---|---|---|
| 1 | Visibility of System Status | 3 | 3 | LoadError แยกจาก empty state, skeleton, สวิตช์บอก "กำลังบันทึก..." เฉพาะตัว |
| 2 | Match System / Real World | 3 | 3 | "รับเงิน ฿50", "ขอเช็คบิล", "ปิดขาย" |
| 3 | User Control and Freedom | 3 | 3 | ย้อนกลับ/Esc/ยกเลิกบิลครบ |
| 4 | Consistency and Standards | 3 | 3 | ปุ่ม/ช่องกรอกจาก styles.ts ชุดเดียว |
| 5 | Error Prevention | 3 | 3 | ลบย้ายเข้าในกล่องแก้ไข |
| 6 | Recognition Rather Than Recall | 3 | 3 | ปุ่มเดียวต่อโต๊ะ ชิดล่าง |
| 7 | Flexibility and Efficiency | 2 | 2 | ค้นหาโต๊ะ (>4 โต๊ะ), เรียงตามความเร่ง, ตัวกรองเฉพาะที่ปิดขาย; ยังไม่มีคีย์ลัด/bulk |
| 8 | Aesthetic and Minimalist Design | 3 | 3 | ลิ้นชักเป็นสมุดยอดแบบใบสรุป ไม่มีเงา |
| 9 | Error Recovery | 3 | 3 | ปุ่มลองใหม่, รูปเสียแสดงตัวอักษรสำรอง |
| 10 | Help and Documentation | 2 | 2 | คำอธิบายย้ายจาก title มาเป็นข้อความบนจอบางส่วน |
| **Total** | | **28/40** | **28/40** | **Good** |

Detector ในหน้าเว็บ (แท็บเล็ต 768×1024): Check 10 → 0, Manage 9 → 0 low-contrast

ยังเหลือ: คีย์ลัด/ปิดเมนูหลายรายการพร้อมกัน, ชื่อร้านถูกตัดบนจอ 375px, MenuOptionsEditor ยังใช้ปุ่มขนาดเล็ก
