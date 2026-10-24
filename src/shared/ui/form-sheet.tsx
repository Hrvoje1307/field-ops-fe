import type { SubmitEventHandler, ReactNode } from 'react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './sheet'

/** A side panel holding one form: title, scrolling fields, actions at the bottom. */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  onSubmit: SubmitEventHandler<HTMLFormElement>
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <form noValidate onSubmit={onSubmit} className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">{children}</div>
          <SheetFooter className="flex-row justify-end border-t">{footer}</SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
