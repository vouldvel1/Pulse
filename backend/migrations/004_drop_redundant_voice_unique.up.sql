-- Migration 004: Drop redundant unique index on voice_states
--
-- H9 fix: The PRIMARY KEY (user_id, channel_id) already ensures uniqueness per
-- (user, channel) pair. The separate idx_voice_states_user_unique index on
-- just (user_id) was added to enforce "one voice channel per user", but the
-- application enforces this invariant at the query level (DELETE old row before
-- INSERT new one in VoiceStateQueries.Join). The redundant index wastes space
-- and can cause confusion about the actual constraint semantics.

DROP INDEX IF EXISTS idx_voice_states_user_unique;
