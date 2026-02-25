-- Migration 002: Voice States
-- Tracks users connected to voice channels

CREATE TABLE voice_states (
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    self_mute    BOOLEAN NOT NULL DEFAULT FALSE,
    self_deaf    BOOLEAN NOT NULL DEFAULT FALSE,
    server_mute  BOOLEAN NOT NULL DEFAULT FALSE,
    server_deaf  BOOLEAN NOT NULL DEFAULT FALSE,
    streaming    BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel_id)
);

-- A user can only be in one voice channel at a time (across all communities)
CREATE UNIQUE INDEX idx_voice_states_user_unique ON voice_states(user_id);
CREATE INDEX idx_voice_states_channel ON voice_states(channel_id);
CREATE INDEX idx_voice_states_community ON voice_states(community_id);
