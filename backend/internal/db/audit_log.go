package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/models"
)

// AuditLogQueries contains database operations for audit logs
type AuditLogQueries struct {
	pool *Pool
}

func NewAuditLogQueries(pool *Pool) *AuditLogQueries {
	return &AuditLogQueries{pool: pool}
}

// Log creates a new audit log entry
func (q *AuditLogQueries) Log(ctx context.Context, communityID, actorID uuid.UUID, action, targetType string, targetID uuid.UUID, changes interface{}) error {
	var changesJSON []byte
	if changes != nil {
		var err error
		changesJSON, err = json.Marshal(changes)
		if err != nil {
			return fmt.Errorf("marshal audit log changes: %w", err)
		}
	}

	_, err := q.pool.Exec(ctx, `
		INSERT INTO audit_log (community_id, actor_id, action, target_type, target_id, changes)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, communityID, actorID, action, targetType, targetID, changesJSON)
	if err != nil {
		return fmt.Errorf("insert audit log: %w", err)
	}
	return nil
}

// List retrieves audit log entries for a community with cursor-based pagination
func (q *AuditLogQueries) List(ctx context.Context, communityID uuid.UUID, limit int, before *time.Time, actionFilter *string, actorFilter *uuid.UUID) ([]*models.AuditLogEntry, error) {
	query := `
		SELECT id, community_id, actor_id, action, target_type, target_id, changes, created_at
		FROM audit_log
		WHERE community_id = $1
	`
	args := []interface{}{communityID}
	argN := 2

	if before != nil {
		query += fmt.Sprintf(" AND created_at < $%d", argN)
		args = append(args, *before)
		argN++
	}
	if actionFilter != nil {
		query += fmt.Sprintf(" AND action = $%d", argN)
		args = append(args, *actionFilter)
		argN++
	}
	if actorFilter != nil {
		query += fmt.Sprintf(" AND actor_id = $%d", argN)
		args = append(args, *actorFilter)
		argN++
	}

	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d", argN)
	args = append(args, limit)

	rows, err := q.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list audit log: %w", err)
	}
	defer rows.Close()

	var entries []*models.AuditLogEntry
	for rows.Next() {
		entry := &models.AuditLogEntry{}
		if err := rows.Scan(
			&entry.ID, &entry.CommunityID, &entry.ActorID, &entry.Action,
			&entry.TargetType, &entry.TargetID, &entry.Changes, &entry.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan audit log entry: %w", err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate audit log: %w", err)
	}
	return entries, nil
}
