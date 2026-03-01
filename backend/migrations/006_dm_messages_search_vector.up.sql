-- Migration 006: Full-text search vector for dm_messages
--
-- L18 fix: The messages table (community channels) has a search_vector column
-- and GIN index for full-text search. dm_messages did not, making DM content
-- unsearchable. This migration adds an equivalent generated column and index.

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_dm_messages_fts ON dm_messages USING GIN (search_vector);
