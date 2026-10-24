import { type ReactNode } from 'react'

/** Temporary body for screens that come in a later step. */
export function PagePlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="max-w-2xl space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="space-y-1 text-muted-foreground">{children}</div>
    </section>
  )
}
