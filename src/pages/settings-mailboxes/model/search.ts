import { z } from 'zod'

/**
 * Where the browser returns after a mailbox is connected with OAuth: `?connected={mailboxId}`
 * or `?error={access_denied|wrong_account|already_connected|provider_error}`. Both stay
 * plain strings here (a code the backend adds later must not break the page); the screen
 * that explains them knows the four of the spec.
 */
export const mailboxesSearchSchema = z.object({
  connected: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
})

export type MailboxesSearch = z.infer<typeof mailboxesSearchSchema>
