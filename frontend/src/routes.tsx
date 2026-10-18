// oxlint-disable react/only-export-components -- ไฟล์นี้เป็นตารางเส้นทาง ไม่ใช่โมดูลของ component
// การประกาศ lazy component ไว้ที่นี่คือจุดประสงค์ของไฟล์ ไม่ได้ทำให้ Fast Refresh เสีย
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { PageLoading } from '@/components/ui/PageLoading'
import { pageRoles } from '@/features/auth/permissions'
import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'

/**
 * โหลดโค้ดแยกตามหน้า (code splitting)
 * ลูกค้าที่สแกน QR จะไม่ต้องโหลดหน้าครัว / Dashboard / ตัวสร้าง QR ที่ไม่ได้ใช้
 *
 * Vite 8 ใช้ Rolldown ซึ่งแตกไฟล์ให้เองจาก dynamic import ตรงนี้
 * (option manualChunks ของ Rollup เดิมใช้ไม่ได้แล้ว ไม่ต้องตั้งค่าใน vite.config)
 */
const CustomerLayout = lazy(() =>
  import('@/components/layout/CustomerLayout').then((m) => ({
    default: m.CustomerLayout,
  })),
)
const EmployeeLayout = lazy(() =>
  import('@/components/layout/EmployeeLayout').then((m) => ({
    default: m.EmployeeLayout,
  })),
)
const OwnerLayout = lazy(() =>
  import('@/components/layout/OwnerLayout').then((m) => ({
    default: m.OwnerLayout,
  })),
)

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

const CustomerMenuPage = lazy(() =>
  import('@/pages/customer/MenuPage').then((m) => ({
    default: m.CustomerMenuPage,
  })),
)
const CustomerMenuItemPage = lazy(() =>
  import('@/pages/customer/MenuItemPage').then((m) => ({
    default: m.CustomerMenuItemPage,
  })),
)
const CustomerCartPage = lazy(() =>
  import('@/pages/customer/CartPage').then((m) => ({
    default: m.CustomerCartPage,
  })),
)
const CustomerBillPage = lazy(() =>
  import('@/pages/customer/BillPage').then((m) => ({
    default: m.CustomerBillPage,
  })),
)
const CustomerStatusPage = lazy(() =>
  import('@/pages/customer/StatusPage').then((m) => ({
    default: m.CustomerStatusPage,
  })),
)

const EmployeeHome = lazy(() =>
  import('@/pages/employee/EmployeeHome').then((m) => ({
    default: m.EmployeeHome,
  })),
)
const OrderPage = lazy(() =>
  import('@/pages/employee/OrderPage').then((m) => ({ default: m.OrderPage })),
)
const CheckPage = lazy(() =>
  import('@/pages/employee/CheckPage').then((m) => ({ default: m.CheckPage })),
)
const ManagePage = lazy(() =>
  import('@/pages/employee/ManagePage').then((m) => ({
    default: m.ManagePage,
  })),
)
const OrdersPage = lazy(() =>
  import('@/pages/employee/OrdersPage').then((m) => ({
    default: m.OrdersPage,
  })),
)
const TablesPage = lazy(() =>
  import('@/pages/employee/TablesPage').then((m) => ({
    default: m.TablesPage,
  })),
)
const RequestsPage = lazy(() =>
  import('@/pages/employee/RequestsPage').then((m) => ({
    default: m.RequestsPage,
  })),
)
const UsersPage = lazy(() =>
  import('@/pages/employee/UsersPage').then((m) => ({ default: m.UsersPage })),
)

