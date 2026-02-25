package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// RoleQueries contains database operations for roles
type RoleQueries struct {
	pool *Pool
}

func NewRoleQueries(pool *Pool) *RoleQueries {
	return &RoleQueries{pool: pool}
}

// Create inserts a new role into a community
func (q *RoleQueries) Create(ctx context.Context, communityID uuid.UUID, name string, color *string, permissions int64) (*models.Role, error) {
	// Position = max existing position + 1
	var maxPos int
	err := q.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(position), 0) FROM roles WHERE community_id = $1
	`, communityID).Scan(&maxPos)
	if err != nil {
		return nil, fmt.Errorf("get max role position: %w", err)
	}

	role := &models.Role{}
	err = q.pool.QueryRow(ctx, `
		INSERT INTO roles (community_id, name, color, position, permissions, is_default)
		VALUES ($1, $2, $3, $4, $5, false)
		RETURNING id, community_id, name, color, position, permissions, is_default, created_at, updated_at
	`, communityID, name, color, maxPos+1, permissions).Scan(
		&role.ID, &role.CommunityID, &role.Name, &role.Color, &role.Position,
		&role.Permissions, &role.IsDefault, &role.CreatedAt, &role.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert role: %w", err)
	}
	return role, nil
}

// GetByID retrieves a role by ID
func (q *RoleQueries) GetByID(ctx context.Context, id uuid.UUID) (*models.Role, error) {
	role := &models.Role{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, community_id, name, color, position, permissions, is_default, created_at, updated_at
		FROM roles WHERE id = $1
	`, id).Scan(
		&role.ID, &role.CommunityID, &role.Name, &role.Color, &role.Position,
		&role.Permissions, &role.IsDefault, &role.CreatedAt, &role.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get role by id: %w", err)
	}
	return role, nil
}

// Update modifies a role's name, color, and/or permissions
func (q *RoleQueries) Update(ctx context.Context, id uuid.UUID, name *string, color *string, permissions *int64) (*models.Role, error) {
	role := &models.Role{}
	err := q.pool.QueryRow(ctx, `
		UPDATE roles SET
			name        = COALESCE($2, name),
			color       = COALESCE($3, color),
			permissions = COALESCE($4, permissions)
		WHERE id = $1 AND is_default = false
		RETURNING id, community_id, name, color, position, permissions, is_default, created_at, updated_at
	`, id, name, color, permissions).Scan(
		&role.ID, &role.CommunityID, &role.Name, &role.Color, &role.Position,
		&role.Permissions, &role.IsDefault, &role.CreatedAt, &role.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("update role: %w", err)
	}
	return role, nil
}

// UpdateDefaultPermissions updates only the permissions of the @everyone (default) role
func (q *RoleQueries) UpdateDefaultPermissions(ctx context.Context, communityID uuid.UUID, permissions int64) (*models.Role, error) {
	role := &models.Role{}
	err := q.pool.QueryRow(ctx, `
		UPDATE roles SET permissions = $2
		WHERE community_id = $1 AND is_default = true
		RETURNING id, community_id, name, color, position, permissions, is_default, created_at, updated_at
	`, communityID, permissions).Scan(
		&role.ID, &role.CommunityID, &role.Name, &role.Color, &role.Position,
		&role.Permissions, &role.IsDefault, &role.CreatedAt, &role.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("update default role permissions: %w", err)
	}
	return role, nil
}

// Delete removes a non-default role
func (q *RoleQueries) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := q.pool.Exec(ctx, `
		DELETE FROM roles WHERE id = $1 AND is_default = false
	`, id)
	if err != nil {
		return fmt.Errorf("delete role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("role not found or is default")
	}
	return nil
}

// ListByCommunity returns all roles for a community, ordered by position
func (q *RoleQueries) ListByCommunity(ctx context.Context, communityID uuid.UUID) ([]*models.Role, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, community_id, name, color, position, permissions, is_default, created_at, updated_at
		FROM roles WHERE community_id = $1
		ORDER BY position ASC
	`, communityID)
	if err != nil {
		return nil, fmt.Errorf("list roles by community: %w", err)
	}
	defer rows.Close()

	var roles []*models.Role
	for rows.Next() {
		role := &models.Role{}
		if err := rows.Scan(
			&role.ID, &role.CommunityID, &role.Name, &role.Color, &role.Position,
			&role.Permissions, &role.IsDefault, &role.CreatedAt, &role.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate roles: %w", err)
	}
	return roles, nil
}

// AssignRole adds a role to a community member
func (q *RoleQueries) AssignRole(ctx context.Context, userID, communityID, roleID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		INSERT INTO member_roles (user_id, community_id, role_id)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, userID, communityID, roleID)
	if err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	return nil
}

// RemoveRole removes a role from a community member (cannot remove default role)
func (q *RoleQueries) RemoveRole(ctx context.Context, userID, communityID, roleID uuid.UUID) error {
	tag, err := q.pool.Exec(ctx, `
		DELETE FROM member_roles
		WHERE user_id = $1 AND community_id = $2 AND role_id = $3
		AND role_id NOT IN (SELECT id FROM roles WHERE community_id = $2 AND is_default = true)
	`, userID, communityID, roleID)
	if err != nil {
		return fmt.Errorf("remove role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("role assignment not found or is default")
	}
	return nil
}

// GetMemberRoles returns all roles assigned to a specific member
func (q *RoleQueries) GetMemberRoles(ctx context.Context, userID, communityID uuid.UUID) ([]*models.Role, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT r.id, r.community_id, r.name, r.color, r.position, r.permissions,
		       r.is_default, r.created_at, r.updated_at
		FROM roles r
		JOIN member_roles mr ON mr.role_id = r.id
		WHERE mr.user_id = $1 AND mr.community_id = $2
		ORDER BY r.position ASC
	`, userID, communityID)
	if err != nil {
		return nil, fmt.Errorf("get member roles: %w", err)
	}
	defer rows.Close()

	var roles []*models.Role
	for rows.Next() {
		role := &models.Role{}
		if err := rows.Scan(
			&role.ID, &role.CommunityID, &role.Name, &role.Color, &role.Position,
			&role.Permissions, &role.IsDefault, &role.CreatedAt, &role.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan member role: %w", err)
		}
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate member roles: %w", err)
	}
	return roles, nil
}

// ReorderRoles updates the position of multiple roles in a single transaction
func (q *RoleQueries) ReorderRoles(ctx context.Context, communityID uuid.UUID, rolePositions map[uuid.UUID]int) error {
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reorder roles tx: %w", err)
	}
	defer tx.Rollback(ctx)

	for roleID, position := range rolePositions {
		_, err := tx.Exec(ctx, `
			UPDATE roles SET position = $1 WHERE id = $2 AND community_id = $3
		`, position, roleID, communityID)
		if err != nil {
			return fmt.Errorf("update role position: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder roles tx: %w", err)
	}
	return nil
}
