DROP INDEX IF EXISTS idx_communities_visibility;
ALTER TABLE communities DROP COLUMN IF EXISTS visibility;
