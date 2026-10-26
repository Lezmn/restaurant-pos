import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSystemStatus, type SystemStatus } from '@/features/system/api'
import { ago } from '@/lib/time-ago'
import { SystemStatusPage } from './SystemStatusPage'

vi.mock('@/features/system/api', () => ({ getSystemStatus: vi.fn() }))

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const healthy: SystemStatus = {
  checkedAt: new Date().toISOString(),
  uptimeSeconds: 90_000,
  database: { state: 'ok', latencyMs: 4 },
  backup: { state: 'ok', lastAt: hoursAgo(9), lastSizeBytes: 2_400_000, fileCount: 14 },
  offsite: { state: 'ok', lastAt: hoursAgo(1) },
  slipOk: { state: 'ok', mock: false, configured: true },
  line: { state: 'off', configured: false },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SystemStatusPage />
    </QueryClientProvider>,
  )
}

// วงเล็บปีกกาสำคัญ — คืนค่า mock ออกไป vitest จะเอาไปเรียกเป็น cleanup หลังจบเทสต์
beforeEach(() => {
  vi.mocked(getSystemStatus).mockReset()
})

describe('SystemStatusPage', () => {
  it('ทุกอย่างปกติ — บอกเวลาสำรองล่าสุด', async () => {
    vi.mocked(getSystemStatus).mockResolvedValue(healthy)
    renderPage()
    expect(await screen.findByText('ทุกอย่างทำงานปกติ')).toBeInTheDocument()
    expect(screen.getByText(/ล่าสุด 9 ชั่วโมงที่แล้ว/)).toHaveTextContent('2.3 MB')
    // LINE ไม่ตั้ง = ไม่บังคับ ไม่ทำให้ภาพรวมขึ้นเตือน
    expect(screen.getByText(/ยังไม่ได้ตั้งค่าหรือปิดไว้ \(ไม่บังคับ\)/)).toBeInTheDocument()
  })

  it('สำรองเก่าเกิน → ภาพรวม "ควรตรวจสอบ"', async () => {
    vi.mocked(getSystemStatus).mockResolvedValue({
      ...healthy,
      backup: { ...healthy.backup, state: 'warn', lastAt: hoursAgo(50) },
    })
    renderPage()
    expect(await screen.findByText('ใช้งานได้ แต่มีบางอย่างควรตรวจสอบ')).toBeInTheDocument()
    expect(screen.getByText(/ไม่ได้สำรองเกิน 1 วัน/)).toBeInTheDocument()
  })

  it('ติดต่อเซิร์ฟเวอร์ไม่ได้ → ขึ้นแดง', async () => {
    vi.mocked(getSystemStatus).mockRejectedValue(new Error('network'))
    renderPage()
    expect(await screen.findByText(/ติดต่อเซิร์ฟเวอร์ไม่ได้/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('มีปัญหาที่กระทบการขาย')
  })
})

describe('ago', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')
  it.each([
    ['2026-10-26T11:59:40Z', 'เมื่อสักครู่'],
    ['2026-10-26T11:15:00Z', '45 นาทีที่แล้ว'],
    ['2026-10-26T02:00:00Z', '10 ชั่วโมงที่แล้ว'],
    ['2026-10-22T12:00:00Z', '4 วันที่แล้ว'],
  ])('%s → %s', (iso, text) => expect(ago(iso, now)).toBe(text))
})
