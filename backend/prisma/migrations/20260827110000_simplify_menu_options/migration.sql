-- Move every option directly under its menu item before removing option groups.
ALTER TABLE "menu_options" ADD COLUMN "menuItemId" TEXT;

UPDATE "menu_options" AS option
SET "menuItemId" = "option_groups"."menuItemId"
FROM "option_groups"
WHERE option."optionGroupId" = "option_groups"."id";

ALTER TABLE "menu_options" ALTER COLUMN "menuItemId" SET NOT NULL;

-- Remove the old group relation and table.
ALTER TABLE "menu_options" DROP CONSTRAINT "menu_options_optionGroupId_fkey";
DROP INDEX "menu_options_optionGroupId_idx";
ALTER TABLE "menu_options" DROP COLUMN "optionGroupId";
DROP TABLE "option_groups";

-- Link options directly to a menu item.
CREATE INDEX "menu_options_menuItemId_idx" ON "menu_options"("menuItemId");
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
