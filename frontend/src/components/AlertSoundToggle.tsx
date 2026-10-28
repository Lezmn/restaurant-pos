import { useAlertSound } from '@/lib/alert-sound'

/**
 * เปิด/ปิดเสียงแจ้งเตือน (ต่อเครื่อง) — คุมทั้งเสียงออเดอร์ใหม่ของครัวและเสียงลูกค้าเรียกพนักงาน
 * อยู่ที่หัวจอฝั่งพนักงาน จึงกดได้ทุกหน้า (เดิมอยู่แต่บนจอครัว เครื่องแคชเชียร์เข้าไม่ถึง)
 */
export function AlertSoundToggle() {
  const { enabled, setEnabled } = useAlertSound()

  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? 'เสียงแจ้งเตือนเปิดอยู่ (แตะเพื่อปิด)' : 'เสียงแจ้งเตือนปิดอยู่ (แตะเพื่อเปิด)'}
      title={enabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
      onClick={() => setEnabled(!enabled)}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 transition ${
        enabled
          ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100'
          : 'border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="h-5 w-5"
      >
        <path d="M11 5 6 9H2v6h4l5 4V5Z" />
        {enabled ? (
          <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
        ) : (
          <path d="m22 9-6 6M16 9l6 6" />
        )}
      </svg>
    </button>
  )
}
