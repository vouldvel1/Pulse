-- Migration 005: Trigram index on communities.name
--
-- L17 fix: Community search uses ILIKE '%query%', which triggers a sequential
-- scan without an index. Adding a GIN trigram index allows Postgres to use an
-- index scan for substring matches, dramatically improving search performance.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_communities_name_trgm
    ON communities USING GIN (name gin_trgm_ops)
    WHERE deleted_at IS NULL;
