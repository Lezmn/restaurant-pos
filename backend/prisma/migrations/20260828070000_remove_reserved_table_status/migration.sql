/*
  ลบค่า RESERVED ออกจาก TableStatus — ไม่มีระบบจองโต๊ะ จึงไม่มีโค้ดไหนเซ็ตค่านี้เลย
  ถ้ามีแถวไหนค้างเป็น RESERVED ให้กลับไปเป็น AVAILABLE
*/

-- Create the new enum without RESERVED
CREATE TYPE "TableStatus_new" AS ENUM ('AVAILABLE', 'OCCUPIED');

-- Move the column onto it, mapping RESERVED -> AVAILABLE
ALTER TABLE "restaurant_tables"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "TableStatus_new"
  USING (
    CASE "status"::text
      WHEN 'RESERVED' THEN 'AVAILABLE'
      ELSE "status"::text
    END
  )::"TableStatus_new";

-- Swap the enum types
DROP TYPE "TableStatus";
ALTER TYPE "TableStatus_new" RENAME TO "TableStatus";

-- Restore the default
ALTER TABLE "restaurant_tables" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
