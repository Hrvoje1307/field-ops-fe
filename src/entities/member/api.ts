import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  CreateInvitationBody,
  Invitation,
  Member,
  UpdateMemberBody,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

import { memberHasSalesAccess } from './lib/sales-access'
import { MEMBERS_STALE_TIME } from './const'

export const memberKeys = {
  all: ['members'] as const,
  invitations: ['members', 'invitations'] as const,
}

/** A member's role or being active shows in the technicians, on the board and in plans. */
const MEMBER_ROOTS = [...JOB_DATA_ROOTS, 'members']

// --- GET (used as queryFn) ---------------------------------------------------

/** Everyone with a membership in the tenant (the office sees them all). */
export async function listMembers(signal?: AbortSignal) {
  return apiFetch<Member[]>('/users', { signal })
}

/** Invitations that are still open. */
export async function listInvitations(signal?: AbortSignal) {
  return apiFetch<Invitation[]>('/users/invitations', { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/** Owner only. 409 when the change would leave the tenant without an active owner. */
export async function updateMember(
  userId: string,
  body: UpdateMemberBody,
  idempotencyKey?: string,
) {
  return apiFetch<Member>(path`/users/${userId}`, { method: 'PUT', json: body, idempotencyKey })
}

/** 409 when the person is already a member or already invited. */
export async function createInvitation(body: CreateInvitationBody, idempotencyKey?: string) {
  return apiFetch<Invitation>('/users/invitations', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

export async function revokeInvitation(id: string) {
  return apiFetch<undefined>(path`/users/invitations/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useListMembers() {
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: ({ signal }) => listMembers(signal),
    staleTime: MEMBERS_STALE_TIME,
  })
}

export function useListInvitations() {
  return useQuery({
    queryKey: memberKeys.invitations,
    queryFn: ({ signal }) => listInvitations(signal),
    staleTime: MEMBERS_STALE_TIME,
  })
}

export function useUpdateMember() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { userId: string; body: UpdateMemberBody }) =>
      updateMember(request.userId, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, MEMBER_ROOTS)
    },
  })
}

export function useCreateInvitation() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: CreateInvitationBody) => createInvitation(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, ['members'])
    },
  })
}

export function useRevokeInvitation() {
  return useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, ['members']),
  })
}

/** The active members who have sales access: whom a personal mailbox can belong to. */
export function useSalesMembers() {
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: ({ signal }) => listMembers(signal),
    staleTime: MEMBERS_STALE_TIME,
    select: (members) =>
      members.filter((member) => member.isActive && memberHasSalesAccess(member)),
  })
}
