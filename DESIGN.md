---
name: ร้านอาหารตามใจ ไม่ตามสั่ง
description: ระบบ POS ร้านอาหาร โทนส้มอุ่น แบนราบ ขอบหนา ปุ่มใหญ่กดง่าย
colors:
  brand-50: "#fff4e9"
  brand-75: "#ffd1a5"
  brand-100: "#ffbe7f"
  brand-200: "#ffa248"
  brand-300: "#ff8f23"
  brand-400: "#b36419"
  brand-500: "#9c5715"
  ink: "#5d4037"
  price: "#bf360c"
  amount: "#e65100"
  qty: "#f57c00"
  accent-pink: "#ff2d55"
  minus: "#f44336"
  plus: "#4caf50"
  listing: "#fff4e6"
  text: "#2d2d2d"
  field: "#fafafa"
  field-text: "#1c1b1f"
  promptpay: "#2f6fed"
  table-head: "#1e73be"
  accent-olive: "#b3b300"
  accent-olive-ink: "#6b6b00"
  status-queue: "#e05c5c"
  status-cooking: "#b36419"
  status-done: "#8080e0"
  status-queue-ink: "#b23b3b"
  status-cooking-ink: "#9c5715"
  status-done-ink: "#5b5bc4"
  success: "#3aa76d"
  success-ink: "#23794b"
  danger: "#d64545"
  danger-ink: "#b42c2c"
  surface: "#ffffff"
  line: "oklch(92.8% 0.006 264.531)"
  line-strong: "oklch(87.2% 0.01 258.338)"
  muted-text: "oklch(55.1% 0.027 264.364)"
  body-text: "oklch(37.3% 0.034 259.733)"
typography:
  display:
    fontFamily: "IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.333
  title:
    fontFamily: "IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.556
  body:
    fontFamily: "IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
  body-strong:
    fontFamily: "IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.429
  label:
    fontFamily: "IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-500}"
    textColor: "{colors.surface}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.brand-500}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand-500}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-outline-hover:
    backgroundColor: "{colors.brand-50}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body-text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "{colors.danger-ink}"
    textColor: "{colors.surface}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.field-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  input-search:
    backgroundColor: "{colors.field}"
    textColor: "{colors.field-text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.lg}"
    padding: "12px 16px 12px 48px"
  chip-category:
    backgroundColor: "{colors.brand-100}"
    textColor: "{colors.brand-500}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    padding: "10px 24px"
  chip-category-active:
    backgroundColor: "{colors.brand-300}"
    textColor: "{colors.surface}"
  chip-filter-staff:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body-text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  chip-filter-staff-active:
    backgroundColor: "{colors.brand-500}"
    textColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand-500}"
    typography: "{typography.headline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  table-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.headline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  nav-tab-staff-active:
    backgroundColor: "{colors.brand-400}"
    textColor: "{colors.surface}"
    typography: "{typography.headline}"
    padding: "16px 0"
---

# Design System: ร้านอาหารตามใจ ไม่ตามสั่ง

## Overview

**Creative North Star: "The Orange Order Slip"**

เหมือนใบสั่งอาหารสีส้มที่เสียบอยู่หน้าครัว: แบนราบ ขอบหนา ตัวหนา อ่านออกในแวบเดียว ทุกหน้าจอต้องใช้งานได้ระหว่างที่มือไม่ว่าง ไม่ว่าจะเป็นครัวที่ยืนดูแท็บเล็ต พนักงานที่กำลังรับเงิน หรือลูกค้าที่ถือมือถือที่โต๊ะ สีส้มคือเสียงของแบรนด์และเป็นสัญญาณของ "สิ่งที่กดได้/กำลังเลือกอยู่" ส่วนสีสถานะ (แดง/ส้มน้ำตาล/ม่วง) บอกว่าออเดอร์อยู่ขั้นไหนในครัว

