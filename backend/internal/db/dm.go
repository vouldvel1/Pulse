package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// DMQueries contains database operations for DM channels and messages
type DMQueries struct {
	pool *Pool
}

func NewDMQueries(pool *Pool) *DMQueries {
	return &DMQueries{pool: pool}
}

// CreateDMChannel creates a 1-on-1 DM channel between two users.
// If a DM channel already exists between them, returns the existing one.
func (q *DMQueries) CreateDMChannel(ctx context.Context, userA, userB uuid.UUID) (*models.DMChannelWithMembers, error) {
	// Check if a non-group DM already exists between these two users
	var existingID uuid.UUID
	err := q.pool.QueryRow(ctx, `
		SELECT dc.id
		FROM dm_channels dc
		JOIN dm_channel_members m1 ON dc.id = m1.channel_id AND m1.user_id = $1
		JOIN dm_channel_members m2 ON dc.id = m2.channel_id AND m2.user_id = $2
		WHERE dc.is_group = FALSE
		LIMIT 1
	`, userA, userB).Scan(&existingID)
	if err == nil {
		// Already exists, return it
		return q.GetDMChannel(ctx, existingID, userA)
	}
	if err != pgx.ErrNoRows {
		return nil, fmt.Errorf("check existing dm: %w", err)
	}

	// Create new DM channel
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin dm create tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var channelID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO dm_channels (is_group) VALUES (FALSE) RETURNING id
	`).Scan(&channelID)
	if err != nil {
		return nil, fmt.Errorf("insert dm channel: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO dm_channel_members (channel_id, user_id) VALUES ($1, $2), ($1, $3)
	`, channelID, userA, userB)
	if err != nil {
		return nil, fmt.Errorf("insert dm members: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit dm create: %w", err)
	}

	return q.GetDMChannel(ctx, channelID, userA)
}

// CreateGroupDM creates a group DM channel
func (q *DMQueries) CreateGroupDM(ctx context.Context, ownerID uuid.UUID, name string, memberIDs []uuid.UUID) (*models.DMChannelWithMembers, error) {
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin group dm create tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var channelID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO dm_channels (name, is_group, owner_id) VALUES ($1, TRUE, $2) RETURNING id
	`, name, ownerID).Scan(&channelID)
	if err != nil {
		return nil, fmt.Errorf("insert group dm channel: %w", err)
	}

	// Add owner as member
	_, err = tx.Exec(ctx, `
		INSERT INTO dm_channel_members (channel_id, user_id) VALUES ($1, $2)
	`, channelID, ownerID)
	if err != nil {
		return nil, fmt.Errorf("insert group dm owner: %w", err)
	}

	// Add other members
	for _, memberID := range memberIDs {
		if memberID == ownerID {
			continue // Already added
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO dm_channel_members (channel_id, user_id) VALUES ($1, $2)
		`, channelID, memberID)
		if err != nil {
			return nil, fmt.Errorf("insert group dm member %s: %w", memberID, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit group dm create: %w", err)
	}

	return q.GetDMChannel(ctx, channelID, ownerID)
}

