import { cn } from 'cn'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './button'

const MASK = '••••••'

interface SensitiveValueProps {
  /** The secret; not rendered at all (not just hidden) until revealed. */
  children: ReactNode
  /** What the value is, for the button's accessible name (e.g. the field label). */
  label: string
  /** Hide again after revealing (read views). Edit forms reveal one way. */
  hideable?: boolean
  onReveal?: () => void
  /** Button size; field screens use larger touch targets. */
  size?: 'xs' | 'sm' | 'default' | 'lg'
  className?: string
}

/** A secret shown as a mask with a "Prikaži" button; same length mask for every value. */
export function SensitiveValue({
  children,
  label,
  hideable = true,
  onReveal,
  size = 'sm',
  className,
}: SensitiveValueProps) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState(false)

  if (revealed) {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
        {children}
        {hideable && (
          <Button
            type="button"
            variant="ghost"
            size={size}
            aria-label={t('common.sensitive.hideLabel', { label })}
            onClick={() => {
              setRevealed(false)
            }}
          >
            <EyeOffIcon aria-hidden="true" />
            {t('common.sensitive.hide')}
          </Button>
        )}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span role="img" aria-label={t('common.sensitive.masked')} className="tracking-widest">
        {MASK}
      </span>
      <Button
        type="button"
        variant="outline"
        size={size}
        aria-label={t('common.sensitive.showLabel', { label })}
        onClick={() => {
          setRevealed(true)
          onReveal?.()
        }}
      >
        <EyeIcon aria-hidden="true" />
        {t('common.sensitive.show')}
      </Button>
    </span>
  )
}