ความหนาแน่นแตกต่างตามฝั่ง ฝั่งลูกค้าโปร่งและอบอุ่น (การ์ดเมนูสีส้ม รูปอาหาร ชิปหมวดหมู่ทรงแคปซูล) ฝั่งพนักงานหนาแน่นและเป็นเครื่องมือ (kanban 3 คอลัมน์ ตาราง แถบล่างปุ่มใหญ่) ฝั่งเจ้าของร้านเป็นแดชบอร์ดการ์ดตัวเลขขอบหนา 2px ทั้งหมดใช้ฟอนต์ IBM Plex Sans Thai ตัวเดียว เน้นน้ำหนัก bold/semibold มากกว่าขนาด

ความลึกมาจากขอบและสีพื้น ไม่ใช่เงา (ยืนยันแล้ว) ปุ่ม การ์ด และช่องกรอกต้องใหญ่ หนา กดง่าย (ยืนยันแล้ว) ค่าสีแบรนด์ทั้งหมดมาจากไฟล์ Figma ยกเว้น `table-head`, `accent-olive`, `promptpay` ที่ยังคาดจากภาพหน้าจอ

**Key Characteristics:**
- ส้มอุ่นไล่ 7 ระดับ (`brand-50` → `brand-500`) เป็นแกนหลักของทุกฝั่ง
- แบนราบ แยกชั้นด้วยขอบ 1–2px และพื้นครีม/ส้มอ่อน
- ตัวอักษรหนา: `font-bold` และ `font-semibold` คือค่าปกติ ไม่ใช่ค่าเน้น
- เป้ากดใหญ่ แถบนำทางล่างเต็มความกว้าง ปุ่มเต็มแถวในกล่อง
- สีสถานะออเดอร์คงที่ข้ามทุกหน้าที่แสดงออเดอร์

## Colors

พาเลตต์ส้มอุ่นแบบ monochrome พร้อมสีบอกสถานะและสีวิธีชำระเงินที่ใช้เฉพาะจุด

### Primary
- **Ember Orange** (`brand-300`): ชิปหมวดหมู่ที่เลือกและแท็บ nav ฝั่งลูกค้า แถบตะกร้าลอย เส้นกราฟพื้นที่ (ห้ามวางตัวหนังสือขาวขนาดปกติบนสีนี้ ได้แค่ 2.3:1)
- **Toasted Caramel** (`brand-400`): ขอบปุ่ม outline, ขอบโฟกัสช่องกรอก, ชื่อร้าน, บล็อกแท็บที่เลือกในแถบล่างพนักงาน (ตัว 24px หนา), หน้าที่เลือกใน pagination, แถบนำทางล่างฝั่งลูกค้า
- **Burnt Sienna** (`brand-500`): พื้นปุ่มหลัก (ตัวขาว 5.5:1), ชิป/segmented ที่เลือกฝั่งพนักงาน, ตัวหนังสือสีแบรนด์บนพื้นขาว, focus ring, ขอบช่องค้นหาฝั่งลูกค้า
- **Apricot Glow** (`brand-200`): พื้นการ์ดเมนูฝั่งลูกค้า กล่องนาฬิกาฝั่งพนักงาน ปลายไล่สีแบนเนอร์
- **Peach Cream → Melon** (`brand-50`, `brand-75`, `brand-100`): พื้น hover, กล่องยืนยันโทน brand, เส้นใต้ header ลูกค้า, ชิปที่ไม่ได้เลือก, รูปอาหารสำรอง

### Secondary
- **Cocoa Ink** (`ink`): ชื่อเมนูบนการ์ดส้ม และหัวข้อหน้าสถานะฝั่งลูกค้า
- **Chili Red / Paprika / Tangerine** (`price`, `amount`, `qty`): ราคาบนการ์ดเมนู ยอดรวมในตะกร้า/บิล และตัวเลขจำนวน
- **Stepper Red / Leaf Green** (`minus`, `plus`): ปุ่มลด/เพิ่มจำนวนเท่านั้น
- **Hot Pink** (`accent-pink`): ลิงก์ลบในตะกร้า

