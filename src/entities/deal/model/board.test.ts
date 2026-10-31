import { describe, expect, it } from 'vitest'

import type { DealSummary, SalesBoard } from '@/shared/api/generated/model'

import { daysSince, findOnBoard, isFollowUpDue, moveOnBoard } from './board'

const stage = (id: string, kind: 'open' | 'won' | 'lost') => ({
  id,
  name: id,
  color: '#112233',
  kind,
  position: 0,
  isActive: true,
})
const deal = (id: string, stageId: string, value: string | null): DealSummary => ({
  id,
  title: id,
  stage: { id: stageId, name: stageId, color: '#112233', kind: 'open' },
  value,
  awaitingReply: false,
  isStale: false,
  threadCount: 0,
  createdAt: '2026-10-01T00:00:00Z',
})
const board: SalesBoard = {
  columns: [
    {
      stage: stage('a', 'open'),
      deals: [deal('d1', 'a', '100.50'), deal('d2', 'a', null)],
      totalCount: 2,
      totalValue: '100.50',
    },
    {
      stage: stage('b', 'open'),
      deals: [deal('d3', 'b', '10.00')],
      totalCount: 1,
      totalValue: '10.00',
    },
    { stage: stage('c', 'lost'), deals: [], totalCount: 0, totalValue: null },
  ],
}

describe('moveOnBoard', () => {
  it('puts the deal first in the target and keeps the sums as decimal strings', () => {
    const next = moveOnBoard(board, 'd1', 'b')
    expect(next.columns.map((c) => c.deals.map((d) => d.id))).toEqual([['d2'], ['d1', 'd3'], []])
    expect(next.columns.map((c) => c.totalCount)).toEqual([1, 2, 0])
    expect(next.columns.map((c) => c.totalValue)).toEqual(['0.00', '110.50', null])
    expect(findOnBoard(next, 'd1')?.stage.id).toBe('b')
  })
  it('does not touch the board for the same or an unknown stage', () => {
    expect(moveOnBoard(board, 'd1', 'a')).toBe(board)
    expect(moveOnBoard(board, 'd1', 'zzz')).toBe(board)
    expect(moveOnBoard(board, 'nope', 'b')).toBe(board)
  })
  it('keeps the API order of the columns', () => {
    expect(moveOnBoard(board, 'd3', 'c').columns.map((c) => c.stage.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('dates', () => {
  const now = new Date('2026-10-28T09:00:00Z').getTime()
  it('knows when a follow-up is due', () => {
    expect(isFollowUpDue({ nextFollowUpAt: '2026-10-28T08:00:00Z' }, now)).toBe(true)
    expect(isFollowUpDue({ nextFollowUpAt: '2026-10-29T08:00:00Z' }, now)).toBe(false)
    expect(isFollowUpDue({ nextFollowUpAt: null }, now)).toBe(false)
  })
  it('counts whole days', () => {
    expect(daysSince('2026-10-25T09:00:00Z', now)).toBe(3)
    expect(daysSince('2026-10-29T09:00:00Z', now)).toBe(0)
  })
})
