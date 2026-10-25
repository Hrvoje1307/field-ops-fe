import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type JobMaterial, useDeleteJobMaterial } from '@/entities/report'
import { isConflict } from '@/shared/api/api-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Button } from '@/shared/ui/button'

import { AddMaterialDialog } from './add-material-dialog'
import { Section } from './section'

export function MaterialsSection({
  jobId,
  materials,
  total,
}: {
  jobId: string
  materials: JobMaterial[]
  /** Decimal string from the API. */
  total: string | undefined
}) {
  const { t } = useTranslation()
  const { formatMoney, formatNumber } = useTenantFormat()
  const remove = useDeleteJobMaterial(jobId)
  const [adding, setAdding] = useState(false)
  const quantity = (value: string) => formatNumber(Number(value))
  return (
    <Section title={t('report.materials.title')}>
      {materials.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('report.materials.empty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {materials.map((material) => (
            <li key={material.id} className="flex items-center gap-3 p-3">
              <span className="flex-1 text-base">
                {material.name}
                <span className="block text-sm text-muted-foreground">
                  {quantity(material.quantity)} {material.unit} · {formatMoney(material.lineTotal)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-12"
                aria-label={t('report.materials.remove', { name: material.name })}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(material.id, {
                    onError: (error) => {
                      if (!isConflict(error)) toast.error(t('report.materials.removeFailed'))
                    },
                  })
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {materials.length > 0 && total !== undefined && (
        <p className="text-right text-sm font-medium">
          {t('report.materials.total', { amount: formatMoney(total) })}
        </p>
      )}
      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full"
        onClick={() => {
          setAdding(true)
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t('report.materials.add')}
      </Button>
      {adding && (
        <AddMaterialDialog
          jobId={jobId}
          onClose={() => {
            setAdding(false)
          }}
        />
      )}
    </Section>
  )
}
