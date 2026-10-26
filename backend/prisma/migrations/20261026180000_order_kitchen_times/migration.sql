-- เวลาที่ครัวเริ่มปรุง / ทำเสร็จ — สถิติความเร็วครัว
ALTER TABLE "orders" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "servedAt" TIMESTAMP(3);
