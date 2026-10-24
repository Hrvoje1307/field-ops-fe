import { cn } from 'cn'
import { MapPinIcon, NavigationIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { type MapPlace, mapsUrl } from '../lib/maps'

/** Opens the place in Google Maps in a new tab, or starts navigation to it. */
export function MapsLink({
  place,
  directions = false,
  children,
  className,
}: {
  place: MapPlace
  directions?: boolean
  /** Link text; defaults to "Otvori u kartama" / "Navigacija". */
  children?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const Icon = directions ? NavigationIcon : MapPinIcon
  return (
    <a
      href={mapsUrl(place, { directions })}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline [&>svg]:size-3.5',
        className,
      )}
    >
      <Icon aria-hidden="true" />
      {children ?? (directions ? t('location.directions') : t('location.openInMaps'))}
    </a>
  )
}
