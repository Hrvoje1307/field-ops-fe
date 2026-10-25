import { describe, expect, it } from 'vitest'

import type { DispatchBoard } from '@/entities/dispatch'
import type { JobSummary } from '@/entities/job'

import { optimizeChoices } from './optimize-choices'

const job = (id: string, status: JobSummary['status']) => ({ id, status }) as JobSummary
const column = (id: string, isWorkingDay: boolean, jobs: JobSummary[]) =>
  ({ technician: { id }, isWorkingDay, jobs }) as unknown as DispatchBoard['columns'][number]

describe('optimizeChoices', () => {
  const board = {
    date: '2026-10-27',
    unassigned: [job('q1', 'new'), job('q2', 'scheduled'), job('q3', 'on_hold')],
    columns: [
      column('a', true, [job('s1', 'scheduled'), job('s2', 'on_site'), job('s3', 'confirmed')]),
      column('b', false, []),
    ],
  } as DispatchBoard

  it('offers the queue, and scheduled jobs that are not under way', () => {
    const choices = optimizeChoices(board)
    expect(choices.queued.map((j) => j.id)).toEqual(['q1', 'q2'])
    expect(choices.scheduled.map((j) => j.id)).toEqual(['s1', 's3'])
  })

  it('lists a job for several technicians once', () => {
    const crew = job('crew', 'scheduled')
    const twice = {
      ...board,
      columns: [column('a', true, [crew]), column('b', true, [crew])],
    }
    expect(optimizeChoices(twice).scheduled.map((j) => j.id)).toEqual(['crew'])
  })

  it('splits technicians by whether they work that day', () => {
    const choices = optimizeChoices(board)
    expect(choices.working.map((c) => c.technician.id)).toEqual(['a'])
    expect(choices.dayOff.map((c) => c.technician.id)).toEqual(['b'])
  })
})
