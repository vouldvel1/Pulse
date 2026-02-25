package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// MessageQueries contains database operations for messages
type MessageQueries struct {
	pool *Pool
}

func NewMessageQueries(pool *Pool) *MessageQueries {
	return &MessageQueries{pool: pool}
}

// Create inserts a new message and returns it with author info
func (q *MessageQueries) Create(ctx context.Context, channelID, authorID uuid.UUID, content string, replyToID *uuid.UUID) (*models.Message, error) {
	msg := &models.Message{}
	err := q.pool.QueryRow(ctx, `
		INSERT INTO messages (channel_id, author_id, content, reply_to_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, channel_id, author_id, content, reply_to_id, pinned, edited_at, created_at
	`, channelID, authorID, content, replyToID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
		&msg.ReplyToID, &msg.Pinned, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create message: %w", err)
	}

	author, err := q.fetchAuthor(ctx, msg.AuthorID)
	if err != nil {
		return nil, fmt.Errorf("create message: fetch author: %w", err)
	}
	msg.Author = author

	return msg, nil
}

// GetByID retrieves a message by ID with author info
func (q *MessageQueries) GetByID(ctx context.Context, id uuid.UUID) (*models.Message, error) {
	msg := &models.Message{}
	author := &models.User{}
	err := q.pool.QueryRow(ctx, `
		SELECT m.id, m.channel_id, m.author_id, m.content, m.reply_to_id, m.pinned,
		       m.edited_at, m.created_at,
		       u.id, u.username, u.display_name, u.avatar_url
		FROM messages m
		JOIN users u ON m.author_id = u.id
		WHERE m.id = $1 AND m.deleted_at IS NULL
	`, id).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
		&msg.ReplyToID, &msg.Pinned, &msg.EditedAt, &msg.CreatedAt,
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get message by id: %w", err)
	}
	msg.Author = author

	return msg, nil
}

// List retrieves messages in a channel with cursor-based pagination
func (q *MessageQueries) List(ctx context.Context, channelID uuid.UUID, before *uuid.UUID, limit int) ([]*models.Message, error) {
	var rows pgx.Rows
	var err error

	if before != nil {
		rows, err = q.pool.Query(ctx, `
			SELECT m.id, m.channel_id, m.author_id, m.content, m.reply_to_id, m.pinned,
			       m.edited_at, m.created_at,
			       u.id, u.username, u.display_name, u.avatar_url
			FROM messages m
			JOIN users u ON m.author_id = u.id
			WHERE m.channel_id = $1 AND m.deleted_at IS NULL
			  AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)
			ORDER BY m.created_at DESC
			LIMIT $3
		`, channelID, *before, limit)
	} else {
		rows, err = q.pool.Query(ctx, `
			SELECT m.id, m.channel_id, m.author_id, m.content, m.reply_to_id, m.pinned,
			       m.edited_at, m.created_at,
			       u.id, u.username, u.display_name, u.avatar_url
			FROM messages m
			JOIN users u ON m.author_id = u.id
			WHERE m.channel_id = $1 AND m.deleted_at IS NULL
			ORDER BY m.created_at DESC
			LIMIT $2
		`, channelID, limit)
	}
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()

	var messages []*models.Message
	var messageIDs []uuid.UUID
	for rows.Next() {
		msg := &models.Message{}
		author := &models.User{}
		if err := rows.Scan(
			&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
			&msg.ReplyToID, &msg.Pinned, &msg.EditedAt, &msg.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
		); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		msg.Author = author
		messages = append(messages, msg)
		messageIDs = append(messageIDs, msg.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate messages: %w", err)
	}

	if len(messages) == 0 {
		return messages, nil
	}

	// Batch-fetch attachments
	attachmentMap, err := q.batchFetchAttachments(ctx, messageIDs)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}

	// Batch-fetch reactions
	reactionMap, err := q.batchFetchReactions(ctx, messageIDs)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}

	for _, msg := range messages {
		msg.Attachments = attachmentMap[msg.ID]
		msg.Reactions = reactionMap[msg.ID]
	}

	return messages, nil
}

