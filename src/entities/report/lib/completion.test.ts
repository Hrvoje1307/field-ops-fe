import { describe, expect, it } from 'vitest'

import { type CompletionBlocker, completionBlockers } from './completion'

const item = (label: string, isRequired: boolean, isDone: boolean) => ({
  id: label,
  position: 1,
  label,
  isRequired,
  isDone,
})
const report = {
  workDone: 'Gotovo.',
  checklist: [item('A', true, true), item('B', false, false)],
  signatureAttachmentId: 'sig',
}

const kinds = (blockers: CompletionBlocker[]) => blockers.map((b) => b.kind)

describe('completionBlockers', () => {
  it('is empty when everything the API asks for is there', () => {
    expect(completionBlockers(report, { requireSignature: true })).toEqual([])
  })

  it('names the required items that are open; optional ones do not block', () => {
    const open = {
      ...report,
      checklist: [item('A', true, false), item('B', true, false), item('C', false, false)],
    }
    expect(completionBlockers(open, { requireSignature: false })).toEqual([
      { kind: 'checklist', labels: ['A', 'B'] },
    ])
  })

  it('needs the work done, also when it is only spaces', () => {
    expect(
      kinds(completionBlockers({ ...report, workDone: null }, { requireSignature: false })),
    ).toEqual(['workDone'])
    expect(
      kinds(completionBlockers({ ...report, workDone: '   ' }, { requireSignature: false })),
    ).toEqual(['workDone'])
  })

  it('needs a signature only when the tenant requires one', () => {
    const unsigned = { ...report, signatureAttachmentId: null }
    expect(kinds(completionBlockers(unsigned, { requireSignature: true }))).toEqual(['signature'])
    expect(completionBlockers(unsigned, { requireSignature: false })).toEqual([])
  })
})
