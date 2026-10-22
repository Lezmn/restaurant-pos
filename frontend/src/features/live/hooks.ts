import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { authStorage } from '@/lib/auth-storage'
import { useLiveStatus } from '@/lib/live'
import { publicKeys } from '@/features/public/hooks'

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * ชื่อ event ที่ backend push มา (ต้องตรงกับ ServerEvent ใน events.gateway.ts ฝั่ง NestJS)
 * payload มีแค่ id/สถานะ — เราไม่เอาไปใช้ตรง ๆ แต่สั่ง react-query ดึงข้อมูลเต็มใหม่แทน
 * ข้อดีคือหน้าจอทุกหน้าใช้ข้อมูลชุดเดียวกับตอนโหลดปกติ ไม่ต้องเขียน logic merge เอง
 */
type ServerEvent =
  | 'order.created'
  | 'order.updated'
  | 'service-request.created'
  | 'service-request.updated'
  | 'payment.created'
  | 'payment.voided'
  | 'payment.slip-updated'
  | 'table-session.created'
  | 'table-session.closed'
  | 'menu.updated'

/** event ไหนกระทบ query key ไหนบ้าง (ฝั่งพนักงาน) */
const STAFF_INVALIDATIONS: Record<ServerEvent, readonly string[][]> = {
  // ออเดอร์ใหม่/เปลี่ยนสถานะ → ยอดค้างจ่ายของ session และสถานะโต๊ะ (ยกเลิกแล้วโต๊ะอาจว่าง) เปลี่ยนตาม
  // ออเดอร์ตัด/คืนสต็อกวัตถุดิบด้วย → ยอดคงเหลือในแท็บวัตถุดิบเปลี่ยนตาม
  'order.created': [['orders'], ['table-sessions'], ['tables'], ['ingredients']],
  'order.updated': [['orders'], ['table-sessions'], ['tables'], ['ingredients']],
  // session summary มี checkoutRequest ติดมาด้วย
  'service-request.created': [['service-requests'], ['table-sessions']],
  'service-request.updated': [['service-requests'], ['table-sessions']],
  // จ่าย/ยกเลิกบิลกระทบเกือบทุกอย่าง รวมถึงยอดขายบน Dashboard และยอดลิ้นชักวันนี้
  'payment.created': [['payments'], ['orders'], ['service-requests'], ['table-sessions'], ['tables'], ['reports'], ['cash-closes']],
  'payment.voided': [['payments'], ['orders'], ['service-requests'], ['table-sessions'], ['tables'], ['reports'], ['cash-closes']],
  // ระบบตรวจสลิปซ้ำเสร็จ / ADMIN ยืนยันเอง — ป้ายสถานะในรายการบิลกับตัวเลขบน Dashboard เปลี่ยน
  'payment.slip-updated': [['payments'], ['reports']],
  'table-session.created': [['table-sessions'], ['tables']],
  'table-session.closed': [['table-sessions'], ['tables'], ['service-requests']],
  // ปิดวัตถุดิบเพราะของหมด → เมนู/ตัวเลือกเปลี่ยนทุกจอ
  'menu.updated': [['menu-items'], ['ingredients'], ['public', 'menu']],
}

const STAFF_EVENTS = Object.keys(STAFF_INVALIDATIONS) as ServerEvent[]

function invalidateAll(qc: QueryClient, keys: readonly string[][]) {
  for (const queryKey of keys) qc.invalidateQueries({ queryKey })
}

/**
 * ต่อ socket ครั้งเดียวต่อ layout แล้วรายงานสถานะเข้า useLiveStatus
 * - onConnect ถูกเรียกทั้งตอนต่อครั้งแรกและตอน reconnect — ใช้ดึงข้อมูลที่พลาดไประหว่างหลุด
 * - socket.io-client reconnect เองอยู่แล้ว เราแค่ toggle connected เพื่อเปิด/ปิด poll สำรอง
 */
function useSocket(
  auth: Record<string, string> | null,
  bind: (socket: Socket) => void,
  onConnect: () => void,
) {
  const setConnected = useLiveStatus((s) => s.setConnected)

  useEffect(() => {
    if (!auth) return

    const socket = io(SOCKET_URL, { auth, transports: ['websocket', 'polling'] })
    socket.on('connect', () => {
      setConnected(true)
      onConnect()
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))
    bind(socket)

    return () => {
      socket.close()
      setConnected(false)
    }
    // auth เปลี่ยน = login ใหม่/เปลี่ยนโต๊ะ ต้องต่อใหม่; bind/onConnect ผูกกับ qc ที่ไม่เปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(auth)])
}

/** ฝั่งพนักงาน — วางไว้ใน EmployeeLayout จึงได้ event ทุกหน้า (ครัว / Check / โต๊ะ) */
export function useStaffLiveEvents() {
  const qc = useQueryClient()
  const token = authStorage.getToken()

  useSocket(
    token ? { token } : null,
    (socket) => {
      for (const event of STAFF_EVENTS) {
        socket.on(event, () => invalidateAll(qc, STAFF_INVALIDATIONS[event]))
      }
    },
    // หลุดไปช่วงหนึ่งอาจมีออเดอร์/คำขอเข้ามาโดยไม่รู้ — ดึงใหม่ทั้งชุด
    () => invalidateAll(qc, [['orders'], ['service-requests'], ['table-sessions'], ['tables']]),
  )
}

/**
 * ฝั่งลูกค้า — วางไว้ใน CustomerLayout
 * backend ยิงให้เฉพาะ event ของ session ตัวเอง (join room ตาม sessionToken)
 * ลูกค้าเห็นสถานะอาหารเปลี่ยน และรู้ทันทีตอนแคชเชียร์ปิดบิล
 */
export function useCustomerLiveEvents(sessionToken: string | undefined) {
  const qc = useQueryClient()

  useSocket(
    sessionToken ? { sessionToken } : null,
    (socket) => {
      const token = sessionToken ?? ''
      const refetchOrders = () => qc.invalidateQueries({ queryKey: publicKeys.orders(token) })
      const refetchSession = () => qc.invalidateQueries({ queryKey: publicKeys.session(token) })

      socket.on('order.created', refetchOrders)
      socket.on('order.updated', refetchOrders)
      // จ่ายเงิน/ปิดโต๊ะ → session จะตอบ 400 แล้ว CustomerLayout เปลี่ยนเป็นหน้า "ปิดบิลแล้ว"
      socket.on('payment.created', () => {
        refetchOrders()
        refetchSession()
      })
      socket.on('payment.voided', () => {
        refetchOrders()
        refetchSession()
      })
      socket.on('table-session.closed', refetchSession)
      // ของหมด → ตัวเลือกในเมนูหายไป ต้องดึงเมนูใหม่ ไม่งั้นลูกค้ากดสั่งแล้วเจอ error
      socket.on('menu.updated', () => {
        qc.invalidateQueries({ queryKey: ['public', 'menu'] })
      })
    },
    () => {
      const token = sessionToken ?? ''
      qc.invalidateQueries({ queryKey: publicKeys.orders(token) })
      qc.invalidateQueries({ queryKey: publicKeys.session(token) })
    },
  )
}
