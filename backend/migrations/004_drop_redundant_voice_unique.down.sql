-- Revert migration 004: Restore the redundant unique index on voice_states
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_states_user_unique ON voice_states(user_id);
