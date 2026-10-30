/** ตรงกับ @MinLength ของ ChangePasswordDto / CreateUserDto ฝั่ง backend */
export const MIN_PASSWORD_LENGTH = 8
/** ตรงกับ @MaxLength ฝั่ง backend — bcrypt ใช้แค่ 72 byte แรก */
export const MAX_PASSWORD_LENGTH = 72

/** ข้อความผิดของความยาวรหัส ('' = ผ่าน) — ใช้ทั้งกล่องเปลี่ยนรหัสและฟอร์มในหน้าบัญชีผู้ใช้ */
export function passwordLengthError(password: string, label = 'รหัสผ่าน') {
  if (password.length < MIN_PASSWORD_LENGTH) return `${label}อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
  if (password.length > MAX_PASSWORD_LENGTH) return `${label}ยาวได้ไม่เกิน ${MAX_PASSWORD_LENGTH} ตัวอักษร`
  return ''
}
