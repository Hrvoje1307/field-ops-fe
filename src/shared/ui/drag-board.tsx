import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from 'cn'
import { GripVerticalIcon } from 'lucide-react'
import { type ReactNode, useCallback, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type DragLayout, type DragMove, resolveMove } from '@/shared/lib/drag-move'

const LIST_PREFIX = 'list:'

interface ItemData {
  type: 'item'
  containerId: string
}

/**
 * Lists of items that can be moved between and within the lists: pointer or keyboard.
 * It only reports the move (`onMove`); the caller saves it and the lists redraw from
 * what it gets back. Names are for the screen reader.
 */
export function DragBoard({
  layout,
  nameOf,
  listNameOf,
  onMove,
  renderOverlay,
  children,
}: {
  /** Item ids per list, in order. */
  layout: DragLayout
  nameOf: (itemId: string) => string
  listNameOf: (listId: string) => string
  onMove: (move: DragMove) => void
  renderOverlay: (itemId: string) => ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const containerOf = useCallback(
    (id: string) => Object.keys(layout).find((listId) => layout[listId]?.includes(id)),
    [layout],
  )

  const targetName = useCallback(
    (overId: string | undefined, overData: unknown) => {
      if (!overId) return ''
      if (overId.startsWith(LIST_PREFIX)) return listNameOf(overId.slice(LIST_PREFIX.length))
      const containerId = (overData as { containerId?: string } | undefined)?.containerId
      return containerId ? listNameOf(containerId) : ''
    },
    [listNameOf],
  )

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => t('common.drag.pickedUp', { item: nameOf(String(active.id)) }),
      onDragOver: ({ active, over }) =>
        over
          ? t('common.drag.movedOver', {
              item: nameOf(String(active.id)),
              target: targetName(String(over.id), over.data.current),
            })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t('common.drag.dropped', {
              item: nameOf(String(active.id)),
              target: targetName(String(over.id), over.data.current),
            })
          : t('common.drag.cancelled'),
      onDragCancel: () => t('common.drag.cancelled'),
    }),
    [nameOf, t, targetName],
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const from = containerOf(String(active.id))
    if (!from) return
    const overId = String(over.id)
    const isList = overId.startsWith(LIST_PREFIX)
    const containerId = isList
      ? overId.slice(LIST_PREFIX.length)
      : (over.data.current as ItemData | undefined)?.containerId
    if (!containerId) return
    const translated = active.rect.current.translated
    const below = translated
      ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
      : false
    const move = resolveMove(
      layout,
      { id: String(active.id), containerId: from },
      { id: overId, containerId, isList, below },
    )
    if (move) onMove(move)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        // An item under the pointer wins over the list around it
        const within = pointerWithin(args)
        const items = within.filter((hit) => !String(hit.id).startsWith(LIST_PREFIX))
        if (items.length > 0) return items
        if (within.length > 0) return within
        return closestCenter(args)
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('common.drag.instructions') },
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
      }}
    >
      {children}
      <DragOverlay>{activeId ? renderOverlay(activeId) : null}</DragOverlay>
    </DndContext>
  )
}

/** A list that accepts items (also when empty). Renders a `ul`; its items are `DragItem`s. */
export function DragList({
  id,
  itemIds,
  className,
  children,
}: {
  id: string
  itemIds: readonly string[]
  className?: string
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LIST_PREFIX}${id}` })
  return (
    <SortableContext items={[...itemIds]} strategy={verticalListSortingStrategy}>
      <ul
        ref={setNodeRef}
        data-drop-target={isOver ? 'true' : undefined}
        className={cn(
          'min-h-12 rounded-lg transition-colors data-[drop-target=true]:bg-primary/5 data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-primary/30',
          className,
        )}
      >
        {children}
      </ul>
    </SortableContext>
  )
}

/**
 * One movable item in a `DragList`. The drag handle is handed to `children` so it can
 * sit where the item wants it; `disabled` items stay in the list but cannot be moved.
 */
export function DragItem({
  id,
  listId,
  disabled = false,
  handleLabel,
  className,
  testId,
  children,
}: {
  id: string
  listId: string
  disabled?: boolean
  /** Accessible name of the handle. */
  handleLabel: string
  className?: string
  testId?: string
  children: (handle: ReactNode) => ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled, data: { type: 'item', containerId: listId } satisfies ItemData })
  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={handleLabel}
      className="-ml-1 inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVerticalIcon aria-hidden="true" className="size-4" />
    </button>
  )
  return (
    <li
      ref={setNodeRef}
      data-testid={testId}
      data-dragging={isDragging ? 'true' : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40', className)}
    >
      {children(handle)}
    </li>
  )
}

/**
 * A titled column of cards that accepts drops (also when it has none): the day board's
 * columns and a route plan's routes look and behave the same.
 */
export function DragColumn({
  id,
  title,
  label,
  subtitle,
  itemIds,
  empty,
  testId,
  className,
  children,
}: {
  id: string
  title: ReactNode
  /** Accessible name when the title isn't plain text. */
  label?: string
  subtitle: ReactNode
  itemIds: readonly string[]
  /** Said when there is no card. */
  empty: string
  testId: string
  className?: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={label ? undefined : headingId}
      aria-label={label}
      data-testid={testId}
      className={cn('w-72 shrink-0 space-y-3 rounded-xl border p-3', className)}
    >
      <header className="space-y-1">
        <h2 id={headingId} className="font-semibold">
          {title}
        </h2>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </header>
      <DragList id={id} itemIds={itemIds} className="min-h-24 space-y-2">
        {children}
        {itemIds.length === 0 && <li className="p-1 text-sm text-muted-foreground">{empty}</li>}
      </DragList>
    </section>
  )
}
