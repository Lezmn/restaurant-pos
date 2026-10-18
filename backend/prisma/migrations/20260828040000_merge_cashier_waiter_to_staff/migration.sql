/*
  Merges the CASHIER and WAITER roles into a single STAFF role.
  Existing users with role CASHIER or WAITER become STAFF; ADMIN and
  KITCHEN are unaffected.
*/

-- Create the new enum with the merged role set
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'STAFF', 'KITCHEN');

-- Migrate the users table onto the new enum, mapping CASHIER/WAITER -> STAFF
ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE "role"::text
      WHEN 'CASHIER' THEN 'STAFF'
      WHEN 'WAITER' THEN 'STAFF'
      ELSE "role"::text
    END
  )::"Role_new";

-- Swap the enum types
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Restore the default
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF';