// GetDMChannel retrieves a DM channel by ID with its members
func (q *DMQueries) GetDMChannel(ctx context.Context, channelID, userID uuid.UUID) (*models.DMChannelWithMembers, error) {
	// Verify user is a member
	var isMember bool
	err := q.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM dm_channel_members WHERE channel_id = $1 AND user_id = $2)
	`, channelID, userID).Scan(&isMember)
	if err != nil {
		return nil, fmt.Errorf("check dm membership: %w", err)
	}
	if !isMember {
		return nil, nil
	}

	ch := &models.DMChannelWithMembers{}
	err = q.pool.QueryRow(ctx, `
		SELECT id, name, is_group, owner_id, created_at
		FROM dm_channels WHERE id = $1
	`, channelID).Scan(&ch.ID, &ch.Name, &ch.IsGroup, &ch.OwnerID, &ch.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get dm channel: %w", err)
	}

	// Fetch members
	rows, err := q.pool.Query(ctx, `
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.status
		FROM dm_channel_members dcm
		JOIN users u ON dcm.user_id = u.id
		WHERE dcm.channel_id = $1
	`, channelID)
	if err != nil {
		return nil, fmt.Errorf("get dm members: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Status); err != nil {
			return nil, fmt.Errorf("scan dm member: %w", err)
		}
		ch.Members = append(ch.Members, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate dm members: %w", err)
	}

	return ch, nil
}

// ListDMChannels lists all DM channels a user belongs to, ordered by most recent message
func (q *DMQueries) ListDMChannels(ctx context.Context, userID uuid.UUID) ([]*models.DMChannelWithMembers, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT dc.id, dc.name, dc.is_group, dc.owner_id, dc.created_at
		FROM dm_channels dc
		JOIN dm_channel_members dcm ON dc.id = dcm.channel_id
		WHERE dcm.user_id = $1
		ORDER BY (
			SELECT COALESCE(MAX(dm.created_at), dc.created_at)
			FROM dm_messages dm WHERE dm.channel_id = dc.id AND dm.deleted_at IS NULL
		) DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list dm channels: %w", err)
	}
	defer rows.Close()

	var channels []*models.DMChannelWithMembers
	for rows.Next() {
		ch := &models.DMChannelWithMembers{}
		if err := rows.Scan(&ch.ID, &ch.Name, &ch.IsGroup, &ch.OwnerID, &ch.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan dm channel: %w", err)
		}
		channels = append(channels, ch)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate dm channels: %w", err)
	}

	// Populate members for each channel
	for _, ch := range channels {
		memberRows, err := q.pool.Query(ctx, `
			SELECT u.id, u.username, u.display_name, u.avatar_url, u.status
			FROM dm_channel_members dcm
			JOIN users u ON dcm.user_id = u.id
			WHERE dcm.channel_id = $1
		`, ch.ID)
		if err != nil {
			return nil, fmt.Errorf("get members for dm %s: %w", ch.ID, err)
		}

		for memberRows.Next() {
			var u models.User
			if err := memberRows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Status); err != nil {
				memberRows.Close()
				return nil, fmt.Errorf("scan member: %w", err)
			}
			ch.Members = append(ch.Members, u)
		}
		memberRows.Close()
		if err := memberRows.Err(); err != nil {
			return nil, fmt.Errorf("iterate members: %w", err)
		}
	}

	return channels, nil
}

// GetDMChannelMemberIDs returns all user IDs in a DM channel
func (q *DMQueries) GetDMChannelMemberIDs(ctx context.Context, channelID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT user_id FROM dm_channel_members WHERE channel_id = $1
	`, channelID)
	if err != nil {
		return nil, fmt.Errorf("get dm member ids: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan member id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate member ids: %w", err)
	}
	return ids, nil
}

// AddGroupDMMember adds a user to a group DM
func (q *DMQueries) AddGroupDMMember(ctx context.Context, channelID, userID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		INSERT INTO dm_channel_members (channel_id, user_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, channelID, userID)
	if err != nil {
		return fmt.Errorf("add group dm member: %w", err)
	}
	return nil
}