### Tertiary
- **PromptPay Blue** (`promptpay`): ยอด PromptPay และกล่อง QR ชำระเงิน (ยังไม่ยืนยันกับ Figma)
- **Ledger Blue** (`table-head`): หัวตารางหน้า Check (ยังไม่ยืนยันกับ Figma)
- **Olive** (`accent-olive`): โทนหนึ่งของการ์ดสถิติฝั่งเจ้าของร้าน (ยังไม่ยืนยันกับ Figma)
- **สีสถานะออเดอร์:** `status-queue` (รอคิว, แดงอิฐ), `status-cooking` (กำลังทำ, ค่าเดียวกับ `brand-400`), `status-done` (เสร็จแล้ว, ม่วงลาเวนเดอร์) ใช้กับจุด/ขอบ/พื้นอ่อน ส่วนพื้นปุ่มที่มีตัวขาวและตัวหนังสือบนพื้นอ่อนใช้เวอร์ชัน `-ink` (`status-queue-ink`, `status-cooking-ink`, `status-done-ink`) ซึ่งผ่าน 4.5:1
- **สีผลลัพธ์:** `success` (เขียว ใช้เป็นจุด/ขอบเท่านั้น ตัวหนังสือได้แค่ 3:1), `danger` (แดง สำหรับพื้นอ่อน/ขอบ) และ `danger-ink` (แดงเข้ม สำหรับตัวหนังสือและพื้นปุ่มลบที่มีตัวขาว)

### Neutral
- **Surface** (`surface`): พื้นหลังทุกหน้าและทุกการ์ด
- **Cream Ledger** (`listing`): พื้นรายการในตะกร้าและบิลฝั่งลูกค้า
- **Field Fog** (`field`): พื้นช่องค้นหา
- **Hairline / Rule** (`line`, `line-strong`): เส้นแบ่ง ขอบการ์ด ขอบช่องกรอก ขอบปุ่มรอง (เป็นสี gray-200/gray-300 ของ Tailwind)
- **Body / Muted** (`body-text`, `muted-text`, `text`, `field-text`): ตัวหนังสือรอง คำอธิบาย ป้ายแกนกราฟ ตัวหนังสือหัวข้อใช้ดำ

### Named Rules
**The Orange Means Touch Rule.** สีส้ม `brand-300`/`brand-400` สงวนไว้สำหรับสิ่งที่กดได้ สิ่งที่เลือกอยู่ และชื่อร้าน ข้อมูลที่อ่านอย่างเดียวใช้ดำ/เทา
**The Fixed Status Rule.** รอคิว = `status-queue`, กำลังทำ = `status-cooking`, เสร็จ = `status-done` ทุกหน้าที่แสดงสถานะออเดอร์ ห้ามสลับหรือใช้สีอื่น
**The Token-Only Rule.** ห้ามเขียน hex ตรงในไฟล์ component สีทั้งหมดต้องผ่าน `@theme` ใน `frontend/src/index.css`
**The Ink Rule.** ตัวหนังสือขาวบนพื้นสีใช้ `brand-500` หรือ `danger-ink` เสมอ `brand-400` ใช้ได้เฉพาะตัวหนา 24px ขึ้นไป ตัวหนังสือสีบนพื้นขาวใช้ `brand-500` / `danger-ink` ไม่ใช่ `brand-300` / `brand-400` / `danger`

## Typography

**Body Font:** IBM Plex Sans Thai (with system-ui, sans-serif) น้ำหนัก 400 / 500 / 600 / 700 โหลดจาก Google Fonts

**Character:** ฟอนต์เดียวทั้งระบบ ชัด อ่านง่ายทั้งไทยและอังกฤษ ลำดับชั้นมาจากน้ำหนักและสีมากกว่าการเปลี่ยนขนาด

