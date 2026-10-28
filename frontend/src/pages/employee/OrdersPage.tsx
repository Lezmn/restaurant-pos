import { Badge } from '@/components/ui/Badge'
import { LoadError } from '@/components/ui/LoadError'
import { PageHeader } from '@/components/ui/PageHeader'
import { useOrders } from '@/features/orders/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import { itemTotal, orderTotal } from '@/features/orders/order-total'
import { statusLabel, statusTone } from '@/features/orders/order-status'

export function OrdersPage() {
  const ordersQuery = useOrders()
  const { data: orders, isPending } = ordersQuery

  return (
    <div>
      <PageHeader title="ออเดอร์" description="ออเดอร์ทั้งหมดของวันนี้" />

      {ordersQuery.isError && (
        <LoadError
          what="ออเดอร์"
          stale={Boolean(orders)}
          error={ordersQuery.error}
          onRetry={() => ordersQuery.refetch()}
        />
      )}
      {isPending && <p className="text-sm text-gray-500">กำลังโหลด...</p>}

      <div className="space-y-4">
        {orders?.map((order) => (
          <div
            key={order.id}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {order.placeLabel} · #{order.orderRef}
                </p>
                <p className="text-xs text-gray-500">
                  {formatTime(order.createdAt)}
                </p>
              </div>
              <Badge tone={statusTone[order.status]}>
                {statusLabel[order.status]}
              </Badge>
            </div>

            <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span className="text-gray-700">
                    {item.quantity}× {item.menuItemName}
                    {item.optionNames.length > 0 && (
                      <span className="text-gray-500">
                        {' '}
                        ({item.optionNames.join(', ')})
                      </span>
                    )}
                    {item.note && (
                      <span className="text-amber-800"> — {item.note}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-gray-500">
                    {formatBaht(itemTotal(item))}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-3 border-t border-gray-100 pt-3 text-right text-sm font-semibold text-gray-900">
              รวม {formatBaht(orderTotal(order))}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
