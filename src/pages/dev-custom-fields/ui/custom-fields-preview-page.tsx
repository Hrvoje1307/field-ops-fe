import { CustomFieldsPreview } from '@/features/dev/custom-field-preview'

/** Developer preview of the custom-field renderer (mock mode only). */
export function CustomFieldsPreviewPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <CustomFieldsPreview />
    </main>
  )
}
