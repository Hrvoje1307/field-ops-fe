import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { MailboxKind } from '@/shared/api/generated/model'
import { ChoiceGroup } from '@/shared/ui/choice-group'
import { SelectField } from '@/shared/ui/select-field'

export interface MailboxOwner {
  id: string
  name: string
}

const KINDS: readonly MailboxKind[] = ['shared', 'personal']

/**
 * Shared or personal, and for a personal one whose it is. Inside a react-hook-form
 * `FormProvider` with the paths `kind` and `ownerUserId`; `owners` are the people a
 * personal mailbox can belong to.
 */
export function MailboxKindFields({ owners }: { owners: readonly MailboxOwner[] }) {
  const { t } = useTranslation()
  const kind = useWatch({ name: 'kind' }) as MailboxKind
  return (
    <>
      <ChoiceGroup
        name="kind"
        legend={t('sales.mailboxes.kindLabel')}
        choices={KINDS.map((value) => ({ value, label: t(`sales.mailboxes.kind.${value}`) }))}
      />
      {kind === 'personal' && (
        <SelectField
          name="ownerUserId"
          label={t('sales.mailboxes.owner')}
          emptyLabel={t('sales.mailboxes.ownerChoose')}
          required
          options={owners.map((owner) => ({ value: owner.id, label: owner.name }))}
        />
      )}
    </>
  )
}
