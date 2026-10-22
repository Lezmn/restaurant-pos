import { ApiError } from './api-client'
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // ลองซ้ำ 1 ครั้งเฉพาะ error ฝั่ง server/เน็ต — 4xx (รวม 429) ลองซ้ำก็ได้ผลเดิม
      // และ 429 ยิ่งยิงซ้ำยิ่งโดนพักนานขึ้น
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: true,
    },
  },
})
