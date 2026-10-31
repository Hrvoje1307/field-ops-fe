export interface SalesTab {
  to: '/sales' | '/sales/board' | '/sales/inbox' | '/sales/report'
  labelKey: 'sales.nav.today' | 'sales.nav.board' | 'sales.nav.inbox' | 'sales.nav.report'
  /** `/sales` is the Today screen: it is active only on itself. */
  exact?: boolean
}

/** The screens of the Prodaja module, in the order they are listed. */
export const SALES_TABS: readonly SalesTab[] = [
  { to: '/sales', labelKey: 'sales.nav.today', exact: true },
  { to: '/sales/board', labelKey: 'sales.nav.board' },
  { to: '/sales/inbox', labelKey: 'sales.nav.inbox' },
  { to: '/sales/report', labelKey: 'sales.nav.report' },
]
