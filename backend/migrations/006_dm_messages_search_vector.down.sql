-- Revert migration 006: Remove full-text search vector from dm_messages
DROP INDEX IF EXISTS idx_dm_messages_fts;
ALTER TABLE dm_messages DROP COLUMN IF EXISTS search_vector;
