import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type ChecklistItem, useUpdateChecklist } from '@/entities/report'
import { isConflict } from '@/shared/api/api-error'

import { Section } from './section'

/** Big touch rows; a tick shows at once and is taken back if it could not be saved. */
export function ChecklistSection({ jobId, items }: { jobId: string; items: ChecklistItem[] }) {
  const { t } = useTranslation()
  const update = useUpdateChecklist(jobId)
  // A controlled checkbox snaps back unless the new value is rendered right away, so a
  // tick is held here until its request is over (`n` tells which request it belongs to)
  const [held, setHeld] = useState<Record<string, { value: boolean; n: number }>>({})
  const done = items.filter((item) => item.isDone).length
  return (
    <Section
      title={t('report.checklist.title')}
      aside={
        items.length > 0 ? t('report.checklist.progress', { done, total: items.length }) : null
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('report.checklist.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:bg-muted/40">
                <input
                  type="checkbox"
                  className="size-6 shrink-0 accent-primary"
                  checked={held[item.id]?.value ?? item.isDone}
                  onChange={(event) => {
                    const value = event.target.checked
                    const n = (held[item.id]?.n ?? 0) + 1
                    setHeld((current) => ({ ...current, [item.id]: { value, n } }))
                    update.mutate([{ id: item.id, isDone: value }], {
                      onError: (error) => {
                        if (!isConflict(error)) toast.error(t('report.checklist.failed'))
                      },
                      onSettled: () => {
                        setHeld((current) => {
                          if (current[item.id]?.n !== n) return current
                          return Object.fromEntries(
                            Object.entries(current).filter(([id]) => id !== item.id),
                          )
                        })
                      },
                    })
                  }}
                />
                <span className="flex-1 text-base">{item.label}</span>
                {item.isRequired && (
                  <span className="text-xs text-muted-foreground">
                    {t('report.checklist.required')}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
