package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// ChannelQueries contains database operations for channels
type ChannelQueries struct {
	pool *Pool
}

func NewChannelQueries(pool *Pool) *ChannelQueries {
	return &ChannelQueries{pool: pool}
}

// Create inserts a new channel into a community with the next available position
func (q *ChannelQueries) Create(ctx context.Context, communityID uuid.UUID, name string, channelType string, parentID *uuid.UUID, topic *string, isPrivate bool) (*models.Channel, error) {
	// Get the current max position for this community
	var maxPos int
	err := q.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(position), 0) FROM channels WHERE community_id = $1
	`, communityID).Scan(&maxPos)
	if err != nil {
		return nil, fmt.Errorf("get max channel position: %w", err)
	}

	ch := &models.Channel{}
	err = q.pool.QueryRow(ctx, `
		INSERT INTO channels (community_id, name, type, parent_id, topic, is_private, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, community_id, parent_id, name, topic, type, position, is_private, created_at, updated_at
	`, communityID, name, channelType, parentID, topic, isPrivate, maxPos+1).Scan(
		&ch.ID, &ch.CommunityID, &ch.ParentID, &ch.Name, &ch.Topic,
		&ch.Type, &ch.Position, &ch.IsPrivate, &ch.CreatedAt, &ch.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create channel: %w", err)
	}
	return ch, nil
}

// GetByID retrieves a channel by its ID
func (q *ChannelQueries) GetByID(ctx context.Context, id uuid.UUID) (*models.Channel, error) {
	ch := &models.Channel{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, community_id, parent_id, name, topic, type, position, is_private, created_at, updated_at
		FROM channels WHERE id = $1
	`, id).Scan(
		&ch.ID, &ch.CommunityID, &ch.ParentID, &ch.Name, &ch.Topic,
		&ch.Type, &ch.Position, &ch.IsPrivate, &ch.CreatedAt, &ch.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get channel by id: %w", err)
	}
	return ch, nil
}

// Update dynamically updates channel fields
func (q *ChannelQueries) Update(ctx context.Context, id uuid.UUID, name *string, topic *string, position *int, isPrivate *bool) (*models.Channel, error) {
	setClauses := []string{}
	args := []interface{}{id}
	argIdx := 2

	// String fields use COALESCE pattern
	if name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = COALESCE($%d, name)", argIdx))
		args = append(args, name)
		argIdx++
	}
	if topic != nil {
		setClauses = append(setClauses, fmt.Sprintf("topic = COALESCE($%d, topic)", argIdx))
		args = append(args, topic)
		argIdx++
	}

	// Non-string fields use conditional SET
	if position != nil {
		setClauses = append(setClauses, fmt.Sprintf("position = $%d", argIdx))
		args = append(args, *position)
		argIdx++
	}
	if isPrivate != nil {
		setClauses = append(setClauses, fmt.Sprintf("is_private = $%d", argIdx))
		args = append(args, *isPrivate)
		argIdx++
	}

	if len(setClauses) == 0 {
		return q.GetByID(ctx, id)
	}

	setClauses = append(setClauses, "updated_at = NOW()")

	query := fmt.Sprintf(`
		UPDATE channels SET %s
		WHERE id = $1
		RETURNING id, community_id, parent_id, name, topic, type, position, is_private, created_at, updated_at
	`, strings.Join(setClauses, ", "))

	ch := &models.Channel{}
	err := q.pool.QueryRow(ctx, query, args...).Scan(
		&ch.ID, &ch.CommunityID, &ch.ParentID, &ch.Name, &ch.Topic,
		&ch.Type, &ch.Position, &ch.IsPrivate, &ch.CreatedAt, &ch.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("update channel: %w", err)
	}
	return ch, nil
}

// Delete hard-deletes a channel by ID
func (q *ChannelQueries) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		DELETE FROM channels WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete channel: %w", err)
	}
	return nil
}

