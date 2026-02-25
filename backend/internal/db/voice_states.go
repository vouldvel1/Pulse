package db

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// VoiceStateQueries handles voice state database operations
type VoiceStateQueries struct {
	pool *Pool
}

// NewVoiceStateQueries creates a new VoiceStateQueries instance
func NewVoiceStateQueries(pool *Pool) *VoiceStateQueries {
	return &VoiceStateQueries{pool: pool}
}

// Join adds a user to a voice channel (removes from any previous voice channel first)
func (q *VoiceStateQueries) Join(ctx context.Context, userID, channelID, communityID uuid.UUID) (*models.VoiceState, error) {
	// Use a transaction: remove old state, insert new one
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		rbErr := tx.Rollback(ctx)
		if rbErr != nil && rbErr.Error() != "tx is closed" {
			fmt.Printf("rollback error: %v\n", rbErr)
		}
	}()

	// Remove any existing voice state for this user (user can only be in one voice channel)
	_, err = tx.Exec(ctx, "DELETE FROM voice_states WHERE user_id = $1", userID)
	if err != nil {
		return nil, fmt.Errorf("remove old voice state: %w", err)
	}

	// Insert new voice state
	var vs models.VoiceState
	err = tx.QueryRow(ctx, `
		INSERT INTO voice_states (user_id, channel_id, community_id)
		VALUES ($1, $2, $3)
		RETURNING user_id, channel_id, community_id, self_mute, self_deaf, server_mute, server_deaf, streaming, joined_at
	`, userID, channelID, communityID).Scan(
		&vs.UserID, &vs.ChannelID, &vs.CommunityID,
		&vs.SelfMute, &vs.SelfDeaf, &vs.ServerMute, &vs.ServerDeaf,
		&vs.Streaming, &vs.JoinedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert voice state: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	return &vs, nil
}

// Leave removes a user from their current voice channel
func (q *VoiceStateQueries) Leave(ctx context.Context, userID uuid.UUID) (*models.VoiceState, error) {
	var vs models.VoiceState
	err := q.pool.QueryRow(ctx, `
		DELETE FROM voice_states WHERE user_id = $1
		RETURNING user_id, channel_id, community_id, self_mute, self_deaf, server_mute, server_deaf, streaming, joined_at
	`, userID).Scan(
		&vs.UserID, &vs.ChannelID, &vs.CommunityID,
		&vs.SelfMute, &vs.SelfDeaf, &vs.ServerMute, &vs.ServerDeaf,
		&vs.Streaming, &vs.JoinedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("delete voice state: %w", err)
	}
	return &vs, nil
}

// LeaveCleanup removes a user's voice state from the DB, ignoring "no rows" errors.
// This is used by the WS disconnect handler to clean up stale state.
func (q *VoiceStateQueries) LeaveCleanup(ctx context.Context, userID uuid.UUID) error {
	_, err := q.Leave(ctx, userID)
	if err != nil {
		// If no row exists (already cleaned up by REST endpoint), that's fine
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		// Best effort — any other error is non-fatal for disconnect cleanup
		return nil
	}
	return nil
}

// GetByUser returns the current voice state for a user (if any)
func (q *VoiceStateQueries) GetByUser(ctx context.Context, userID uuid.UUID) (*models.VoiceState, error) {
	var vs models.VoiceState
	err := q.pool.QueryRow(ctx, `
		SELECT user_id, channel_id, community_id, self_mute, self_deaf, server_mute, server_deaf, streaming, joined_at
		FROM voice_states WHERE user_id = $1
	`, userID).Scan(
		&vs.UserID, &vs.ChannelID, &vs.CommunityID,
		&vs.SelfMute, &vs.SelfDeaf, &vs.ServerMute, &vs.ServerDeaf,
		&vs.Streaming, &vs.JoinedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get voice state by user: %w", err)
	}
	return &vs, nil
}

