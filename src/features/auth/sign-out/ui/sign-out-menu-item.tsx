import { LogOutIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'

import { useSignOut } from '../model/use-sign-out'

export function SignOutMenuItem() {
  const { t } = useTranslation()
  const signOut = useSignOut()
  return (
    <DropdownMenuItem onSelect={signOut}>
      <LogOutIcon />
      {t('auth.signOut')}
    </DropdownMenuItem>
  )
}
