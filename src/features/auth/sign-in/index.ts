import { lazy } from 'react'

export { signInErrorMessage } from './lib/sign-in-error'
export { SignInForm } from './ui/sign-in-form'

/**
 * Demo login buttons, only with the mock API. `null` otherwise, and then the
 * bundler drops the seed data from the build.
 */
export const DemoLogins =
  import.meta.env.VITE_API_MOCK === 'true'
    ? lazy(() => import('./ui/demo-logins').then((m) => ({ default: m.DemoLogins })))
    : null