### Hierarchy
- **Display** (700, 1.875–2.25rem): ตัวเลขบนการ์ดสถิติขนาดใหญ่ และแบนเนอร์ต้อนรับฝั่งลูกค้า
- **Headline** (700, 1.5rem): ชื่อร้านใน header พนักงาน ป้ายแถบล่างพนักงาน ตัวเลขการ์ดสถิติ หัวข้อหน้า (`PageHeader` ใช้ 600)
- **Title** (700, 1.125rem): หัวกล่อง modal ชื่อร้านบนใบเสร็จ หัวคอลัมน์ kanban
- **Body** (400–600, 0.875rem → 1rem ที่ `md`): ขนาดหลักของแอป (ใช้มากที่สุด) ฝั่งลูกค้าขยายเป็น 1rem ที่จอ `md` ขึ้นไป
- **Label** (500–700, 0.75rem): badge, ตัวเลขบน badge ตะกร้า, ป้ายแท็บล่างฝั่งลูกค้า (11px)

### Named Rules
**The Bold Is Default Rule.** ปุ่ม ป้าย ราคา และตัวเลขเงินใช้ `font-bold` เสมอ ตัวหนังสือน้ำหนักปกติใช้เฉพาะคำอธิบายรอง
**The Tabular Money Rule.** ตัวเลขจำนวน/ยอดเงินที่เปลี่ยนค่าได้ใช้ `tabular-nums` และแสดงผ่าน `formatBaht`

## Layout

- **ฝั่งลูกค้า:** คอลัมน์เดียวกลางจอ `max-w-md` → `md:max-w-3xl` → `lg:max-w-6xl` ขอบข้าง 16px กริดเมนู 2 → 3 (`md`) → 4 (`lg`) คอลัมน์ ช่องไฟ 12–16px แถบนำทางล่าง 4 แท็บบนมือถือ ย้ายขึ้น header ที่ `md`
- **ฝั่งพนักงาน:** เต็มความกว้าง ขอบข้าง 16px → 32px (`sm`) header มีชื่อร้าน ปุ่มลัด และนาฬิกา พ.ศ. แถบล่าง 4 ปุ่มเต็มความกว้างตลอด (ไอคอนอย่างเดียวบนมือถือ มีข้อความที่ `sm`) เนื้อหาเว้นล่าง 112px ให้แถบล่าง kanban เรียงลงบนจอแคบ เป็น 3 คอลัมน์บนจอกว้าง
- **ฝั่งเจ้าของร้าน:** sidebar ซ้ายค้างบนจอใหญ่ กลายเป็นแถบบนเลื่อนแนวนอนบนมือถือ พื้น `brand-50` ตัว `brand-500` เต็ม (ห้ามใช้ /70 /80 จะเหลือ ~2.9:1) เมนูที่เลือกพื้น `brand-500` ตัวขาว ปุ่มสูง 44px ชื่อร้านจาก `RESTAURANT_NAME`
- **จังหวะช่องไฟ:** ฐาน 4px ค่าที่ใช้บ่อยคือ 8 / 12 / 16 / 20px ภายในการ์ด 12–16px ภายใน modal 20px
- รองรับ notch ด้วย `min-h-dvh` และ `env(safe-area-inset-bottom)` บนแถบล่างทุกตัว
- โหมดพิมพ์: ป้าย QR และใบเสร็จ (กว้างสูงสุด 80mm) ผ่านคลาส `.print-area` / `.print-receipt`

## Elevation & Depth

ระบบนี้แบนราบ: ความลึกมาจากขอบ (1px เทาอ่อนสำหรับการ์ดทั่วไป, 2px สีสำหรับการ์ดที่มีความหมาย) และพื้นสีอ่อน (`brand-50`, `listing`, `danger/5`) เงาใช้เฉพาะสิ่งที่ลอยเหนือหน้าจอจริง ๆ คือ modal (`shadow-xl` บนพื้นหลัง `black/40`) และแถบตะกร้าลอยฝั่งลูกค้า

