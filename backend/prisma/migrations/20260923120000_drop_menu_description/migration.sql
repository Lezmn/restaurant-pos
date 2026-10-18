/* เลิกใช้คำอธิบายเมนูแล้ว — ถอดช่องกรอกออกจากหน้า Manage และตัดคอลัมน์ทิ้ง */

-- AlterTable
ALTER TABLE "menu_items" DROP COLUMN "description";