// ListByCommunity retrieves all channels for a community ordered by position and creation time
func (q *ChannelQueries) ListByCommunity(ctx context.Context, communityID uuid.UUID) ([]*models.Channel, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, community_id, parent_id, name, topic, type, position, is_private, created_at, updated_at
		FROM channels
		WHERE community_id = $1
		ORDER BY position, created_at
	`, communityID)
	if err != nil {
		return nil, fmt.Errorf("list channels by community: %w", err)
	}
	defer rows.Close()

	var channels []*models.Channel
	for rows.Next() {
		ch := &models.Channel{}
		if err := rows.Scan(
			&ch.ID, &ch.CommunityID, &ch.ParentID, &ch.Name, &ch.Topic,
			&ch.Type, &ch.Position, &ch.IsPrivate, &ch.CreatedAt, &ch.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan channel: %w", err)
		}
		channels = append(channels, ch)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate channels: %w", err)
	}

	return channels, nil
}

// SetPermissionOverwrite upserts a channel permission overwrite for a role
func (q *ChannelQueries) SetPermissionOverwrite(ctx context.Context, channelID, roleID uuid.UUID, allow, deny int64) error {
	_, err := q.pool.Exec(ctx, `
		INSERT INTO channel_permission_overwrites (channel_id, role_id, allow, deny)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (channel_id, role_id) DO UPDATE SET allow = EXCLUDED.allow, deny = EXCLUDED.deny
	`, channelID, roleID, allow, deny)
	if err != nil {
		return fmt.Errorf("set permission overwrite: %w", err)
	}
	return nil
}

// DeletePermissionOverwrite removes a channel permission overwrite for a role
func (q *ChannelQueries) DeletePermissionOverwrite(ctx context.Context, channelID, roleID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		DELETE FROM channel_permission_overwrites WHERE channel_id = $1 AND role_id = $2
	`, channelID, roleID)
	if err != nil {
		return fmt.Errorf("delete permission overwrite: %w", err)
	}
	return nil
}

// GetPermissionOverwrites retrieves all permission overwrites for a channel
func (q *ChannelQueries) GetPermissionOverwrites(ctx context.Context, channelID uuid.UUID) ([]*models.ChannelPermissionOverwrite, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT channel_id, role_id, allow, deny
		FROM channel_permission_overwrites
		WHERE channel_id = $1
	`, channelID)
	if err != nil {
		return nil, fmt.Errorf("get permission overwrites: %w", err)
	}
	defer rows.Close()

	var overwrites []*models.ChannelPermissionOverwrite
	for rows.Next() {
		ow := &models.ChannelPermissionOverwrite{}
		if err := rows.Scan(&ow.ChannelID, &ow.RoleID, &ow.Allow, &ow.Deny); err != nil {
			return nil, fmt.Errorf("scan permission overwrite: %w", err)
		}
		overwrites = append(overwrites, ow)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate permission overwrites: %w", err)
	}

	return overwrites, nil
}

// GetUserChannelPermissions computes the effective permissions for a user in a channel.
// It first aggregates base permissions from all the user's roles in the community,
// then applies channel-specific permission overwrites (deny removes bits, allow adds bits).
func (q *ChannelQueries) GetUserChannelPermissions(ctx context.Context, userID, channelID, communityID uuid.UUID) (int64, error) {
	// Step 1: Get the combined base permissions from all roles the user has in this community
	var basePerms int64
	err := q.pool.QueryRow(ctx, `
		SELECT COALESCE(BIT_OR(r.permissions), 0)
		FROM roles r
		INNER JOIN member_roles mr ON mr.role_id = r.id
		WHERE mr.user_id = $1 AND mr.community_id = $2
	`, userID, communityID).Scan(&basePerms)
	if err != nil {
		return 0, fmt.Errorf("get user base permissions: %w", err)
	}

	// Admin bypasses all permission checks
	if basePerms&models.PermAdmin != 0 {
		return basePerms, nil
	}

	// Step 2: Get channel permission overwrites for all roles the user holds
	rows, err := q.pool.Query(ctx, `
		SELECT cpo.allow, cpo.deny
		FROM channel_permission_overwrites cpo
		INNER JOIN member_roles mr ON mr.role_id = cpo.role_id
		WHERE cpo.channel_id = $1 AND mr.user_id = $2 AND mr.community_id = $3
	`, channelID, userID, communityID)
	if err != nil {
		return 0, fmt.Errorf("get channel permission overwrites: %w", err)
	}
	defer rows.Close()

	// Step 3: Aggregate overwrites — deny clears bits, allow sets bits
	perms := basePerms
	for rows.Next() {
		var allow, deny int64
		if err := rows.Scan(&allow, &deny); err != nil {
			return 0, fmt.Errorf("scan channel permission overwrite: %w", err)
		}
		perms &^= deny
		perms |= allow
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate channel permission overwrites: %w", err)
	}

	return perms, nil
}
