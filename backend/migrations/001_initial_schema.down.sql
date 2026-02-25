-- Rollback migration 001
DROP TRIGGER IF EXISTS trg_webhooks_updated_at ON webhooks;
DROP TRIGGER IF EXISTS trg_channels_updated_at ON channels;
DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
DROP TRIGGER IF EXISTS trg_communities_updated_at ON communities;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at();

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS custom_emojis;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS bans;
DROP TABLE IF EXISTS read_states;
DROP TABLE IF EXISTS dm_messages;
DROP TABLE IF EXISTS dm_channel_members;
DROP TABLE IF EXISTS dm_channels;
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS channel_permission_overwrites;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS member_roles;
DROP TABLE IF EXISTS community_members;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS communities;
DROP TABLE IF EXISTS users;

DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS "uuid-ossp";
