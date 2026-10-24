/** API money: a decimal string such as "12.50" (never a float). */
export type MoneyString = string

/**
 * Formats a decimal string in the tenant's locale and currency.
 * Intl formats numeric strings exactly, so the value is never parsed to a float.
 */
export function formatMoney(
  amount: MoneyString,
  { locale, currency }: { locale: string; currency: string },
): string {
  if (!/^-?\d+(\.\d+)?$/.test(amount)) throw new RangeError(`Invalid money amount: ${amount}`)
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    amount as `${number}`,
  )
}
