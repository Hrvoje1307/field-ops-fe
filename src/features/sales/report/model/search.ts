import { z } from 'zod'

/** The report's address: the period (tenant-local dates) and, for owners, one person. */
export const reportSearchSchema = z.object({
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  owner: z.string().optional().catch(undefined),
})

export type ReportSearch = z.infer<typeof reportSearchSchema>
export type ReportSearchChange = (patch: Partial<ReportSearch>) => void
