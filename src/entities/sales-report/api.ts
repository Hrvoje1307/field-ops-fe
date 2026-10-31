import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/shared/api/api-fetch'
import type { GetSalesReportParams, SalesReport } from '@/shared/api/generated/model'

import { SALES_REPORT_STALE_TIME } from './const'

export const salesReportKeys = {
  all: ['sales-reports'] as const,
  summary: (params: GetSalesReportParams) => ['sales-reports', 'summary', params] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** Conversion, time per stage, lost reasons for `from`–`to` (tenant-local dates). */
export async function getSalesReport(params: GetSalesReportParams, signal?: AbortSignal) {
  return apiFetch<SalesReport>('/sales/reports/summary', { query: params, signal })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useGetSalesReport(params: GetSalesReportParams) {
  return useQuery({
    queryKey: salesReportKeys.summary(params),
    queryFn: ({ signal }) => getSalesReport(params, signal),
    staleTime: SALES_REPORT_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}
