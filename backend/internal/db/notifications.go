package db

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/models"
)

// ErrNotificationNotFound is returned by MarkRead when the notification does
// not exist or does not belong to the requesting user.
// L15: allows the handler to return 404 instead of a generic 500.
var ErrNotificationNotFound = errors.New("notification not found")

// NotificationQueries contains database operations for notifications
type NotificationQueries struct {
	pool *Pool
}

func NewNotificationQueries(pool *Pool) *NotificationQueries {
	return &NotificationQueries{pool: pool}
}

// Create inserts a new notification
func (q *NotificationQueries) Create(ctx context.Context, userID uuid.UUID, notifType, title, body string, resourceID *uuid.UUID) (*models.Notification, error) {
	notif := &models.Notification{}
	err := q.pool.QueryRow(ctx, `
		INSERT INTO notifications (user_id, type, title, body, resource_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, type, title, body, resource_id, read, created_at
	`, userID, notifType, title, body, resourceID).Scan(
		&notif.ID, &notif.UserID, &notif.Type, &notif.Title,
		&notif.Body, &notif.ResourceID, &notif.Read, &notif.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create notification: %w", err)
	}
	return notif, nil
}

// List retrieves notifications for a user with cursor-based pagination
func (q *NotificationQueries) List(ctx context.Context, userID uuid.UUID, before *uuid.UUID, limit int, unreadOnly bool) ([]*models.Notification, error) {
	var query string
	var args []interface{}

	if unreadOnly {
		if before != nil {
			query = `
				SELECT id, user_id, type, title, body, resource_id, read, created_at
				FROM notifications
				WHERE user_id = $1 AND read = FALSE
				  AND created_at < (SELECT created_at FROM notifications WHERE id = $2)
				ORDER BY created_at DESC
				LIMIT $3
			`
			args = []interface{}{userID, *before, limit}
		} else {
			query = `
				SELECT id, user_id, type, title, body, resource_id, read, created_at
				FROM notifications
				WHERE user_id = $1 AND read = FALSE
				ORDER BY created_at DESC
				LIMIT $2
			`
			args = []interface{}{userID, limit}
		}
	} else {
		if before != nil {
			query = `
				SELECT id, user_id, type, title, body, resource_id, read, created_at
				FROM notifications
				WHERE user_id = $1
				  AND created_at < (SELECT created_at FROM notifications WHERE id = $2)
				ORDER BY created_at DESC
				LIMIT $3
			`
			args = []interface{}{userID, *before, limit}
		} else {
			query = `
				SELECT id, user_id, type, title, body, resource_id, read, created_at
				FROM notifications
				WHERE user_id = $1
				ORDER BY created_at DESC
				LIMIT $2
			`
			args = []interface{}{userID, limit}
		}
	}

	rows, err := q.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()

	var notifications []*models.Notification
	for rows.Next() {
		n := &models.Notification{}
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &n.ResourceID, &n.Read, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		notifications = append(notifications, n)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notifications: %w", err)
	}

	return notifications, nil
}

// MarkRead marks a single notification as read.
// Returns ErrNotificationNotFound if the notification does not exist or does
// not belong to userID, so callers can return 404 instead of 500.
func (q *NotificationQueries) MarkRead(ctx context.Context, notifID, userID uuid.UUID) error {
	result, err := q.pool.Exec(ctx, `
		UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2
	`, notifID, userID)
	if err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotificationNotFound
	}
	return nil
}

// MarkAllRead marks all notifications as read for a user
func (q *NotificationQueries) MarkAllRead(ctx context.Context, userID uuid.UUID) (int64, error) {
	result, err := q.pool.Exec(ctx, `
		UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE
	`, userID)
	if err != nil {
		return 0, fmt.Errorf("mark all read: %w", err)
	}
	return result.RowsAffected(), nil
}

// GetUnreadCount returns the number of unread notifications for a user
func (q *NotificationQueries) GetUnreadCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := q.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE
	`, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("get unread count: %w", err)
	}
	return count, nil
}

// Delete removes a notification
func (q *NotificationQueries) Delete(ctx context.Context, notifID, userID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		DELETE FROM notifications WHERE id = $1 AND user_id = $2
	`, notifID, userID)
	if err != nil {
		return fmt.Errorf("delete notification: %w", err)
	}
	return nil
}

// CleanOld removes notifications older than a given number of days.
// L3: This method is not currently called by any handler. It is retained for
// use by a scheduled maintenance job or admin endpoint.
func (q *NotificationQueries) CleanOld(ctx context.Context, days int) (int64, error) {
	result, err := q.pool.Exec(ctx, `
		DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '1 day' * $1
	`, days)
	if err != nil {
		return 0, fmt.Errorf("clean old notifications: %w", err)
	}
	return result.RowsAffected(), nil
}
