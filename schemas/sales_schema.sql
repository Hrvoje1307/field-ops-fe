-- FieldOps: Sales module (OpenAPI 0.3.1). Applies on top of 0001_init.sql.
--
-- Same conventions as 0001:
--   * No extensions (no citext). Emails and patterns are stored lower-cased by the app; unique on lower().
--   * Every tenant-owned table has UNIQUE (tenant_id, id) and children reference it by (tenant_id, id),
--     so a row can never point at another tenant's data. Users are global, but where a user must belong
--     to the tenant (mailbox owner, deal owner, ...) the FK goes to tenant_memberships (tenant_id, user_id).
--   * UUIDs come from the app (v7); the seed at the end uses gen_random_uuid() (built in since Postgres 13).
--   * Version for optimistic concurrency is xmin, as everywhere else.
--
-- Differences from the original sales_module.sql, on purpose:
--   * One conversation across mailboxes. The same mail in info@ and in a personal inbox (CC) is one thread
--     and one message: threads and messages are per tenant, and the per-mailbox provider ids live in
--     mail_thread_mailboxes / mail_message_mailboxes. mail_threads.mailbox_id is the mailbox the thread is
--     shown under (the API's thread.mailbox; shared preferred).
--     Visibility: a message is visible if at least one of its mailboxes is visible to the user, a thread if
--     at least one of its mailboxes is. So a reply sent only from a personal inbox stays private even when
--     the rest of the conversation is in info@.
--   * Exactly one active won and one active lost stage per tenant is enforced by a deferred constraint
--     trigger (the unique index alone only guarantees "at most one").
--   * A draft can only be sent from a mailbox that actually has the thread (FK to mail_thread_mailboxes).

SET search_path TO fieldops;

-- ───────────────────────── Changes to existing tables ─────────────────────────

ALTER TABLE tenant_memberships ADD COLUMN can_access_sales boolean NOT NULL DEFAULT false;
ALTER TABLE user_invitations  ADD COLUMN can_access_sales boolean NOT NULL DEFAULT false;

ALTER TABLE attachments DROP CONSTRAINT attachments_owner_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_owner_type_check
    CHECK (owner_type IN ('tenant','client','location','asset','job','deal'));

ALTER TABLE usage_counters
    ADD COLUMN ai_classifications  integer NOT NULL DEFAULT 0,
    ADD COLUMN ai_drafts           integer NOT NULL DEFAULT 0,
    ADD COLUMN ai_input_tokens     bigint  NOT NULL DEFAULT 0,
    ADD COLUMN ai_output_tokens    bigint  NOT NULL DEFAULT 0;

-- ───────────────────────── Mailboxes ─────────────────────────

CREATE TABLE mailboxes (
    id                 uuid PRIMARY KEY,
    tenant_id          uuid NOT NULL REFERENCES tenants (id),
    provider           text NOT NULL CHECK (provider IN ('gmail','microsoft','imap')),
    email_address      text NOT NULL CHECK (email_address = lower(email_address)),
    display_name       text NOT NULL,
    kind               text NOT NULL CHECK (kind IN ('shared','personal')),
    owner_user_id      uuid,
    status             text NOT NULL DEFAULT 'connecting'
                         CHECK (status IN ('connecting','active','needs_reauth','error','disabled')),
    credentials_enc    bytea NOT NULL,                 -- AES-GCM, key outside the database
    imap_host          text,
    imap_port          integer CHECK (imap_port BETWEEN 1 AND 65535),
    imap_security      text CHECK (imap_security IN ('ssl','starttls')),
    smtp_host          text,
    smtp_port          integer CHECK (smtp_port BETWEEN 1 AND 65535),
    smtp_security      text CHECK (smtp_security IN ('ssl','starttls')),
    can_send           boolean NOT NULL DEFAULT false,
    sync_from          date NOT NULL,
    sync_cursor        jsonb,                          -- historyId / deltaLink / {folder: {uidvalidity, uid}}
    push_subscription  jsonb,                          -- Gmail watch / Graph subscription, with expiry
    last_synced_at     timestamptz,
    last_error         text,
    created_by         uuid REFERENCES users (id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    deleted_at         timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES tenant_memberships (tenant_id, user_id),
    CONSTRAINT ck_mailboxes_personal_owner CHECK (kind = 'shared' OR owner_user_id IS NOT NULL),
    CONSTRAINT ck_mailboxes_imap_fields CHECK (provider <> 'imap' OR
        (imap_host IS NOT NULL AND imap_port IS NOT NULL AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL))
);
CREATE UNIQUE INDEX ux_mailboxes_email ON mailboxes (tenant_id, lower(email_address)) WHERE deleted_at IS NULL;

CREATE TABLE mailbox_oauth_states (
    id                 uuid PRIMARY KEY,
    tenant_id          uuid NOT NULL REFERENCES tenants (id),
    user_id            uuid NOT NULL,
    state_hash         bytea NOT NULL UNIQUE,
    provider           text NOT NULL CHECK (provider IN ('gmail','microsoft')),
    code_verifier_enc  bytea NOT NULL,
    request            jsonb NOT NULL,                 -- kind, ownerUserId, syncFrom, mailboxId (reconnect)
    expires_at         timestamptz NOT NULL,
    used_at            timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships (tenant_id, user_id)
);

-- ───────────────────────── Pipeline ─────────────────────────

CREATE TABLE sales_stages (
    id                uuid PRIMARY KEY,
    tenant_id         uuid NOT NULL REFERENCES tenants (id),
    name              text NOT NULL,
    color             char(7) NOT NULL DEFAULT '#64748b' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    position          smallint NOT NULL,
    kind              text NOT NULL CHECK (kind IN ('open','won','lost')),
    follow_up_days    smallint CHECK (follow_up_days > 0),
    stale_after_days  smallint CHECK (stale_after_days > 0),
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX ux_sales_stages_name ON sales_stages (tenant_id, lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_sales_stages_closed_kind ON sales_stages (tenant_id, kind)
    WHERE kind IN ('won','lost') AND is_active AND deleted_at IS NULL;

-- Exactly one active won and one active lost stage per tenant (once the tenant has any stages).
-- Deferred to commit, so "add the new won stage, then retire the old one" works in one transaction.
-- The app maps this error (SQLSTATE 23514, constraint ck_sales_stages_won_lost) to 409 sales.stage_required.
CREATE FUNCTION check_sales_stages_won_lost() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    t uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    won int; lost int; any_stage boolean;
BEGIN
    SELECT count(*) FILTER (WHERE kind = 'won'  AND is_active AND deleted_at IS NULL),
           count(*) FILTER (WHERE kind = 'lost' AND is_active AND deleted_at IS NULL),
           bool_or(deleted_at IS NULL)
      INTO won, lost, any_stage
      FROM sales_stages WHERE tenant_id = t;
    IF COALESCE(any_stage, false) AND (won <> 1 OR lost <> 1) THEN
        RAISE EXCEPTION 'A tenant needs exactly one active won and one active lost sales stage (has % won, % lost).', won, lost
            USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_stages_won_lost';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ck_sales_stages_won_lost
    AFTER INSERT OR UPDATE OR DELETE ON sales_stages
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_sales_stages_won_lost();

CREATE TABLE deals (
    id                   uuid PRIMARY KEY,
    tenant_id            uuid NOT NULL REFERENCES tenants (id),
    title                text NOT NULL,
    stage_id             uuid NOT NULL,
    client_id            uuid,
    contact_name         text,
    contact_email        text CHECK (contact_email = lower(contact_email)),
    contact_phone        text,                       -- E.164
    value                numeric(12,2) CHECK (value >= 0),
    currency             char(3) NOT NULL DEFAULT 'EUR',
    expected_close_date  date,
    owner_user_id        uuid,
    source               text NOT NULL DEFAULT 'email' CHECK (source IN ('email','phone','manual','web')),
    notes                text,
    lost_reason          text CHECK (lost_reason IN ('price','timing','competitor','no_response','not_qualified','other')),
    lost_note            text,
    won_at               timestamptz,
    lost_at              timestamptz,
    stage_entered_at     timestamptz NOT NULL DEFAULT now(),
    last_contact_at      timestamptz,
    next_follow_up_at    timestamptz,
    job_id               uuid,
    extracted            jsonb NOT NULL DEFAULT '{}',
    created_by           uuid REFERENCES users (id),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    deleted_at           timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, stage_id) REFERENCES sales_stages (tenant_id, id),
    FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id),
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES tenant_memberships (tenant_id, user_id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES jobs (tenant_id, id),
    CONSTRAINT ck_deals_lost_reason CHECK (lost_at IS NULL OR lost_reason IS NOT NULL)
);
CREATE UNIQUE INDEX ux_deals_job ON deals (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX ix_deals_stage ON deals (tenant_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_deals_follow_up ON deals (tenant_id, next_follow_up_at) WHERE next_follow_up_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_deals_owner ON deals (tenant_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_deals_client ON deals (tenant_id, client_id) WHERE client_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_deals_contact_email ON deals (tenant_id, contact_email) WHERE contact_email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE deal_activities (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL REFERENCES tenants (id),
    deal_id        uuid NOT NULL,
    type           text NOT NULL CHECK (type IN ('created','stage_changed','field_changed','note','email_in','email_out',
                     'draft_created','draft_sent','follow_up_snoozed','follow_up_done','thread_linked','thread_unlinked','converted')),
    actor_kind     text NOT NULL CHECK (actor_kind IN ('user','ai','system')),
    actor_user_id  uuid REFERENCES users (id),
    text           text,
    data           jsonb NOT NULL DEFAULT '{}',
    at             timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, deal_id) REFERENCES deals (tenant_id, id),
    CONSTRAINT ck_deal_activities_actor CHECK (actor_kind <> 'user' OR actor_user_id IS NOT NULL)
);
CREATE INDEX ix_deal_activities_deal ON deal_activities (deal_id, at DESC);

-- ───────────────────────── Mail ─────────────────────────

CREATE TABLE mail_threads (
    id                   uuid PRIMARY KEY,
    tenant_id            uuid NOT NULL REFERENCES tenants (id),
    mailbox_id           uuid NOT NULL,              -- shown under this mailbox (shared preferred)
    subject              text NOT NULL DEFAULT '',
    participants         jsonb NOT NULL DEFAULT '[]',
    snippet              text NOT NULL DEFAULT '',
    message_count        integer NOT NULL DEFAULT 0,
    has_attachments      boolean NOT NULL DEFAULT false,
    last_message_at      timestamptz NOT NULL,
    last_inbound_at      timestamptz,
    last_outbound_at     timestamptz,
    awaiting_reply       boolean NOT NULL DEFAULT false,
    ai_status            text NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','done','failed','skipped')),
    category             text CHECK (category IN ('new_inquiry','quote_request','follow_up','negotiation','objection',
                           'accepted','declined','support','admin','spam','other')),
    category_source      text CHECK (category_source IN ('ai','user')),
    category_confidence  numeric(3,2) CHECK (category_confidence BETWEEN 0 AND 1),
    is_sales             boolean,
    summary              text,
    next_action          text,
    suggested_stage_id   uuid,
    extracted            jsonb NOT NULL DEFAULT '{}',
    ai_model             text,
    ai_processed_at      timestamptz,
    ai_input_hash        bytea,
    deal_id              uuid,
    client_id            uuid,
    excluded             boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    deleted_at           timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, mailbox_id) REFERENCES mailboxes (tenant_id, id),
    FOREIGN KEY (tenant_id, suggested_stage_id) REFERENCES sales_stages (tenant_id, id),
    FOREIGN KEY (tenant_id, deal_id) REFERENCES deals (tenant_id, id),
    FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id)
);
CREATE INDEX ix_mail_threads_recent ON mail_threads (tenant_id, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_mail_threads_deal ON mail_threads (tenant_id, deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX ix_mail_threads_awaiting ON mail_threads (tenant_id, awaiting_reply) WHERE is_sales AND deleted_at IS NULL;
CREATE INDEX ix_mail_threads_participants ON mail_threads USING gin (participants jsonb_path_ops);

-- Which mailboxes have the thread, and under which provider id.
CREATE TABLE mail_thread_mailboxes (
    tenant_id           uuid NOT NULL REFERENCES tenants (id),
    thread_id           uuid NOT NULL,
    mailbox_id          uuid NOT NULL,
    provider_thread_id  text NOT NULL,              -- Gmail threadId / Graph conversationId / IMAP root Message-ID
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id, mailbox_id),
    UNIQUE (mailbox_id, provider_thread_id),
    FOREIGN KEY (tenant_id, thread_id) REFERENCES mail_threads (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, mailbox_id) REFERENCES mailboxes (tenant_id, id)
);
CREATE INDEX ix_mail_thread_mailboxes_mailbox ON mail_thread_mailboxes (mailbox_id);

CREATE TABLE mail_messages (
    id                   uuid PRIMARY KEY,
    tenant_id            uuid NOT NULL REFERENCES tenants (id),
    thread_id            uuid NOT NULL,
    internet_message_id  text,                       -- Message-ID header; the dedupe key across mailboxes
    in_reply_to          text,
    direction            text NOT NULL CHECK (direction IN ('inbound','outbound')),
    from_email           text NOT NULL CHECK (from_email = lower(from_email)),
    from_name            text,
    to_addresses         jsonb NOT NULL DEFAULT '[]',
    cc_addresses         jsonb NOT NULL DEFAULT '[]',
    subject              text,
    sent_at              timestamptz NOT NULL,
    snippet              text NOT NULL DEFAULT '',
    body_text            text,                       -- null when not stored (non-sales, retention)
    attachments          jsonb NOT NULL DEFAULT '[]',-- metadata only until saved to a deal
    created_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, thread_id) REFERENCES mail_threads (tenant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ux_mail_messages_internet_id ON mail_messages (tenant_id, internet_message_id)
    WHERE internet_message_id IS NOT NULL;
CREATE INDEX ix_mail_messages_thread ON mail_messages (thread_id, sent_at);

-- Which mailboxes have the message, and under which provider id.
CREATE TABLE mail_message_mailboxes (
    tenant_id            uuid NOT NULL REFERENCES tenants (id),
    message_id           uuid NOT NULL,
    mailbox_id           uuid NOT NULL,
    provider_message_id  text NOT NULL,             -- Gmail id / Graph id / "{folder}:{uidvalidity}:{uid}"
    created_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, mailbox_id),
    UNIQUE (mailbox_id, provider_message_id),
    FOREIGN KEY (tenant_id, message_id) REFERENCES mail_messages (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, mailbox_id) REFERENCES mailboxes (tenant_id, id)
);
CREATE INDEX ix_mail_message_mailboxes_mailbox ON mail_message_mailboxes (mailbox_id);

CREATE TABLE mail_exclusion_rules (
    id          uuid PRIMARY KEY,
    tenant_id   uuid NOT NULL REFERENCES tenants (id),
    pattern     text NOT NULL CHECK (pattern = lower(pattern) AND pattern <> ''),  -- address or @domain
    note        text,
    created_by  uuid REFERENCES users (id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, pattern)
);

CREATE TABLE follow_up_rules (
    id                  uuid PRIMARY KEY,
    tenant_id           uuid NOT NULL REFERENCES tenants (id),
    name                text NOT NULL,
    stage_id            uuid,
    days_without_reply  smallint NOT NULL CHECK (days_without_reply BETWEEN 1 AND 90),  -- working days
    create_draft        boolean NOT NULL DEFAULT true,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, stage_id) REFERENCES sales_stages (tenant_id, id)
);

CREATE TABLE mail_drafts (
    id                 uuid PRIMARY KEY,
    tenant_id          uuid NOT NULL REFERENCES tenants (id),
    thread_id          uuid NOT NULL,
    deal_id            uuid,
    mailbox_id         uuid NOT NULL,              -- sends from here; must have the thread
    kind               text NOT NULL CHECK (kind IN ('reply','follow_up')),
    status             text NOT NULL CHECK (status IN ('generating','ready','edited','saved_to_mailbox','sent','discarded','failed')),
    subject            text NOT NULL DEFAULT '',
    body_text          text NOT NULL DEFAULT '',
    to_addresses       jsonb NOT NULL DEFAULT '[]',
    cc_addresses       jsonb NOT NULL DEFAULT '[]',
    instructions       text,
    error              text,
    ai_model           text,
    follow_up_rule_id  uuid,
    provider_draft_id  text,
    sent_message_id    uuid,
    sent_at            timestamptz,
    created_by         uuid REFERENCES users (id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    deleted_at         timestamptz,
    FOREIGN KEY (tenant_id, thread_id) REFERENCES mail_threads (tenant_id, id),
    FOREIGN KEY (thread_id, mailbox_id) REFERENCES mail_thread_mailboxes (thread_id, mailbox_id),
    FOREIGN KEY (tenant_id, deal_id) REFERENCES deals (tenant_id, id),
    FOREIGN KEY (tenant_id, follow_up_rule_id) REFERENCES follow_up_rules (tenant_id, id),
    FOREIGN KEY (tenant_id, sent_message_id) REFERENCES mail_messages (tenant_id, id),
    CONSTRAINT ck_mail_drafts_sent CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);
CREATE UNIQUE INDEX ux_mail_drafts_rule_open ON mail_drafts (thread_id, follow_up_rule_id)
    WHERE follow_up_rule_id IS NOT NULL AND status IN ('generating','ready','edited','saved_to_mailbox') AND deleted_at IS NULL;
CREATE INDEX ix_mail_drafts_thread ON mail_drafts (thread_id) WHERE deleted_at IS NULL;

CREATE TABLE sales_settings (
    tenant_id               uuid PRIMARY KEY REFERENCES tenants (id),
    ai_enabled              boolean NOT NULL DEFAULT true,
    signature               text,
    tone                    text NOT NULL DEFAULT 'neutral' CHECK (tone IN ('formal','neutral','friendly')),
    reply_language          text NOT NULL DEFAULT 'auto',
    knowledge               text,
    response_sla_hours      smallint NOT NULL DEFAULT 4 CHECK (response_sla_hours BETWEEN 1 AND 168),
    digest_enabled          boolean NOT NULL DEFAULT true,
    digest_time             time NOT NULL DEFAULT '07:45',
    digest_recipient_ids    uuid[] NOT NULL DEFAULT '{}',   -- user ids; the app checks membership
    store_non_sales_bodies  boolean NOT NULL DEFAULT false,
    retention_days          integer CHECK (retention_days >= 30),
    review_threshold        numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (review_threshold BETWEEN 0 AND 1),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_feedback (
    id            uuid PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenants (id),
    thread_id     uuid NOT NULL,
    field         text NOT NULL CHECK (field IN ('category','is_sales','stage')),
    ai_value      text,
    user_value    text NOT NULL,
    example_text  text NOT NULL,
    user_id       uuid NOT NULL REFERENCES users (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, thread_id) REFERENCES mail_threads (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_ai_feedback_recent ON ai_feedback (tenant_id, created_at DESC);

-- ───────────────────────── Seed for existing tenants ─────────────────────────
-- New tenants get the same from the app when they're created.

INSERT INTO sales_stages (id, tenant_id, name, color, position, kind, follow_up_days)
SELECT gen_random_uuid(), t.id, s.name, s.color, s.position, s.kind, s.follow_up_days
FROM tenants t
CROSS JOIN (VALUES
    ('Novi upit',     '#3b82f6', 1, 'open', NULL::smallint),
    ('Kontaktiran',   '#8b5cf6', 2, 'open', NULL),
    ('Ponuda poslana','#f59e0b', 3, 'open', 3),
    ('Pregovori',     '#ec4899', 4, 'open', NULL),
    ('Dobiven',       '#16a34a', 5, 'won',  NULL),
    ('Izgubljen',     '#64748b', 6, 'lost', NULL)
) AS s (name, color, position, kind, follow_up_days)
WHERE t.deleted_at IS NULL;

INSERT INTO follow_up_rules (id, tenant_id, name, stage_id, days_without_reply)
SELECT gen_random_uuid(), st.tenant_id, 'Ponuda poslana, 3 dana bez odgovora', st.id, 3
FROM sales_stages st WHERE st.name = 'Ponuda poslana';

INSERT INTO sales_settings (tenant_id)
SELECT id FROM tenants WHERE deleted_at IS NULL;
