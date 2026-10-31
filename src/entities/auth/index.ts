export type { Me, TokenResponse } from '@/shared/api/generated/model'
export {
  authKeys,
  fetchMe,
  forgotPassword,
  getMe,
  login,
  logout,
  switchTenant,
  useForgotPassword,
  useLogin,
  useSwitchTenant,
} from './api'
export {
  LOGIN_REASONS,
  loginSearchFor,
  roleHome,
  safeRedirect,
  sessionEndReasonOf,
  type LoginReason,
  type LoginSearch,
} from './lib/navigation'
export { hasSalesAccess, hasSalesAi, SALES_AI_FEATURE, SALES_FEATURE } from './lib/sales-access'
export { sessionStore } from './model/session-store'
export type { SessionSnapshot, SessionStore } from './model/session-store'
export { useMe } from './model/use-me'
export { useSalesAccess } from './model/use-sales-access'
export { useSession } from './model/use-session'