// ListByChannel returns all voice states for a given channel, with user info
func (q *VoiceStateQueries) ListByChannel(ctx context.Context, channelID uuid.UUID) ([]models.VoiceState, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT vs.user_id, vs.channel_id, vs.community_id,
			vs.self_mute, vs.self_deaf, vs.server_mute, vs.server_deaf,
			vs.streaming, vs.joined_at,
			u.id, u.username, u.display_name, u.avatar_url, u.presence
		FROM voice_states vs
		JOIN users u ON u.id = vs.user_id
		WHERE vs.channel_id = $1
		ORDER BY vs.joined_at ASC
	`, channelID)
	if err != nil {
		return nil, fmt.Errorf("list voice states: %w", err)
	}
	defer rows.Close()

	var states []models.VoiceState
	for rows.Next() {
		var vs models.VoiceState
		var user models.User
		if err := rows.Scan(
			&vs.UserID, &vs.ChannelID, &vs.CommunityID,
			&vs.SelfMute, &vs.SelfDeaf, &vs.ServerMute, &vs.ServerDeaf,
			&vs.Streaming, &vs.JoinedAt,
			&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.Presence,
		); err != nil {
			return nil, fmt.Errorf("scan voice state: %w", err)
		}
		vs.User = &user
		states = append(states, vs)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate voice states: %w", err)
	}

	return states, nil
}

// UpdateState updates mute/deaf/streaming state for a user
func (q *VoiceStateQueries) UpdateState(ctx context.Context, userID uuid.UUID, selfMute, selfDeaf bool) error {
	tag, err := q.pool.Exec(ctx, `
		UPDATE voice_states SET self_mute = $2, self_deaf = $3 WHERE user_id = $1
	`, userID, selfMute, selfDeaf)
	if err != nil {
		return fmt.Errorf("update voice state: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not in a voice channel")
	}
	return nil
}

// ServerMute sets server mute on a user
func (q *VoiceStateQueries) ServerMute(ctx context.Context, userID uuid.UUID, muted bool) error {
	tag, err := q.pool.Exec(ctx, `
		UPDATE voice_states SET server_mute = $2 WHERE user_id = $1
	`, userID, muted)
	if err != nil {
		return fmt.Errorf("server mute: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not in a voice channel")
	}
	return nil
}

// ServerDeafen sets server deafen on a user
func (q *VoiceStateQueries) ServerDeafen(ctx context.Context, userID uuid.UUID, deafened bool) error {
	tag, err := q.pool.Exec(ctx, `
		UPDATE voice_states SET server_deaf = $2 WHERE user_id = $1
	`, userID, deafened)
	if err != nil {
		return fmt.Errorf("server deafen: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not in a voice channel")
	}
	return nil
}

// SetStreaming updates the streaming flag for a user
func (q *VoiceStateQueries) SetStreaming(ctx context.Context, userID uuid.UUID, streaming bool) error {
	tag, err := q.pool.Exec(ctx, `
		UPDATE voice_states SET streaming = $2 WHERE user_id = $1
	`, userID, streaming)
	if err != nil {
		return fmt.Errorf("set streaming: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not in a voice channel")
	}
	return nil
}

// RemoveByChannel removes all voice states for a channel (when channel is deleted)
func (q *VoiceStateQueries) RemoveByChannel(ctx context.Context, channelID uuid.UUID) ([]models.VoiceState, error) {
	rows, err := q.pool.Query(ctx, `
		DELETE FROM voice_states WHERE channel_id = $1
		RETURNING user_id, channel_id, community_id, self_mute, self_deaf, server_mute, server_deaf, streaming, joined_at
	`, channelID)
	if err != nil {
		return nil, fmt.Errorf("remove voice states by channel: %w", err)
	}
	defer rows.Close()

	var states []models.VoiceState
	for rows.Next() {
		var vs models.VoiceState
		if err := rows.Scan(
			&vs.UserID, &vs.ChannelID, &vs.CommunityID,
			&vs.SelfMute, &vs.SelfDeaf, &vs.ServerMute, &vs.ServerDeaf,
			&vs.Streaming, &vs.JoinedAt,
		); err != nil {
			return nil, fmt.Errorf("scan removed voice state: %w", err)
		}
		states = append(states, vs)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate removed voice states: %w", err)
	}

	return states, nil
}
