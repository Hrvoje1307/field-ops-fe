import { describe, expect, it } from 'vitest'

import type { RoutePlan } from '@/entities/dispatch'

import { baseId, isCopy } from '@/shared/lib/drag-move'

import { planLayout, routesFromLayout, UNASSIGNED_ID } from './plan-layout'

const stop = (jobId: string, sequence: number) => ({ jobId, sequence })
const plan: Pick<RoutePlan, 'routes' | 'unassigned'> = {
  routes: [
    { id: 'r1', technicianId: 'a', stops: [stop('j2', 2), stop('j1', 1), stop('crew', 3)] },
    { id: 'r2', technicianId: 'b', stops: [stop('crew', 1)] },
  ],
  unassigned: [{ jobId: 'j9', reason: 'skills' }],
}

describe('planLayout', () => {
  it("lists each technician's stops in visit order, the unplaced jobs, and empty columns", () => {
    const layout = planLayout(plan, ['a', 'b', 'c'])
    expect(layout.a?.map(baseId)).toEqual(['j1', 'j2', 'crew'])
    expect(layout.b?.map(baseId)).toEqual(['crew'])
    expect(layout.c).toEqual([])
    expect(layout[UNASSIGNED_ID]).toEqual(['j9'])
  })

  it('gives a job in several routes one id per route, and marks them as crew items', () => {
    const layout = planLayout(plan, ['a', 'b'])
    expect(layout.a?.[2]).toBe('crew@a')
    expect(layout.b?.[0]).toBe('crew@b')
    expect(isCopy('crew@a')).toBe(true)
    expect(isCopy('j1')).toBe(false)
  })

  it('shows a technician who only has a route in the plan', () => {
    expect(planLayout(plan, []).a).toHaveLength(3)
  })
})

describe('routesFromLayout', () => {
  it('sends the routes with their jobs, leaving out empty routes and the unplaced list', () => {
    const layout = { a: ['j1', 'crew@a'], b: [], c: ['j3'], [UNASSIGNED_ID]: ['j9'] }
    expect(routesFromLayout(layout)).toEqual([
      { technicianId: 'a', jobIds: ['j1', 'crew'] },
      { technicianId: 'c', jobIds: ['j3'] },
    ])
  })
})
