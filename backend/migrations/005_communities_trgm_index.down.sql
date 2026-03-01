-- Revert migration 005: Drop trigram index on communities.name
DROP INDEX IF EXISTS idx_communities_name_trgm;