ฝั่งพนักงาน (Check, Manage) ไม่มีเงาแล้ว ฝั่งลูกค้ายังมีเงาเดิมค้างอยู่: `Card` ใช้ `shadow-sm`, การ์ดเมนู/รายการตะกร้า/ช่องค้นหาใช้ `shadow-md` งานใหม่ไม่ควรขยายรูปแบบนี้

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): กล่อง modal เท่านั้น
- **Floating bar** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): แถบตะกร้าลอยฝั่งลูกค้า

### Named Rules
**The Border Not Shadow Rule.** แยกชั้นด้วยขอบและสีพื้น เงามีไว้สำหรับของที่ลอยอยู่เหนือหน้าจอเท่านั้น (modal, แถบลอย)
**The Two-Pixel Meaning Rule.** ขอบ 2px สีใช้เมื่อขอบนั้นบอกความหมาย (โทนการ์ดสถิติ คอลัมน์สถานะ kanban ปุ่ม outline) ขอบ 1px เทาใช้แค่แบ่งพื้นที่

## Shapes

มุมโค้งปานกลางเป็นหลัก: 8px (`rounded-lg`) สำหรับปุ่ม ช่องกรอก กล่องในกล่อง และ modal, 12px (`rounded-xl`) สำหรับการ์ด การ์ดเมนู ตั๋ว kanban การ์ดสถิติ และช่องค้นหา, ทรงแคปซูล (`rounded-full`) สำหรับชิปหมวดหมู่ badge จุดสถานะ ปุ่มเพิ่ม/ลดจำนวน และแท็บ nav ฝั่งลูกค้าบนจอใหญ่ 16px (`rounded-2xl`) ใช้กับแบนเนอร์และกล่องนาฬิกาเท่านั้น ช่องกรอกทุกตัวฝั่งพนักงานใช้ 8px ผ่าน `field` ใน `components/ui/styles.ts`

ขอบแทบทุกจุดเป็นเส้นทึบ ไม่มีเส้นประ ไม่มีการตัดมุมหรือรูปทรงพิเศษ

## Components

### Buttons
ใหญ่ หนา กดง่าย ตัวหนังสือ bold เสมอ ใช้ `button(variant, size)` จาก `frontend/src/components/ui/styles.ts` เท่านั้น
- **Shape:** มุมโค้งปานกลาง (8px) สูงอย่างน้อย 40 / 44 / 48px (`sm` / `md` / `lg`) ปุ่มคู่ท้ายกล่องเต็มความกว้างแบ่งสองช่อง ย้อนกลับซ้าย ยืนยันขวา
- **Primary:** พื้น Burnt Sienna ตัวขาว hover `brightness-90` ปุ่มที่บันทึกเงินต้องบอกยอดในปุ่ม เช่น "รับเงิน ฿50"
- **Secondary:** ขอบ 2px `line-strong` ตัวหนังสือ `body-text` hover พื้นเทาอ่อน (ย้อนกลับ, ปิดโต๊ะ, หยิบเงินออก)
- **Outline:** ขอบ 2px `brand-400` ตัวหนังสือ `brand-500` hover พื้น `brand-50` (แก้ไข, ปุ่มลัดใน header)
- **Danger / Danger outline:** พื้น `danger-ink` ตัวขาว หรือขอบ `danger` ตัว `danger-ink` ใช้เฉพาะการลบ/ยกเลิกบิล ไม่ใช้กับปุ่มที่แค่ปิดกล่อง
- **Focus:** ทุกปุ่ม/ลิงก์มี outline 2px `brand-500` ห่าง 2px ตอน `:focus-visible` (ตั้งไว้ใน `index.css`)
- **Disabled:** `opacity-50` + `cursor-not-allowed`

