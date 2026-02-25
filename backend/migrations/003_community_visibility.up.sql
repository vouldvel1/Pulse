ALTER TABLE communities ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'private';

CREATE INDEX idx_communities_visibility ON communities(visibility) WHERE deleted_at IS NULL;
