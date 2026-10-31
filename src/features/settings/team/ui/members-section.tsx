import { PencilIcon, WrenchIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { hasSalesPlan, useMe } from '@/entities/auth'
import { useListDepots } from '@/entities/depot'
import {
  canSetSalesAccess,
  type Member,
  memberHasSalesAccess,
  useListMembers,
} from '@/entities/member'
import { useListSkills } from '@/entities/skill'
import { type Technician, useListTechnicians } from '@/entities/technician'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { formatWeekdays } from '@/shared/lib/weekdays'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { ColorDot } from '@/shared/ui/color-dot'
import {
  ConfigList,
  ConfigListEmpty,
  ConfigListHeader,
  ConfigListItem,
} from '@/shared/ui/config-list'
import { Skeleton } from '@/shared/ui/skeleton'

import { MemberSheet } from './member-sheet'
import { TechnicianSheet } from './technician-sheet'

export function MembersSection() {
  const { t } = useTranslation()
  const { locale, formatDateTime } = useTenantFormat()
  const me = useMe()
  const members = useListMembers()
  // Inactive technicians too: their data is still there to change
  const technicians = useListTechnicians({ includeInactive: true })
  const depots = useListDepots()
  const skills = useListSkills()
  const [editing, setEditing] = useState<Member | null>(null)
  const [editingTechnician, setEditingTechnician] = useState<Member | null>(null)

  const technicianOf = (member: Member): Technician | undefined =>
    technicians.data?.find((technician) => technician.id === member.technicianId)

  const technicianMeta = (technician: Technician) => {
    const depot = depots.data?.find((d) => d.id === technician.depotId)
    const skillNames = technician.skillIds
      .map((id) => skills.data?.find((skill) => skill.id === id)?.name)
      .filter((name): name is string => name !== undefined)
    return [
      t('settings.team.technician.hours', { from: technician.workStart, to: technician.workEnd }),
      formatWeekdays(technician.workingDays, locale, {
        everyDay: t('settings.team.technician.everyDay'),
        noDays: t('settings.team.technician.noDays'),
      }),
      depot?.name ?? null,
      skillNames.length > 0
        ? t('settings.team.technician.skillsMeta', { names: skillNames.join(', ') })
        : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const meta = (member: Member) => {
    const technician = technicianOf(member)
    return [
      member.email,
      member.lastLoginAt
        ? t('settings.team.members.lastLogin', { when: formatDateTime(member.lastLoginAt) })
        : t('settings.team.members.neverLoggedIn'),
      technician
        ? technicianMeta(technician)
        : member.role === 'technician'
          ? t('settings.team.members.noTechnician')
          : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <section aria-label={t('settings.team.members.title')} className="space-y-4">
      <ConfigListHeader
        title={t('settings.team.members.title')}
        description={t('settings.team.description')}
      />
      {members.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.team.members.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void members.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !members.data ? (
        <Skeleton className="h-40" />
      ) : members.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.team.members.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.team.members.list')}>
          {members.data.map((member) => {
            const technician = technicianOf(member)
            const isSelf = member.userId === me.user.id
            return (
              <ConfigListItem
                key={member.userId}
                leading={
                  technician ? <ColorDot color={technician.color} className="size-4" /> : null
                }
                title={
                  <>
                    {member.fullName}
                    {isSelf && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({t('settings.team.members.you')})
                      </span>
                    )}
                    <Badge variant="secondary" className="ml-2 align-middle">
                      {t(`roles.${member.role}`)}
                    </Badge>
                    {hasSalesPlan(me) &&
                      canSetSalesAccess(member) &&
                      memberHasSalesAccess(member) && (
                        <Badge variant="outline" className="ml-2 align-middle">
                          {t('settings.team.members.salesAccess')}
                        </Badge>
                      )}
                    {!member.isActive && (
                      <Badge variant="outline" className="ml-2 align-middle">
                        {t('settings.team.members.inactive')}
                      </Badge>
                    )}
                  </>
                }
                meta={meta(member)}
                actions={
                  <>
                    {member.role === 'technician' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t(
                          technician
                            ? 'settings.team.members.technician'
                            : 'settings.team.members.addTechnician',
                          { name: member.fullName },
                        )}
                        onClick={() => {
                          setEditingTechnician(member)
                        }}
                      >
                        <WrenchIcon aria-hidden="true" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('settings.team.members.edit', { name: member.fullName })}
                      onClick={() => {
                        setEditing(member)
                      }}
                    >
                      <PencilIcon aria-hidden="true" />
                    </Button>
                  </>
                }
              />
            )
          })}
        </ConfigList>
      )}
      {editing && (
        <MemberSheet
          member={editing}
          isSelf={editing.userId === me.user.id}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      {editingTechnician && (
        <TechnicianSheet
          member={editingTechnician}
          technician={technicianOf(editingTechnician)}
          onClose={() => {
            setEditingTechnician(null)
          }}
        />
      )}
    </section>
  )
}
