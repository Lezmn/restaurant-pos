-- ค่าตั้งค่าที่เจ้าของร้านแก้จากหน้าเว็บ (LINE ฯลฯ)
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByName" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