const DashboardPage = lazy(() =>
  import('@/pages/owner/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)
const FinancePage = lazy(() =>
  import('@/pages/owner/FinancePage').then((m) => ({ default: m.FinancePage })),
)
const CashClosesPage = lazy(() =>
  import('@/pages/owner/CashClosesPage').then((m) => ({ default: m.CashClosesPage })),
)

/** ครอบ Suspense ให้ทุก element ที่โหลดแบบ lazy กันจอว่างระหว่างดึงไฟล์ */
const s = (node: ReactNode) => (
  <Suspense fallback={<PageLoading />}>{node}</Suspense>
)

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/employee" replace /> },

  // ---------- ฝั่งลูกค้า: เข้าผ่าน QR ไม่ต้อง login ----------
  {
    path: '/t/:token',
    element: s(<CustomerLayout />),
    children: [
      { index: true, element: s(<CustomerMenuPage />) },
      { path: 'menu/:menuItemId', element: s(<CustomerMenuItemPage />) },
      { path: 'cart', element: s(<CustomerCartPage />) },
      { path: 'bill', element: s(<CustomerBillPage />) },
      { path: 'status', element: s(<CustomerStatusPage />) },
    ],
  },

  // ---------- login หน้าเดียวใช้ได้ทุก role ----------
  // เดิมแยก /employee/login กับ /owner/login ทั้งที่ฟอร์มเหมือนกัน
  // เจ้าของร้านเข้าหน้าพนักงานได้อยู่แล้ว (มีปุ่ม Dashboard ที่หัวจอ)
  {
    path: '/login',
    element: s(
      <LoginPage
        title="เข้าสู่ระบบ"
        subtitle="ร้านอาหาร"
        redirectTo="/employee"
        hint="admin (ADMIN) · staff (STAFF) · kitchen (KITCHEN)"
      />,
    ),
  },
  // ลิงก์เก่าที่อาจถูก bookmark ไว้
  { path: '/employee/login', element: <Navigate to="/login" replace /> },
  { path: '/owner/login', element: <Navigate to="/login" replace /> },
  {
    path: '/employee',
    // ชั้นที่ 1: ต้องมี token ไม่งั้นเด้งไปหน้า login
    element: <ProtectedRoute />,
    children: [
      {
        element: s(<EmployeeLayout />),
        children: [
          { index: true, element: s(<EmployeeHome />) },

          // ชั้นที่ 2: เช็ค role ทีละหน้า ตรงกับ @Roles(...) ฝั่ง NestJS
          {
            element: <ProtectedRoute roles={pageRoles.order} />,
            children: [{ path: 'order', element: s(<OrderPage />) }],
          },
          {
            element: <ProtectedRoute roles={pageRoles.check} />,
            children: [{ path: 'check', element: s(<CheckPage />) }],
          },
          {
            element: <ProtectedRoute roles={pageRoles.manage} />,
            children: [{ path: 'manage', element: s(<ManagePage />) }],
          },
          {
            element: <ProtectedRoute roles={pageRoles.tables} />,
            children: [{ path: 'tables', element: s(<TablesPage />) }],
          },

          // หน้าที่ไม่มีในดีไซน์ แต่เขียนไว้แล้วและ backend รองรับ
          // เข้าถึงได้ทาง URL ตรง แต่ไม่ได้อยู่ในแถบล่าง
          {
            element: <ProtectedRoute roles={pageRoles.orders} />,
            children: [{ path: 'orders', element: s(<OrdersPage />) }],
          },
          {
            element: <ProtectedRoute roles={pageRoles.requests} />,
            children: [{ path: 'requests', element: s(<RequestsPage />) }],
          },
          {
            element: <ProtectedRoute roles={pageRoles.users} />,
            children: [{ path: 'users', element: s(<UsersPage />) }],
          },
        ],
      },
    ],
  },

  // ---------- ฝั่งเจ้าของร้าน: ADMIN เท่านั้น ----------
  {
    path: '/owner',
    element: (
      <ProtectedRoute roles={pageRoles.owner} fallbackPath="/employee" />
    ),
    children: [
      {
        element: s(<OwnerLayout />),
        children: [
          { index: true, element: <Navigate to="/owner/dashboard" replace /> },
          { path: 'dashboard', element: s(<DashboardPage />) },
          { path: 'finance', element: s(<FinancePage />) },
          { path: 'cash-closes', element: s(<CashClosesPage />) },
        ],
      },
    ],
  },

  { path: '*', element: s(<NotFoundPage />) },
])
