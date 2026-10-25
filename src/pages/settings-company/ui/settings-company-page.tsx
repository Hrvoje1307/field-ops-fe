import { CompanyForm } from '@/features/settings/company'
import { CompanyUsage } from '@/features/settings/usage'

/** The company's data, settings and this month's usage (owner). */
export function SettingsCompanyPage() {
  return (
    <>
      <CompanyUsage />
      <CompanyForm />
    </>
  )
}