// Update modifies a message's content (only by the author)
func (q *MessageQueries) Update(ctx context.Context, id, authorID uuid.UUID, content string) (*models.Message, error) {
	msg := &models.Message{}
	err := q.pool.QueryRow(ctx, `
		UPDATE messages SET content = $1, edited_at = NOW()
		WHERE id = $2 AND author_id = $3 AND deleted_at IS NULL
		RETURNING id, channel_id, author_id, content, reply_to_id, pinned, edited_at, created_at
	`, content, id, authorID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
		&msg.ReplyToID, &msg.Pinned, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("update message: %w", err)
	}

	author, err := q.fetchAuthor(ctx, msg.AuthorID)
	if err != nil {
		return nil, fmt.Errorf("update message: fetch author: %w", err)
	}
	msg.Author = author

	return msg, nil
}

// Delete soft-deletes a message
func (q *MessageQueries) Delete(ctx context.Context, id, userID uuid.UUID, isModerator bool) error {
	var query string
	var args []interface{}

	if isModerator {
		query = `UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`
		args = []interface{}{id}
	} else {
		query = `UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL`
		args = []interface{}{id, userID}
	}

	result, err := q.pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("delete message: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("delete message: message not found or not authorized")
	}

	return nil
}

// Pin sets the pinned status of a message
func (q *MessageQueries) Pin(ctx context.Context, id uuid.UUID, pinned bool) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE messages SET pinned = $1 WHERE id = $2 AND deleted_at IS NULL
	`, pinned, id)
	if err != nil {
		return fmt.Errorf("pin message: %w", err)
	}
	return nil
}

// GetPinned retrieves all pinned messages in a channel
func (q *MessageQueries) GetPinned(ctx context.Context, channelID uuid.UUID) ([]*models.Message, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT m.id, m.channel_id, m.author_id, m.content, m.reply_to_id, m.pinned,
		       m.edited_at, m.created_at,
		       u.id, u.username, u.display_name, u.avatar_url
		FROM messages m
		JOIN users u ON m.author_id = u.id
		WHERE m.channel_id = $1 AND m.pinned = true AND m.deleted_at IS NULL
		ORDER BY m.created_at DESC
	`, channelID)
	if err != nil {
		return nil, fmt.Errorf("get pinned messages: %w", err)
	}
	defer rows.Close()

	var messages []*models.Message
	for rows.Next() {
		msg := &models.Message{}
		author := &models.User{}
		if err := rows.Scan(
			&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content,
			&msg.ReplyToID, &msg.Pinned, &msg.EditedAt, &msg.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
		); err != nil {
			return nil, fmt.Errorf("scan pinned message: %w", err)
		}
		msg.Author = author
		messages = append(messages, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pinned messages: %w", err)
	}

	return messages, nil
}

// AddReaction adds a reaction to a message
func (q *MessageQueries) AddReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) (*models.Reaction, error) {
	reaction := &models.Reaction{}
	err := q.pool.QueryRow(ctx, `
		INSERT INTO reactions (message_id, user_id, emoji)
		VALUES ($1, $2, $3)
		RETURNING id, message_id, user_id, emoji, created_at
	`, messageID, userID, emoji).Scan(
		&reaction.ID, &reaction.MessageID, &reaction.UserID, &reaction.Emoji, &reaction.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("add reaction: %w", err)
	}
	return reaction, nil
}

// RemoveReaction removes a reaction from a message
func (q *MessageQueries) RemoveReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	_, err := q.pool.Exec(ctx, `
		DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3
	`, messageID, userID, emoji)
	if err != nil {
		return fmt.Errorf("remove reaction: %w", err)
	}
	return nil
}