// RemoveGroupDMMember removes a user from a group DM
func (q *DMQueries) RemoveGroupDMMember(ctx context.Context, channelID, userID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		DELETE FROM dm_channel_members WHERE channel_id = $1 AND user_id = $2
	`, channelID, userID)
	if err != nil {
		return fmt.Errorf("remove group dm member: %w", err)
	}
	return nil
}

// CreateDMMessage creates a new message in a DM channel
func (q *DMQueries) CreateDMMessage(ctx context.Context, channelID, authorID uuid.UUID, content string, replyToID *uuid.UUID) (*models.DMMessage, error) {
	msg := &models.DMMessage{}
	author := &models.User{}

	err := q.pool.QueryRow(ctx, `
		INSERT INTO dm_messages (channel_id, author_id, content, reply_to_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, channel_id, author_id, content, reply_to_id, edited_at, created_at
	`, channelID, authorID, content, replyToID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
		&msg.ReplyToID, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert dm message: %w", err)
	}

	// Fetch author info
	err = q.pool.QueryRow(ctx, `
		SELECT id, username, display_name, avatar_url FROM users WHERE id = $1
	`, authorID).Scan(&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL)
	if err != nil {
		return nil, fmt.Errorf("get dm message author: %w", err)
	}
	msg.Author = author

	return msg, nil
}

// ListDMMessages retrieves DM messages with cursor-based pagination
func (q *DMQueries) ListDMMessages(ctx context.Context, channelID uuid.UUID, before *uuid.UUID, limit int) ([]*models.DMMessage, error) {
	var rows pgx.Rows
	var err error

	if before != nil {
		rows, err = q.pool.Query(ctx, `
			SELECT m.id, m.channel_id, m.author_id, m.content, m.reply_to_id,
			       m.edited_at, m.created_at,
			       u.id, u.username, u.display_name, u.avatar_url
			FROM dm_messages m
			JOIN users u ON m.author_id = u.id
			WHERE m.channel_id = $1 AND m.deleted_at IS NULL
			  AND m.created_at < (SELECT created_at FROM dm_messages WHERE id = $2)
			ORDER BY m.created_at DESC
			LIMIT $3
		`, channelID, *before, limit)
	} else {
		rows, err = q.pool.Query(ctx, `
			SELECT m.id, m.channel_id, m.author_id, m.content, m.reply_to_id,
			       m.edited_at, m.created_at,
			       u.id, u.username, u.display_name, u.avatar_url
			FROM dm_messages m
			JOIN users u ON m.author_id = u.id
			WHERE m.channel_id = $1 AND m.deleted_at IS NULL
			ORDER BY m.created_at DESC
			LIMIT $2
		`, channelID, limit)
	}
	if err != nil {
		return nil, fmt.Errorf("list dm messages: %w", err)
	}
	defer rows.Close()

	var messages []*models.DMMessage
	for rows.Next() {
		msg := &models.DMMessage{}
		author := &models.User{}
		if err := rows.Scan(
			&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
			&msg.ReplyToID, &msg.EditedAt, &msg.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
		); err != nil {
			return nil, fmt.Errorf("scan dm message: %w", err)
		}
		msg.Author = author
		messages = append(messages, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate dm messages: %w", err)
	}

	return messages, nil
}

// GetDMMessage retrieves a single DM message by ID
func (q *DMQueries) GetDMMessage(ctx context.Context, messageID uuid.UUID) (*models.DMMessage, error) {
	msg := &models.DMMessage{}
	author := &models.User{}

	err := q.pool.QueryRow(ctx, `
		SELECT m.id, m.channel_id, m.author_id, m.content, m.reply_to_id,
		       m.edited_at, m.created_at,
		       u.id, u.username, u.display_name, u.avatar_url
		FROM dm_messages m
		JOIN users u ON m.author_id = u.id
		WHERE m.id = $1 AND m.deleted_at IS NULL
	`, messageID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
		&msg.ReplyToID, &msg.EditedAt, &msg.CreatedAt,
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get dm message: %w", err)
	}
	msg.Author = author
	return msg, nil
}

// EditDMMessage edits a DM message (only the author can edit)
func (q *DMQueries) EditDMMessage(ctx context.Context, messageID, authorID uuid.UUID, content string) (*models.DMMessage, error) {
	msg := &models.DMMessage{}
	author := &models.User{}

	err := q.pool.QueryRow(ctx, `
		UPDATE dm_messages SET content = $1, edited_at = NOW()
		WHERE id = $2 AND author_id = $3 AND deleted_at IS NULL
		RETURNING id, channel_id, author_id, content, reply_to_id, edited_at, created_at
	`, content, messageID, authorID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
		&msg.ReplyToID, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("edit dm message: %w", err)
	}

	err = q.pool.QueryRow(ctx, `
		SELECT id, username, display_name, avatar_url FROM users WHERE id = $1
	`, authorID).Scan(&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL)
	if err != nil {
		return nil, fmt.Errorf("get dm message author: %w", err)
	}
	msg.Author = author

	return msg, nil
}

// DeleteDMMessage soft-deletes a DM message (only the author can delete)
func (q *DMQueries) DeleteDMMessage(ctx context.Context, messageID, authorID uuid.UUID) (uuid.UUID, error) {
	var channelID uuid.UUID
	err := q.pool.QueryRow(ctx, `
		UPDATE dm_messages SET deleted_at = NOW()
		WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
		RETURNING channel_id
	`, messageID, authorID).Scan(&channelID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return uuid.Nil, nil
		}
		return uuid.Nil, fmt.Errorf("delete dm message: %w", err)
	}
	return channelID, nil
}

// IsDMChannelMember checks if a user is a member of a DM channel
func (q *DMQueries) IsDMChannelMember(ctx context.Context, channelID, userID uuid.UUID) (bool, error) {
	var exists bool
	err := q.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM dm_channel_members WHERE channel_id = $1 AND user_id = $2)
	`, channelID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check dm membership: %w", err)
	}
	return exists, nil
}
