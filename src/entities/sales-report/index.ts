export type { GetSalesReportParams, SalesReport } from '@/shared/api/generated/model'
export { getSalesReport, salesReportKeys, useGetSalesReport } from './api'
export {
  isValidPeriod,
  matchPreset,
  periodFromSearch,
  presetPeriod,
  REPORT_PRESETS,
  type ReportPeriod,
  type ReportPreset,
} from './model/period'
