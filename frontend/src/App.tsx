import { ErrorBoundary } from '@/components/ErrorBoundary'
import { queryClient } from '@/lib/query-client'
import { router } from '@/routes'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