### Chips
- **Style:** ทรงแคปซูล padding 10px 24px ตัวหนา เลื่อนแนวนอนได้
- **State:** ไม่ได้เลือก = พื้น `brand-100` ตัว `brand-500` hover `brand-75`, เลือกแล้ว = พื้น `brand-300` ตัวขาว
- **Badge:** แคปซูลเล็ก 12px font-medium บนพื้นสีอ่อน 5 โทน (gray, blue, amber, green, red ของ Tailwind)

### Cards / Containers
- **Corner Style:** 12px
- **Background:** ขาว, ฝั่งลูกค้าใช้ `brand-200` (การ์ดเมนู) และ `listing` (รายการตะกร้า/บิล)
- **Shadow Strategy:** ดู Elevation: แบนราบ ใช้ขอบ
- **Border:** 1px `line` สำหรับการ์ดทั่วไป, 2px สีโทนสำหรับการ์ดสถิติและตั๋ว kanban
- **Internal Padding:** 12–16px

### Inputs / Fields
- **Style:** คลาส `field`: ขอบ 1px `line-strong` พื้นขาว มุม 8px padding 10px 12px ตัว 16px ป้ายใช้ `fieldLabel` (14px semibold)
- **Search:** ช่องค้นหาฝั่งลูกค้า พื้น `field` ขอบ `brand-500` มุม 12px ตัวหนา ไอคอนแว่นขยายซ้าย ฝั่งพนักงานใช้ `field` + ไอคอนซ้าย
- **Focus:** ขอบเปลี่ยนเป็น `brand-400` พร้อม ring 2px `brand-400/25`
- **Error:** `ErrorNote` (บันทึกล้มเหลว) และ `LoadError` (ดึงข้อมูลไม่ได้ พร้อมปุ่มลองใหม่) ห้ามแสดง empty state ตอนที่ดึงข้อมูลไม่ได้

### Navigation
- **ลูกค้า (มือถือ):** แถบล่างพื้น `brand-400` ไอคอน + ป้าย 11px ตัวขาว, แท็บที่เลือก bold ขาวเต็ม แท็บอื่นขาว 70% badge จำนวนสีแดงมุมขวาบน
- **ลูกค้า (`md`+):** แท็บแคปซูลใน header ที่เลือกพื้น `brand-300` ตัวขาว
- **พนักงาน:** แถบล่างพื้นขาว 4 ปุ่มเท่ากัน ตัว 18–24px bold ไอคอน `brand-500`, ที่เลือกเป็นบล็อก `brand-400` เต็มช่อง ไอคอนและตัวหนังสือขาว, ปุ่มที่ role ไม่มีสิทธิ์แสดงเป็นเทาจางกดไม่ได้ (ไม่ซ่อน) และมี `aria-label` เพราะบนมือถือเหลือแค่ไอคอน
- **Segmented (Manage: เมนู/วัตถุดิบ):** รางพื้นเทาอ่อน ตัวที่เลือกพื้น `brand-500` ตัวขาว
- **ชิปกรองฝั่งพนักงาน:** ขอบ 2px ทุกสถานะ (ขนาดไม่กระโดด) ไม่เลือก = ขาวขอบเทา, เลือก = `brand-500` ตัวขาว, ตัวกรองเชิงลบ ("เฉพาะที่ปิดขาย") เลือกแล้วเป็น `danger-ink`
- **Pagination:** หน้าที่เลือกพื้น `brand-400` ตัวขาว หน้าอื่น hover พื้น `brand-50`

