import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { hasSalesPlan, useMe } from '@/entities/auth'
import {
  canSetSalesAccess,
  type Member,
  memberHasSalesAccess,
  ROLES,
  type Role,
  useUpdateMember,
} from '@/entities/member'
import { isConflict } from '@/shared/api/api-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldLabel } from '@/shared/ui/field'
import { FormSheet } from '@/shared/ui/form-sheet'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'

/** A member's role and whether they can sign in. Your own is not yours to change here. */
export function MemberSheet({
  member,
  isSelf,
  onClose,
}: {
  member: Member
  isSelf: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [role, setRole] = useState<Role>(member.role)
  const [isActive, setIsActive] = useState(member.isActive)
  const [salesAccess, setSalesAccess] = useState(memberHasSalesAccess(member))
  // Prodaja: only on a plan that has it; the switch is a dispatcher's, owners always have it
  // and technicians never do
  const planHasSales = hasSalesPlan(useMe())
  const showSalesSwitch = planHasSales && canSetSalesAccess({ role })
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateMember()
  const unchanged =
    role === member.role &&
    isActive === member.isActive &&
    (!showSalesSwitch || salesAccess === memberHasSalesAccess(member))

  return (
    <FormSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.team.member.title')}
      description={`${member.fullName} · ${member.email}`}
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        update.mutate(
          {
            userId: member.userId,
            // "Omit to keep": the permission is sent only where the switch is
            body: { role, isActive, ...(showSalesSwitch ? { canAccessSales: salesAccess } : {}) },
          },
          {
            onSuccess: () => {
              toast.success(t('settings.team.member.saved'))
              onClose()
            },
            onError: (failure) => {
              setError(
                isConflict(failure)
                  ? t('settings.team.member.lastOwner')
                  : t('settings.team.member.failed'),
              )
            },
          },
        )
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSelf || unchanged || update.isPending}>
            {update.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      {isSelf && (
        <Alert>
          <AlertDescription>{t('settings.team.member.self')}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="member-role">{t('settings.team.member.role')}</FieldLabel>
        <NativeSelect
          id="member-role"
          className="w-full"
          value={role}
          disabled={isSelf}
          onChange={(event) => {
            setRole(event.target.value as Role)
          }}
        >
          {ROLES.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {t(`roles.${value}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id="member-active"
          checked={isActive}
          disabled={isSelf}
          onCheckedChange={(checked) => {
            setIsActive(checked === true)
          }}
        />
        <FieldLabel htmlFor="member-active" className="font-normal">
          {t('settings.team.member.isActive')}
        </FieldLabel>
      </Field>
      {showSalesSwitch && (
        <Field orientation="horizontal">
          <Checkbox
            id="member-sales"
            checked={salesAccess}
            disabled={isSelf}
            onCheckedChange={(checked) => {
              setSalesAccess(checked === true)
            }}
          />
          <FieldLabel htmlFor="member-sales" className="font-normal">
            {t('settings.team.member.salesAccess')}
          </FieldLabel>
        </Field>
      )}
      {planHasSales && role === 'owner' && (
        <p className="text-sm text-muted-foreground">{t('settings.team.member.salesOwner')}</p>
      )}
      {planHasSales && role === 'technician' && (
        <p className="text-sm text-muted-foreground">{t('settings.team.member.salesTechnician')}</p>
      )}
    </FormSheet>
  )
}
