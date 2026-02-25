package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/models"
)

// SearchQueries contains database operations for full-text search
type SearchQueries struct {
	pool *Pool
}

func NewSearchQueries(pool *Pool) *SearchQueries {
	return &SearchQueries{pool: pool}
}

// SearchMessages performs FTS across messages in communities the user belongs to.
// It returns messages with author info, sorted by relevance (ts_rank).
// Supports optional filters: communityID (restrict to one community), channelID (restrict to one channel).
func (q *SearchQueries) SearchMessages(
	ctx context.Context,
	userID uuid.UUID,
	query string,
	communityID *uuid.UUID,
	channelID *uuid.UUID,
	limit int,
	offset int,
) ([]*models.SearchResult, int, error) {
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}

	// Build the WHERE clause dynamically
	args := []interface{}{query, userID}
	argIdx := 3

	communityFilter := ""
	if communityID != nil {
		communityFilter = fmt.Sprintf(" AND ch.community_id = $%d", argIdx)
		args = append(args, *communityID)
		argIdx++
	}

	channelFilter := ""
	if channelID != nil {
		channelFilter = fmt.Sprintf(" AND m.channel_id = $%d", argIdx)
		args = append(args, *channelID)
		argIdx++
	}

	// Count total matches first
	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM messages m
		JOIN channels ch ON ch.id = m.channel_id
		JOIN community_members cm ON cm.community_id = ch.community_id AND cm.user_id = $2
		WHERE m.search_vector @@ plainto_tsquery('english', $1)
		  AND m.deleted_at IS NULL
		  %s%s
	`, communityFilter, channelFilter)

	var total int
	err := q.pool.QueryRow(ctx, countSQL, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("search count: %w", err)
	}

	if total == 0 {
		return []*models.SearchResult{}, 0, nil
	}

	// Fetch results with relevance ranking
	limitArg := fmt.Sprintf("$%d", argIdx)
	args = append(args, limit)
	argIdx++
	offsetArg := fmt.Sprintf("$%d", argIdx)
	args = append(args, offset)

	searchSQL := fmt.Sprintf(`
		SELECT
			m.id, m.channel_id, m.author_id, m.content, m.created_at,
			u.id, u.username, u.display_name, u.avatar_url,
			ch.name, ch.community_id,
			c.name,
			ts_rank(m.search_vector, plainto_tsquery('english', $1)) AS rank
		FROM messages m
		JOIN channels ch ON ch.id = m.channel_id
		JOIN communities c ON c.id = ch.community_id
		JOIN community_members cm ON cm.community_id = ch.community_id AND cm.user_id = $2
		JOIN users u ON u.id = m.author_id
		WHERE m.search_vector @@ plainto_tsquery('english', $1)
		  AND m.deleted_at IS NULL
		  %s%s
		ORDER BY rank DESC, m.created_at DESC
		LIMIT %s OFFSET %s
	`, communityFilter, channelFilter, limitArg, offsetArg)

	rows, err := q.pool.Query(ctx, searchSQL, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("search query: %w", err)
	}
	defer rows.Close()

	var results []*models.SearchResult
	for rows.Next() {
		r := &models.SearchResult{}
		var rank float64
		err := rows.Scan(
			&r.MessageID, &r.ChannelID, &r.AuthorID, &r.Content, &r.CreatedAt,
			&r.AuthorUserID, &r.AuthorUsername, &r.AuthorDisplayName, &r.AuthorAvatarURL,
			&r.ChannelName, &r.CommunityID,
			&r.CommunityName,
			&rank,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("search scan: %w", err)
		}
		r.Relevance = rank
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("search rows: %w", err)
	}

	if results == nil {
		results = []*models.SearchResult{}
	}

	return results, total, nil
}
