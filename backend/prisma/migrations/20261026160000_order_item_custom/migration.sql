-- รายการราคาเปิด: พนักงานพิมพ์ชื่อ/ราคาเอง ไม่ผูกกับเมนู
ALTER TABLE "order_items" ALTER COLUMN "menuItemId" DROP NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "customName" TEXT;
