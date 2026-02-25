-- Migration 001: Initial Schema
-- Pulse - Self-hosted Discord Alternative

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==========================================================================
-- Users
-- ==========================================================================
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    username      VARCHAR(32) NOT NULL UNIQUE,
    display_name  VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url    TEXT,
    banner_url    TEXT,
    bio           TEXT,
    status        VARCHAR(32) NOT NULL DEFAULT '',
    custom_status VARCHAR(128),
    presence      VARCHAR(16) NOT NULL DEFAULT 'offline',
    totp_secret   VARCHAR(64),
    totp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_username_trgm ON users USING gin(username gin_trgm_ops) WHERE deleted_at IS NULL;

-- ==========================================================================
-- Communities (Servers/Guilds)
-- ==========================================================================
CREATE TABLE communities (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url    TEXT,
    banner_url  TEXT,
    owner_id    UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_communities_owner ON communities(owner_id) WHERE deleted_at IS NULL;

-- ==========================================================================
-- Roles
-- ==========================================================================
CREATE TABLE roles (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name         VARCHAR(64) NOT NULL,
    color        VARCHAR(7),
    position     INT NOT NULL DEFAULT 0,
    permissions  BIGINT NOT NULL DEFAULT 0,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roles_community ON roles(community_id);

-- ==========================================================================
-- Community Members
-- ==========================================================================
CREATE TABLE community_members (
    user_id       UUID NOT NULL REFERENCES users(id),
    community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    nickname      VARCHAR(64),
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    timeout_until TIMESTAMPTZ,
    PRIMARY KEY (user_id, community_id)
);

CREATE INDEX idx_community_members_community ON community_members(community_id);

-- ==========================================================================
-- Member Roles (join table)
-- ==========================================================================
CREATE TABLE member_roles (
    user_id      UUID NOT NULL,
    community_id UUID NOT NULL,
    role_id      UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, community_id, role_id),
    FOREIGN KEY (user_id, community_id) REFERENCES community_members(user_id, community_id) ON DELETE CASCADE
);

-- ==========================================================================
-- Channels
-- ==========================================================================
CREATE TABLE channels (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    parent_id    UUID REFERENCES channels(id) ON DELETE SET NULL,
    name         VARCHAR(100) NOT NULL,
    topic        TEXT,
    type         VARCHAR(20) NOT NULL DEFAULT 'text',
    position     INT NOT NULL DEFAULT 0,
    is_private   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_community ON channels(community_id);
CREATE INDEX idx_channels_parent ON channels(parent_id);

-- ==========================================================================
-- Channel Permission Overwrites
-- ==========================================================================
CREATE TABLE channel_permission_overwrites (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    allow      BIGINT NOT NULL DEFAULT 0,
    deny       BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, role_id)
);

-- ==========================================================================
-- Messages
-- ==========================================================================
CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    pinned      BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_messages_channel_created ON messages(channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_messages_author ON messages(author_id) WHERE deleted_at IS NULL;

-- Full-text search index
ALTER TABLE messages ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
CREATE INDEX idx_messages_fts ON messages USING gin(search_vector);

-- ==========================================================================
-- Attachments
-- ==========================================================================
CREATE TABLE attachments (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name  VARCHAR(255) NOT NULL,
    file_size  BIGINT NOT NULL,
    mime_type  VARCHAR(128) NOT NULL,
    url        TEXT NOT NULL,
    width      INT,
    height     INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_message ON attachments(message_id);

-- ==========================================================================
-- Reactions
-- ==========================================================================
CREATE TABLE reactions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    emoji      VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON reactions(message_id);

-- ==========================================================================
-- Invites
-- ==========================================================================
CREATE TABLE invites (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code         VARCHAR(16) NOT NULL UNIQUE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    creator_id   UUID NOT NULL REFERENCES users(id),
    max_uses     INT,
    uses         INT NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_invites_community ON invites(community_id);

-- ==========================================================================
-- DM Channels
-- ==========================================================================
CREATE TABLE dm_channels (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name      VARCHAR(100),
    is_group  BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id  UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dm_channel_members (
    channel_id UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

-- DM Messages (reuse messages table with a separate dm_messages table)
CREATE TABLE dm_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id  UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    reply_to_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL,
    edited_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_dm_messages_channel ON dm_messages(channel_id, created_at DESC) WHERE deleted_at IS NULL;

-- ==========================================================================
-- Read State
-- ==========================================================================
CREATE TABLE read_states (
    user_id        UUID NOT NULL REFERENCES users(id),
    channel_id     UUID NOT NULL,
    last_message_id UUID NOT NULL,
    mention_count  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, channel_id)
);

-- ==========================================================================
-- Bans
-- ==========================================================================
CREATE TABLE bans (
    user_id      UUID NOT NULL REFERENCES users(id),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    reason       TEXT,
    banned_by    UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, community_id)
);

-- ==========================================================================
-- Audit Log
-- ==========================================================================
CREATE TABLE audit_log (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    actor_id     UUID NOT NULL REFERENCES users(id),
    action       VARCHAR(64) NOT NULL,
    target_type  VARCHAR(32) NOT NULL,
    target_id    UUID NOT NULL,
    changes      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_community ON audit_log(community_id, created_at DESC);

-- ==========================================================================
-- Webhooks
-- ==========================================================================
CREATE TABLE webhooks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    channel_id   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    name         VARCHAR(80) NOT NULL,
    token        VARCHAR(128) NOT NULL UNIQUE,
    avatar_url   TEXT,
    creator_id   UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_channel ON webhooks(channel_id);

-- ==========================================================================
-- Custom Emojis
-- ==========================================================================
CREATE TABLE custom_emojis (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name         VARCHAR(32) NOT NULL,
    url          TEXT NOT NULL,
    creator_id   UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(community_id, name)
);

-- ==========================================================================
-- Refresh Tokens
-- ==========================================================================
CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked = FALSE;
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash) WHERE revoked = FALSE;

-- ==========================================================================
-- Notifications
-- ==========================================================================
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(32) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    resource_id UUID,
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read = FALSE;

-- ==========================================================================
-- Updated at trigger function
-- ==========================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_communities_updated_at BEFORE UPDATE ON communities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
