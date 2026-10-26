---
target: ฝั่งลูกค้า
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\customer"
timestamp: 2026-10-22T15-17-36Z
slug: frontend-src-pages-customer
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

# Critique: ฝั่งลูกค้า (/t/:token) — มือถือของลูกค้า

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | stepper ตามแค่ออเดอร์ล่าสุด, ETA "10-15 นาที" ฝังตายตัว, ส่งครัวแล้วไม่มีข้อความยืนยัน |
| 2 | Match System / Real World | 3 | ภาษาไทยดี แต่ "ไม่พบ QR session นี้" ดิบจาก backend |
| 3 | User Control and Freedom | 2 | "ยกเลิกทั้งหมด" ไม่มี undo, กดวิธีจ่ายแล้วเปลี่ยนไม่ได้ |
| 4 | Consistency and Standards | 2 | ชื่อแท็บ ≠ หัวหน้า, "รายการ" นับคนละอย่าง 3 หน้า, radio custom แต่ checkbox native |
| 5 | Error Prevention | 2 | ไม่มีขั้นทวนก่อนส่งครัว/ขอเช็คบิล, เปิดลิงก์โต๊ะผิดแล้วตะกร้าหาย |
| 6 | Recognition Rather Than Recall | 3 | หมวดที่เลือกและตำแหน่งเลื่อนหายหลังเพิ่มของ |
| 7 | Flexibility and Efficiency | 1 | "+" บนการ์ดเป็นของตกแต่ง, เพิ่มทุกจานถูกพาไปตะกร้า, ไม่มี quick-add |
| 8 | Aesthetic and Minimalist Design | 2 | แบนเนอร์กิน ¼ จอแรกและข้อความผิด, แถบส้มสองแถบซ้อน, เงาทุกการ์ด |
| 9 | Error Recovery | 2 | เมนูโหลดไม่ขึ้นขึ้น "ไม่พบเมนูที่ค้นหา", ข้อความ backend ดิบ ไม่มีลองใหม่ |
| 10 | Help and Documentation | 2 | "เรียกพนักงาน" ซ่อนอยู่แท็บสถานะ |
| **Total** | | **21/40** | **Acceptable (ปลายล่าง)** |

Detector (B): CLI 0 (regex only). ในหน้าเว็บ: เมนู 13 (375) / 12 (768), รายละเอียดเมนู 4, ตะกร้าว่าง 4, ตะกร้ามีของ 15 (375) / 14 (768), บิลว่าง 5, สถานะ 10, โต๊ะผิด 0
กฎ: low-contrast (ทุกหน้า) + undersized-ui-text (badge 10px, CustomerLayout.tsx:191)
ต้นเหตุร่วม: ตัวขาวบน brand-300 2.3:1, ตัวขาวบน brand-200 1.9–2.0:1, text-price บนการ์ด brand-200 2.8:1, nav ล่าง 3.0/4.4, badge แดง 4.4

## Priority Issues
- [P1] ตัวเลขเงินและปุ่มหลัก contrast ต่ำ (ราคาการ์ด 2.8, ปุ่มเพิ่มรายการ/แถบตะกร้า/ชิป 2.3, ส่งเข้าครัว 2.7, ยอดรวม 2.0, รวมสุทธิ 2.36) → /impeccable colorize แล้ว audit
- [P1] สั่งหลายจานช้า: เพิ่มแล้วถูกพาไปตะกร้า (MenuItemPage.tsx:65), "+" บนการ์ด aria-hidden ไม่ใช่ปุ่ม (MenuPage.tsx:105-111), หมวดรีเซ็ต, ปุ่มส่งครัวหลุดจอในตะกร้ายาว → /impeccable layout
- [P1] การกระทำย้อนไม่ได้ไม่มีขั้นยืนยัน: แตะวิธีจ่าย = POST checkout ทันที (BillPage.tsx:101-121), ส่งครัวไม่มีหน้าทวน, ยกเลิกทั้งหมดไม่มี undo → /impeccable harden
- [P1] แบนเนอร์ฝัง "ร้านอาหาร ตามสั่ง" (MenuPage.tsx:58-65) ขัดกับชื่อร้านและกฎ RESTAURANT_NAME, emoji แทนไอคอน → /impeccable bolder + clarify
- [P2] สถานะหลังส่งครัวไม่ครบ (ตามแค่ orders[0]), ETA ตายตัว, ปุ่มเรียกพนักงานซ่อน → /impeccable clarify

## Persona red flags
- Casey: ปุ่มส่งหลุดจอ, stepper 28px, "ยกเลิกทั้งหมด" 81×20 มุมบนขวา, แถบล่างซ้อนกิน 140px
- Jordan: "+" หลอกตา, แตะวิธีจ่ายเท่ากับแจ้งเช็คบิล, หาเรียกพนักงานไม่เจอ
- Sam: nav ใน header ช่วง md ไม่มีชื่อ (ไอคอนอย่างเดียว ไม่มี aria-label, CustomerLayout.tsx:159), หน้าเมนูไม่มี heading, stepper ไม่บอกจาน, ไม่มี aria-live สถานะ
- เพื่อน 4 คนโต๊ะเดียว: ไม่เห็นว่าคนอื่นสั่งอะไร, บิลไม่แยกออเดอร์, ใครแตะวิธีจ่ายก็ขอเช็คบิลทั้งโต๊ะ

## Minor
- เปิดลิงก์โต๊ะผิดแล้วตะกร้าโต๊ะจริงหาย (bindToken ก่อนตรวจ session, CustomerLayout.tsx:79)
- FoodImage ตัดสระหน้าไทยผิด ("เ")
- บิลว่างไม่เตือนว่ามีของค้างในตะกร้า
- ชื่อแท็บเบราว์เซอร์ "Restaurant", ปุ่มย้อนกลับ navigate(-1) หลุดออกจากแอปถ้าเข้าตรง
- เงา shadow-md / shadow-sm ทั่วฝั่งลูกค้า
