import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { assetTypeQueries } from '@/entities/asset'
import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  customFieldFormValues,
  CustomFieldInputs,
  type CustomFieldScope,
  type CustomFieldValues,
  CustomFieldValuesView,
  useCustomFieldDefinitions,
} from '@/entities/custom-field'
import { useMe } from '@/entities/session'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Field, FieldLabel } from '@/shared/ui/field'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Skeleton } from '@/shared/ui/skeleton'

import { PREVIEW_NS } from '../config/i18n'
import { storedValues } from '../lib/stored-values'
import { type Sample, useSample } from '../model/use-sample'

const ASSET_PREFIX = 'asset:'

function scopeOf(choice: string): CustomFieldScope {
  if (choice.startsWith(ASSET_PREFIX)) {
    return { entity: 'asset', assetTypeId: choice.slice(ASSET_PREFIX.length) }
  }
  return { entity: choice as Exclude<CustomFieldScope['entity'], 'asset'> }
}

/**
 * Developer preview (mock mode only): the active tenant's custom fields for each
 * entity, in edit and read mode. Nothing is sent to the server.
 */
export function CustomFieldsPreviewPage() {
  const { t } = useTranslation(PREVIEW_NS)
  const me = useMe()
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground" data-testid="tenant-name">
          {me.tenant.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>
      {/* A tenant switch starts over: asset types and fields differ per tenant */}
      <Preview key={me.tenant.id} />
    </main>
  )
}

function Preview() {
  const { t } = useTranslation(PREVIEW_NS)
  const { t: tApp } = useTranslation()
  const id = useId()
  const assetTypes = useQuery(assetTypeQueries.list())
  const [choice, setChoice] = useState('client')
  const scope = scopeOf(choice)

  return (
    <div className="space-y-6">
      <Field className="max-w-xs">
        <FieldLabel htmlFor={id}>{t('entity')}</FieldLabel>
        <NativeSelect
          id={id}
          className="w-full"
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value)
          }}
        >
          <NativeSelectOption value="client">
            {tApp('customField.entity.client')}
          </NativeSelectOption>
          <NativeSelectOption value="location">
            {tApp('customField.entity.location')}
          </NativeSelectOption>
          <NativeSelectOption value="job">{tApp('customField.entity.job')}</NativeSelectOption>
          {assetTypes.data?.map((assetType) => (
            <NativeSelectOption key={assetType.id} value={`${ASSET_PREFIX}${assetType.id}`}>
              {`${tApp('customField.entity.asset')}: ${assetType.name}`}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <ScopePreview key={choice} scope={scope} />
    </div>
  )
}

function ScopePreview({ scope }: { scope: CustomFieldScope }) {
  const { t } = useTranslation(PREVIEW_NS)
  const { t: tApp } = useTranslation()
  const definitions = useCustomFieldDefinitions(scope)
  const { pending, sample } = useSample(scope)

  if (definitions.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    )
  }
  if (definitions.isPending || pending) {
    return (
      <div className="grid gap-6 md:grid-cols-2" aria-busy="true">
        <span className="sr-only">{tApp('common.loading')}</span>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (definitions.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noFields')}</p>
  }
  return <PreviewForm definitions={definitions.data} sample={sample} />
}

function PreviewForm({
  definitions,
  sample,
}: {
  definitions: CustomFieldDefinition[]
  sample: Sample | null
}) {
  const { t } = useTranslation(PREVIEW_NS)
  const { locale } = useTenantFormat()
  const schema = useMemo(
    () => z.object({ customFields: buildCustomFieldsSchema(definitions) }),
    [definitions],
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { customFields: customFieldFormValues(definitions, sample?.values, { locale }) },
  })
  const [request, setRequest] = useState<CustomFieldValues | null>(null)
  const shown = request ? storedValues(definitions, sample?.values, request) : sample?.values

  const submit = form.handleSubmit((data) => {
    setRequest(data.customFields)
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {sample ? t('sample', { name: sample.name }) : t('noSample')}
      </p>
      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="custom-fields-edit" className="space-y-4">
          <h2 id="custom-fields-edit" className="text-lg font-semibold">
            {t('edit')}
          </h2>
          <FormProvider {...form}>
            <form noValidate className="space-y-6" onSubmit={(event) => void submit(event)}>
              <CustomFieldInputs definitions={definitions} />
              <Button type="submit">{t('check')}</Button>
            </form>
          </FormProvider>
        </section>
        <section aria-labelledby="custom-fields-read" className="space-y-4">
          <h2 id="custom-fields-read" className="text-lg font-semibold">
            {t('read')}
          </h2>
          <CustomFieldValuesView definitions={definitions} values={shown} />
          {request && (
            <div className="space-y-2">
              <p role="status" className="text-sm font-medium text-green-800">
                {t('valid')}
              </p>
              <h3 className="text-sm font-medium">{t('payload')}</h3>
              <pre
                data-testid="payload"
                className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"
              >
                {JSON.stringify(request, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
