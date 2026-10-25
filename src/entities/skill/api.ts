import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type { Skill, SkillInput } from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

import { SKILLS_STALE_TIME } from './const'

export const skillKeys = {
  all: ['skills'] as const,
}

/**
 * What a skill touches besides the list: technicians carry skills, job types require
 * them, and the schedule warns about missing ones.
 */
const SKILL_ROOTS = [...JOB_DATA_ROOTS, 'skills', 'job-types']

// --- GET (used as queryFn) ---------------------------------------------------

export async function listSkills(signal?: AbortSignal) {
  return apiFetch<Skill[]>('/skills', { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/** 409 when a skill of that name exists. */
export async function createSkill(body: SkillInput, idempotencyKey?: string) {
  return apiFetch<Skill>('/skills', { method: 'POST', json: body, idempotencyKey })
}

export async function updateSkill(id: string, body: SkillInput, idempotencyKey?: string) {
  return apiFetch<Skill>(path`/skills/${id}`, { method: 'PUT', json: body, idempotencyKey })
}

/** The contract says nothing about a skill still in use: it goes from technicians too. */
export async function deleteSkill(id: string) {
  return apiFetch<undefined>(path`/skills/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The tenant's skills. */
export function useListSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: ({ signal }) => listSkills(signal),
    staleTime: SKILLS_STALE_TIME,
  })
}

export function useCreateSkill() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: SkillInput) => createSkill(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, SKILL_ROOTS)
    },
  })
}

export function useUpdateSkill() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: SkillInput }) =>
      updateSkill(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, SKILL_ROOTS)
    },
  })
}

export function useDeleteSkill() {
  return useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, SKILL_ROOTS),
  })
}