// GetReactions retrieves aggregated reactions for a message
func (q *MessageQueries) GetReactions(ctx context.Context, messageID uuid.UUID, requestingUserID uuid.UUID) ([]models.ReactionAgg, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT emoji, COUNT(*) as count, BOOL_OR(user_id = $2) as me
		FROM reactions
		WHERE message_id = $1
		GROUP BY emoji
		ORDER BY MIN(created_at)
	`, messageID, requestingUserID)
	if err != nil {
		return nil, fmt.Errorf("get reactions: %w", err)
	}
	defer rows.Close()

	var reactions []models.ReactionAgg
	for rows.Next() {
		r := models.ReactionAgg{}
		if err := rows.Scan(&r.Emoji, &r.Count, &r.Me); err != nil {
			return nil, fmt.Errorf("scan reaction: %w", err)
		}
		reactions = append(reactions, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reactions: %w", err)
	}

	return reactions, nil
}

// CreateAttachment inserts a new attachment for a message
func (q *MessageQueries) CreateAttachment(ctx context.Context, messageID uuid.UUID, fileName string, fileSize int64, mimeType, url string, width, height *int) (*models.Attachment, error) {
	att := &models.Attachment{}
	err := q.pool.QueryRow(ctx, `
		INSERT INTO attachments (message_id, file_name, file_size, mime_type, url, width, height)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, message_id, file_name, file_size, mime_type, url, width, height, created_at
	`, messageID, fileName, fileSize, mimeType, url, width, height).Scan(
		&att.ID, &att.MessageID, &att.FileName, &att.FileSize,
		&att.MimeType, &att.URL, &att.Width, &att.Height, &att.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create attachment: %w", err)
	}
	return att, nil
}

// GetAttachments retrieves all attachments for a message
func (q *MessageQueries) GetAttachments(ctx context.Context, messageID uuid.UUID) ([]models.Attachment, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, message_id, file_name, file_size, mime_type, url, width, height, created_at
		FROM attachments
		WHERE message_id = $1
		ORDER BY created_at
	`, messageID)
	if err != nil {
		return nil, fmt.Errorf("get attachments: %w", err)
	}
	defer rows.Close()

	var attachments []models.Attachment
	for rows.Next() {
		a := models.Attachment{}
		if err := rows.Scan(
			&a.ID, &a.MessageID, &a.FileName, &a.FileSize,
			&a.MimeType, &a.URL, &a.Width, &a.Height, &a.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan attachment: %w", err)
		}
		attachments = append(attachments, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate attachments: %w", err)
	}

	return attachments, nil
}

// fetchAuthor retrieves basic user info for a message author
func (q *MessageQueries) fetchAuthor(ctx context.Context, userID uuid.UUID) (*models.User, error) {
	author := &models.User{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, username, display_name, avatar_url
		FROM users WHERE id = $1
	`, userID).Scan(
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
	)
	if err != nil {
		return nil, fmt.Errorf("fetch author: %w", err)
	}
	return author, nil
}

// batchFetchAttachments retrieves attachments for multiple messages at once
func (q *MessageQueries) batchFetchAttachments(ctx context.Context, messageIDs []uuid.UUID) (map[uuid.UUID][]models.Attachment, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, message_id, file_name, file_size, mime_type, url, width, height, created_at
		FROM attachments
		WHERE message_id = ANY($1)
		ORDER BY created_at
	`, messageIDs)
	if err != nil {
		return nil, fmt.Errorf("batch fetch attachments: %w", err)
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]models.Attachment)
	for rows.Next() {
		a := models.Attachment{}
		if err := rows.Scan(
			&a.ID, &a.MessageID, &a.FileName, &a.FileSize,
			&a.MimeType, &a.URL, &a.Width, &a.Height, &a.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan attachment: %w", err)
		}
		result[a.MessageID] = append(result[a.MessageID], a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate attachments: %w", err)
	}

	return result, nil
}

// batchFetchReactions retrieves aggregated reactions for multiple messages at once
func (q *MessageQueries) batchFetchReactions(ctx context.Context, messageIDs []uuid.UUID) (map[uuid.UUID][]models.ReactionAgg, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT message_id, emoji, COUNT(*) as count
		FROM reactions
		WHERE message_id = ANY($1)
		GROUP BY message_id, emoji
		ORDER BY message_id, MIN(created_at)
	`, messageIDs)
	if err != nil {
		return nil, fmt.Errorf("batch fetch reactions: %w", err)
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]models.ReactionAgg)
	for rows.Next() {
		var msgID uuid.UUID
		r := models.ReactionAgg{}
		if err := rows.Scan(&msgID, &r.Emoji, &r.Count); err != nil {
			return nil, fmt.Errorf("scan reaction: %w", err)
		}
		result[msgID] = append(result[msgID], r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reactions: %w", err)
	}

	return result, nil
}
