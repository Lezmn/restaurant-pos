import { SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_PASSWORD_CHANGE_KEY = 'allowDuringPasswordChange';

/** route ที่ใช้ได้แม้ยังต้องเปลี่ยนรหัส (mustChangePassword) — ดูข้อมูลตัวเอง / ตั้งรหัสใหม่ */
export const AllowDuringPasswordChange = () =>
  SetMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, true);
