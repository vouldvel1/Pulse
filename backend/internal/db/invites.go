package db

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// InviteQueries contains database operations for invites
type InviteQueries struct {
	pool *Pool
}

func NewInviteQueries(pool *Pool) *InviteQueries {
	return &InviteQueries{pool: pool}
}

// Create inserts a new invite
func (q *InviteQueries) Create(ctx context.Context, communityID, creatorID uuid.UUID, code string, maxUses *int, expiresAt *time.Time) (*models.Invite, error) {
	invite := &models.Invite{}
	err := q.pool.QueryRow(ctx, `
		INSERT INTO invites (community_id, creator_id, code, max_uses, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, code, community_id, creator_id, max_uses, uses, expires_at, created_at
	`, communityID, creatorID, code, maxUses, expiresAt).Scan(
		&invite.ID, &invite.Code, &invite.CommunityID, &invite.CreatorID,
		&invite.MaxUses, &invite.Uses, &invite.ExpiresAt, &invite.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create invite: %w", err)
	}
	return invite, nil
}

// GetByCode retrieves an invite by its code
func (q *InviteQueries) GetByCode(ctx context.Context, code string) (*models.Invite, error) {
	invite := &models.Invite{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, code, community_id, creator_id, max_uses, uses, expires_at, created_at
		FROM invites WHERE code = $1
	`, code).Scan(
		&invite.ID, &invite.Code, &invite.CommunityID, &invite.CreatorID,
		&invite.MaxUses, &invite.Uses, &invite.ExpiresAt, &invite.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get invite by code: %w", err)
	}
	return invite, nil
}

// Use atomically increments the use count if the invite is still valid
func (q *InviteQueries) Use(ctx context.Context, code string) (*models.Invite, error) {
	invite := &models.Invite{}
	err := q.pool.QueryRow(ctx, `
		UPDATE invites SET uses = uses + 1
		WHERE code = $1
		  AND (max_uses IS NULL OR uses < max_uses)
		  AND (expires_at IS NULL OR expires_at > NOW())
		RETURNING id, code, community_id, creator_id, max_uses, uses, expires_at, created_at
	`, code).Scan(
		&invite.ID, &invite.Code, &invite.CommunityID, &invite.CreatorID,
		&invite.MaxUses, &invite.Uses, &invite.ExpiresAt, &invite.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("use invite: %w", err)
	}
	return invite, nil
}

// ListByCommunity returns all invites for a community ordered by creation date descending
func (q *InviteQueries) ListByCommunity(ctx context.Context, communityID uuid.UUID) ([]*models.Invite, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, code, community_id, creator_id, max_uses, uses, expires_at, created_at
		FROM invites WHERE community_id = $1
		ORDER BY created_at DESC
	`, communityID)
	if err != nil {
		return nil, fmt.Errorf("list invites by community: %w", err)
	}
	defer rows.Close()

	var invites []*models.Invite
	for rows.Next() {
		inv := &models.Invite{}
		if err := rows.Scan(
			&inv.ID, &inv.Code, &inv.CommunityID, &inv.CreatorID,
			&inv.MaxUses, &inv.Uses, &inv.ExpiresAt, &inv.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan invite: %w", err)
		}
		invites = append(invites, inv)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate invites: %w", err)
	}

	return invites, nil
}

// Delete removes an invite by ID
func (q *InviteQueries) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		DELETE FROM invites WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete invite: %w", err)
	}
	return nil
}
