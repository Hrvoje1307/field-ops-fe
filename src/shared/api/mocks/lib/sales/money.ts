/** Decimal strings added as integer cents; never a float. */
const toCents = (amount: string): bigint => {
  const [whole = '0', fraction = ''] = amount.split('.')
  return (
    BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2)) * (whole.startsWith('-') ? -1n : 1n)
  )
}

const fromCents = (cents: bigint): string => {
  const sign = cents < 0n ? '-' : ''
  const abs = cents < 0n ? -cents : cents
  return `${sign}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`
}

/** Sum of the amounts, or null when there is none to add. */
export function sumMoney(amounts: (string | null | undefined)[]): string | null {
  const present = amounts.filter((a): a is string => typeof a === 'string' && a !== '')
  if (present.length === 0) return null
  return fromCents(present.reduce((sum, a) => sum + toCents(a), 0n))
}
