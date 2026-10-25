import { CopyIcon, PlusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type Invitation, useListInvitations, useRevokeInvitation } from '@/entities/member'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  ConfigList,
  ConfigListEmpty,
  ConfigListHeader,
  ConfigListItem,
} from '@/shared/ui/config-list'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { Skeleton } from '@/shared/ui/skeleton'

import { InviteSheet } from './invite-sheet'

export function InvitationsSection() {
  const { t } = useTranslation()
  const { formatDate } = useTenantFormat()
  const invitations = useListInvitations()
  const [inviting, setInviting] = useState(false)
  const [revoking, setRevoking] = useState<Invitation | null>(null)

  return (
    <section aria-label={t('settings.team.invitations.title')} className="space-y-4">
      <ConfigListHeader
        title={t('settings.team.invitations.title')}
        description={t('settings.team.invitations.description')}
        action={
          <Button
            onClick={() => {
              setInviting(true)
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('settings.team.invitations.add')}
          </Button>
        }
      />
      {invitations.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.team.invitations.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void invitations.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !invitations.data ? (
        <Skeleton className="h-24" />
      ) : invitations.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.team.invitations.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.team.invitations.list')}>
          {invitations.data.map((invitation) => (
            <ConfigListItem
              key={invitation.id}
              title={
                <>
                  {invitation.email}
                  <Badge variant="secondary" className="ml-2 align-middle">
                    {t(`roles.${invitation.role}`)}
                  </Badge>
                </>
              }
              meta={t('settings.team.invitations.expires', {
                date: formatDate(invitation.expiresAt.slice(0, 10)),
              })}
              actions={
                <>
                  {invitation.inviteUrl && (
                    <CopyLinkButton url={invitation.inviteUrl} email={invitation.email} />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('settings.team.invitations.revoke', { email: invitation.email })}
                    onClick={() => {
                      setRevoking(invitation)
                    }}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </>
              }
            />
          ))}
        </ConfigList>
      )}
      {inviting && (
        <InviteSheet
          onClose={() => {
            setInviting(false)
          }}
        />
      )}
      <RevokeDialog
        invitation={revoking}
        onClose={() => {
          setRevoking(null)
        }}
      />
    </section>
  )
}

function CopyLinkButton({ url, email }: { url: string; email: string }) {
  const { t } = useTranslation()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('settings.team.invitations.copyLink', { email })}
      onClick={() => {
        navigator.clipboard.writeText(url).then(
          () => {
            toast.success(t('settings.team.invitations.new.copied'))
          },
          () => {
            toast.error(t('settings.team.invitations.new.copyFailed'))
          },
        )
      }}
    >
      <CopyIcon aria-hidden="true" />
    </Button>
  )
}

function RevokeDialog({
  invitation,
  onClose,
}: {
  invitation: Invitation | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const revoke = useRevokeInvitation()
  const [error, setError] = useState<string | null>(null)
  // Keeps the address while the dialog closes
  const [last, setLast] = useState<Invitation | null>(null)
  if (invitation && invitation !== last) {
    setLast(invitation)
    setError(null)
  }
  const email = (invitation ?? last)?.email ?? ''
  return (
    <ConfirmDialog
      open={invitation !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.team.invitations.revokeDialog.title')}
      description={t('settings.team.invitations.revokeDialog.description', { email })}
      confirmLabel={t('settings.team.invitations.revokeDialog.confirm')}
      pending={revoke.isPending}
      error={error}
      onConfirm={() => {
        if (!invitation) return
        revoke.mutate(invitation.id, {
          onSuccess: () => {
            toast.success(t('settings.team.invitations.revokeDialog.done'))
            onClose()
          },
          onError: () => {
            setError(t('settings.team.invitations.revokeDialog.failed'))
          },
        })
      }}
    />
  )
}
