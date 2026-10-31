/**
 * Stored rows of the Sales module (schemas/sales_schema.sql). Like the other rows they
 * add only what the API never returns: foreign keys, soft-delete markers, the mailbox
 * lists behind "one conversation across mailboxes", secrets that the real API never shows.
 */
import type {
  ActorKind,
  AiStatus,
  ClassificationSource,
  DealActivityType,
  DealSource,
  DraftKind,
  DraftStatus,
  DraftTone,
  ExtractedContact,
  LostReason,
  MailAddress,
  MailAttachment,
  MailboxKind,
  MailboxStatus,
  MailProvider,
  MailSecurity,
  MessageDirection,
  SalesStageKind,
  ThreadCategory,
} from '@/shared/api/generated/model'

export interface MailboxRow {
  id: string
  provider: MailProvider
  emailAddress: string
  displayName: string
  kind: MailboxKind
  /** A user of the tenant; null for shared mailboxes. */
  ownerUserId: string | null
  status: MailboxStatus
  lastSyncedAt: string | null
  lastError: string | null
  syncFrom: string
  canSend: boolean
  /** IMAP/SMTP settings; the password is never stored (not even by the mock). */
  imap: {
    host: string
    port: number
    security: MailSecurity
    smtpHost: string
    smtpPort: number
    smtpSecurity: MailSecurity
    username: string
  } | null
  createdAt: string
  updatedAt: string
  /** Disconnected. Without `purge` its conversations stay (read-only history). */
  deletedAt: string | null
}

/** A started OAuth connection, waiting for the provider's redirect (10 minutes). */
export interface MailboxOAuthStateRow {
  state: string
  userId: string
  provider: 'gmail' | 'microsoft'
  kind: MailboxKind
  ownerUserId: string | null
  syncFrom: string
  /** Set when re-authorising an existing mailbox. */
  mailboxId: string | null
  expiresAt: string
  usedAt: string | null
}

export interface MailMessageRow {
  id: string
  threadId: string
  /** Every mailbox that has the message; it is visible when one of them is. */
  mailboxIds: string[]
  direction: MessageDirection
  from: MailAddress
  to: MailAddress[]
  cc: MailAddress[]
  subject: string | null
  sentAt: string
  snippet: string
  /** Null when not stored (non-sales thread under the retention rules). */
  bodyText: string | null
  attachments: MailAttachment[]
}

export interface MailThreadRow {
  id: string
  /** Every mailbox that has the conversation. */
  mailboxIds: string[]
  /** The mailbox it is shown under (a shared one when there is one). */
  shownMailboxId: string
  subject: string
  aiStatus: AiStatus
  /** The result of the last classification; null while there is none. */
  category: ThreadCategory | null
  categorySource: ClassificationSource | null
  /** 0–1; null when set by a user. */
  confidence: number | null
  isSales: boolean | null
  summary: string | null
  nextAction: string | null
  suggestedStageId: string | null
  extracted: ExtractedContact | null
  aiModel: string | null
  aiProcessedAt: string | null
  /** A classification (or reprocess) that finishes at this instant while `aiStatus` is pending. */
  aiReadyAt: string | null
  dealId: string | null
  clientId: string | null
  excluded: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface SalesStageRow {
  id: string
  name: string
  color: string
  position: number
  kind: SalesStageKind
  followUpDays: number | null
  staleAfterDays: number | null
  isActive: boolean
  deletedAt: string | null
}

export interface DealRow {
  id: string
  title: string
  stageId: string
  clientId: string | null
  contactName: string | null
  contactEmail: string | null
  /** E.164 */
  contactPhone: string | null
  /** Decimal string. */
  value: string | null
  expectedCloseDate: string | null
  ownerUserId: string | null
  source: DealSource
  notes: string | null
  lostReason: LostReason | null
  lostNote: string | null
  wonAt: string | null
  lostAt: string | null
  stageEnteredAt: string
  lastContactAt: string | null
  nextFollowUpAt: string | null
  jobId: string | null
  extracted: ExtractedContact | null
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface DealActivityRow {
  id: string
  dealId: string
  type: DealActivityType
  actorKind: ActorKind
  actorUserId: string | null
  at: string
  text: string | null
  data: Record<string, unknown>
}

export interface DraftRow {
  id: string
  threadId: string
  dealId: string | null
  mailboxId: string
  kind: DraftKind
  status: DraftStatus
  subject: string
  bodyText: string
  to: MailAddress[]
  cc: MailAddress[]
  instructions: string | null
  error: string | null
  aiModel: string | null
  followUpRuleId: string | null
  providerDraftId: string | null
  sentAt: string | null
  /** A draft in `generating` that finishes at this instant. */
  readyAt: string | null
  createdByUserId: string | null
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ExclusionRuleRow {
  id: string
  /** Lower-case address or `@domain`. */
  pattern: string
  note: string | null
  createdAt: string
}

export interface FollowUpRuleRow {
  id: string
  name: string
  stageId: string | null
  daysWithoutReply: number
  createDraft: boolean
  isActive: boolean
  deletedAt: string | null
}

export interface SalesSettingsRow {
  aiEnabled: boolean
  signature: string | null
  tone: DraftTone
  replyLanguage: string
  knowledge: string | null
  responseSlaHours: number
  digestEnabled: boolean
  digestTime: string
  digestRecipientIds: string[]
  storeNonSalesBodies: boolean
  retentionDays: number | null
  reviewThreshold: number
}

/** A user's correction of the AI, kept as an example (never returned by the API). */
export interface AiFeedbackRow {
  id: string
  threadId: string
  field: 'category' | 'is_sales'
  aiValue: string | null
  userValue: string
  userId: string
  createdAt: string
}

/** Everything the Sales module keeps for one tenant. */
export interface SalesData {
  mailboxes: MailboxRow[]
  oauthStates: MailboxOAuthStateRow[]
  stages: SalesStageRow[]
  deals: DealRow[]
  activities: DealActivityRow[]
  threads: MailThreadRow[]
  messages: MailMessageRow[]
  drafts: DraftRow[]
  exclusions: ExclusionRuleRow[]
  followUpRules: FollowUpRuleRow[]
  settings: SalesSettingsRow
  aiFeedback: AiFeedbackRow[]
}