### Kitchen Ticket Board
kanban 3 คอลัมน์ (รอคิว / กำลังปรุง / เสร็จแล้ว) หัวคอลัมน์มีจุดสีสถานะ 14px และ badge จำนวน ตั๋วแต่ละใบเป็นการ์ดขาวขอบ 2px สีสถานะ ชื่อโต๊ะ 20–24px bold, รายการอาหาร 16px (จำนวนนำหน้าตัวใหญ่), หมายเหตุ 16px bold สี `status-queue-ink` อ่านได้จากระยะแขน เวลารอ 16px พร้อมไอคอนนาฬิกา เกิน 15 นาทีเป็นป้ายทึบ `danger-ink` ตัวขาวบรรทัดเดียว ไอคอนเปลี่ยนเป็นสามเหลี่ยมเตือน (ไม่บอกด้วยสีอย่างเดียว) และไม่แสดงในคอลัมน์เสร็จแล้ว ออเดอร์ที่เพิ่งเข้าไม่ถึง 1 นาทีติดป้าย "ใหม่" ปุ่มเปลี่ยนสถานะเต็มความกว้าง 48px อยู่ล่างตั๋ว พื้น `status-*-ink` ระหว่างส่งเปลี่ยนเป็น "กำลังส่ง..." และล็อกเฉพาะตั๋วนั้น กด "ทำเสร็จแล้ว" ตั๋วย้ายไปเสร็จแล้วทันทีแต่หน่วงการส่งไว้ 5 วินาที (backend ห้ามย้อนสถานะ) ระหว่างนั้นตำแหน่งปุ่มหลักกลายเป็นปุ่ม "ยกเลิก" ขอบ `status-done-ink` 48px พร้อมแถบเวลาหดใต้ปุ่ม อยู่บนตั๋วเอง ไม่ใช้ toast ลอยบนจอ ปุ่มยกเลิกเป็นปุ่มรองเล็ก (ขอบเทา ตัว `danger-ink` เห็นแดงตลอดเพราะแท็บเล็ตไม่มี hover) อยู่หัวตั๋ว ห่างจากปุ่มหลัก และไม่มีในคอลัมน์เสร็จแล้ว

### Table Tile (หน้า Check)
บิลของโต๊ะหนึ่งใบ: ชื่อโต๊ะ 24px bold, ป้ายสถานะแคปซูลพร้อมจุดสี (ขอเช็คบิล / เสิร์ฟครบแล้ว / รอเสิร์ฟ N ออเดอร์ / เก็บเงินครบแล้ว), เวลาเปิดโต๊ะและวิธีจ่ายที่ลูกค้าเลือก, ยอด 30px bold tabular และปุ่มเดียวเต็มความกว้างชิดล่างเสมอ (รับเงิน ฿X / ปิดโต๊ะ / กล่องเทา "เสิร์ฟให้ครบก่อน") โต๊ะที่ขอเช็คบิลมีขอบ `brand-400` และเรียงขึ้นก่อน กริด 2 คอลัมน์บนแท็บเล็ต 3 คอลัมน์บนจอกว้าง

### Drawer Ledger (หน้า Check)
สมุดลิ้นชักแบบใบสรุปยอด: ป้ายซ้าย ตัวเลขชิดขวา tabular คั่นด้วยเส้น 1px ยอดสุทธิตัวหนา PromptPay แยกบรรทัดเพราะไม่อยู่ในลิ้นชัก รายการหยิบออกพับเก็บใน `<details>` ไม่ใช้ตัวเลขหลากสีหรือจุดคั่นในบรรทัดเดียว

### Menu Card (หน้า Manage)
รูป 4:3, ชื่อ+ราคา, หมวด, สวิตช์เปิด/ปิดขายเป็นงานหลัก (ล็อกเฉพาะเมนูที่กำลังบันทึก), ปุ่มแก้ไขแบบ outline ด้านล่าง เมนูที่ปิดขาย: รูปเทาจาง ป้าย "ปิดขาย" ดำบนรูป พื้นการ์ด `gray-50` ปุ่มลบอยู่ในกล่องแก้ไขเท่านั้น

### Stat Card
การ์ดขาวขอบ 2px สีโทน (brand, orange, purple, promptpay, olive, green, red) ป้ายดำ semibold ตัวเลขใหญ่ bold `tabular-nums` สีตระกูลเดียวกับขอบแต่ใช้เวอร์ชัน ink ที่ผ่าน contrast บนขาว (orange → `brand-500`, olive → `accent-olive-ink`, green → `success-ink`, red → `danger-ink`, purple → `status-done-ink`) มีบรรทัด `hint` เล็กใต้ตัวเลขได้ เช่น "8 บิล" การ์ดเงิน PromptPay ใช้โทน `promptpay`

**Owner Dashboard:** หัวข้อ h1 + วันที่ และ segmented "วันนี้ / 7 วัน / 30 วัน" มุมขวา (เก็บใน `?range=`) การ์ด 4 ใบ: รายรับ (`size="lg"` บอกจำนวนบิล และวันนี้บอกยอดเมื่อวาน), เงินสด, PromptPay, กำไร/ขาดทุน (บอกรายจ่าย) — มือถือรายรับ/กำไรเต็มแถว เงินสดกับ PromptPay คู่กัน, แท็บวันนี้: กราฟแท่งรายชั่วโมง (ชั่วโมงปัจจุบันเข้ม ป้าย "ตอนนี้") + "ในร้านตอนนี้" + รายการบิลที่รับเงิน (เวลานาฬิกา + "N นาทีที่แล้ว" เมื่อไม่ถึงชั่วโมง ยอดสีดำ), แท็บ 7/30 วัน: กราฟเส้นรายวัน (จุดสุดท้าย "วันนี้" ทึบพร้อมป้ายยอด 30 วันเว้นป้ายทุก 5 วัน) + "ภาพรวมช่วงนี้" (เฉลี่ยต่อวัน/ต่อบิล วันขายดีสุด วันไม่มีรายรับ) ป้ายแกนกราฟทุกตัวเป็น HTML 12px คงที่

## Do's and Don'ts

### Do:
- **Do** ใช้ token จาก `@theme` เท่านั้น เช่น `bg-brand-300`, `text-price`, `border-status-queue`
- **Do** แยกชั้นด้วยขอบ 1px `line` หรือ 2px สีโทน และพื้น `brand-50`/`listing` แทนเงา
- **Do** ทำปุ่มให้ใหญ่และหนา: padding ไม่น้อยกว่า 10px แนวตั้ง ตัว bold ปุ่มยืนยันใน modal เต็มความกว้าง
- **Do** ใช้ `ConfirmDialog` ก่อนทุกการกระทำที่ย้อนกลับไม่ได้ โดยปุ่มยืนยันอยู่ขวาเสมอ
- **Do** ใช้สีสถานะออเดอร์ชุดเดียวกับ kanban ทุกที่ที่แสดงสถานะ
- **Do** วางตัวหนังสือขาวบน `brand-500` (5.5:1) หรือ `danger-ink` เท่านั้น `brand-300` ได้แค่ 2.3:1 และ `brand-400` ได้ 4.4:1 ซึ่งไม่ผ่าน AA สำหรับตัวขนาดปกติ
- **Do** แยกสถานะ กำลังโหลด / ดึงข้อมูลไม่ได้ / ไม่มีข้อมูล ให้ชัดทุกหน้า

### Don't:
- **Don't** เขียน hex ตรงในไฟล์ component
- **Don't** เพิ่มเงาให้การ์ด ปุ่ม หรือช่องกรอกในงานใหม่ เงามีไว้สำหรับ modal และแถบลอยเท่านั้น
- **Don't** ใช้สีส้มกับข้อมูลที่อ่านอย่างเดียว เพราะส้มหมายถึงสิ่งที่กดได้หรือเลือกอยู่
- **Don't** ซ่อนปุ่มที่ role ไม่มีสิทธิ์ในแถบล่างพนักงาน ให้แสดงจางและกดไม่ได้
- **Don't** ใช้ `confirm()` ของเบราว์เซอร์ ให้ใช้ `ConfirmDialog`
- **Don't** ใช้ปุ่มแดงทึบหรือเขียวทึบกับคู่ยกเลิก/บันทึก ใช้ secondary + primary
- **Don't** วางปุ่มลบไว้บนการ์ดที่ถูกกดบ่อย ให้อยู่ในกล่องแก้ไข
