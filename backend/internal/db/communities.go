package db

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// CommunityQueries contains database operations for communities
type CommunityQueries struct {
	pool *Pool
}

func NewCommunityQueries(pool *Pool) *CommunityQueries {
	return &CommunityQueries{pool: pool}
}

// Create inserts a new community, creates a default @everyone role, and adds the owner as a member
func (q *CommunityQueries) Create(ctx context.Context, ownerID uuid.UUID, name string, description *string, visibility string) (*models.Community, error) {
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create community tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if visibility == "" {
		visibility = "private"
	}

	community := &models.Community{}
	err = tx.QueryRow(ctx, `
		INSERT INTO communities (name, description, owner_id, visibility)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, description, icon_url, banner_url, owner_id, visibility, created_at, updated_at, deleted_at
	`, name, description, ownerID, visibility).Scan(
		&community.ID, &community.Name, &community.Description, &community.IconURL,
		&community.BannerURL, &community.OwnerID, &community.Visibility, &community.CreatedAt, &community.UpdatedAt,
		&community.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert community: %w", err)
	}

	// Create default @everyone role
	_, err = tx.Exec(ctx, `
		INSERT INTO roles (community_id, name, position, permissions, is_default)
		VALUES ($1, '@everyone', 0, $2, true)
	`, community.ID, models.DefaultPermissions)
	if err != nil {
		return nil, fmt.Errorf("create default role: %w", err)
	}

	// Add owner as a member
	_, err = tx.Exec(ctx, `
		INSERT INTO community_members (user_id, community_id)
		VALUES ($1, $2)
	`, ownerID, community.ID)
	if err != nil {
		return nil, fmt.Errorf("add owner as member: %w", err)
	}

	// Assign the default @everyone role to the owner
	_, err = tx.Exec(ctx, `
		INSERT INTO member_roles (user_id, community_id, role_id)
		SELECT $1, $2, id FROM roles WHERE community_id = $2 AND is_default = true
	`, ownerID, community.ID)
	if err != nil {
		return nil, fmt.Errorf("assign default role to owner: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create community tx: %w", err)
	}

	return community, nil
}

// GetByID retrieves a community by ID
func (q *CommunityQueries) GetByID(ctx context.Context, id uuid.UUID) (*models.Community, error) {
	community := &models.Community{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, name, description, icon_url, banner_url, owner_id, visibility, created_at, updated_at, deleted_at
		FROM communities WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(
		&community.ID, &community.Name, &community.Description, &community.IconURL,
		&community.BannerURL, &community.OwnerID, &community.Visibility, &community.CreatedAt, &community.UpdatedAt,
		&community.DeletedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get community by id: %w", err)
	}
	return community, nil
}

// Update dynamically updates community fields using COALESCE
func (q *CommunityQueries) Update(ctx context.Context, id uuid.UUID, name *string, description *string, iconURL *string, bannerURL *string, visibility *string) (*models.Community, error) {
	community := &models.Community{}
	err := q.pool.QueryRow(ctx, `
		UPDATE communities SET
			name        = COALESCE($2, name),
			description = COALESCE($3, description),
			icon_url    = COALESCE($4, icon_url),
			banner_url  = COALESCE($5, banner_url),
			visibility  = COALESCE($6, visibility),
			updated_at  = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, name, description, icon_url, banner_url, owner_id, visibility, created_at, updated_at, deleted_at
	`, id, name, description, iconURL, bannerURL, visibility).Scan(
		&community.ID, &community.Name, &community.Description, &community.IconURL,
		&community.BannerURL, &community.OwnerID, &community.Visibility, &community.CreatedAt, &community.UpdatedAt,
		&community.DeletedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("update community: %w", err)
	}
	return community, nil
}

// Delete performs a soft delete on a community
func (q *CommunityQueries) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE communities SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL
	`, id)
	if err != nil {
		return fmt.Errorf("delete community: %w", err)
	}
	return nil
}

// ListByUser returns all communities that a user is a member of
func (q *CommunityQueries) ListByUser(ctx context.Context, userID uuid.UUID) ([]*models.Community, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT c.id, c.name, c.description, c.icon_url, c.banner_url, c.owner_id,
		       c.visibility, c.created_at, c.updated_at, c.deleted_at
		FROM communities c
		JOIN community_members cm ON cm.community_id = c.id
		WHERE cm.user_id = $1 AND c.deleted_at IS NULL
		ORDER BY c.name
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list communities by user: %w", err)
	}
	defer rows.Close()

	var communities []*models.Community
	for rows.Next() {
		c := &models.Community{}
		if err := rows.Scan(
			&c.ID, &c.Name, &c.Description, &c.IconURL, &c.BannerURL,
			&c.OwnerID, &c.Visibility, &c.CreatedAt, &c.UpdatedAt, &c.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan community: %w", err)
		}
		communities = append(communities, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate communities: %w", err)
	}

	return communities, nil
}

// AddMember adds a user to a community and assigns the default role
func (q *CommunityQueries) AddMember(ctx context.Context, userID, communityID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		INSERT INTO community_members (user_id, community_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, communityID)
	if err != nil {
		return fmt.Errorf("add community member: %w", err)
	}

	_, err = q.pool.Exec(ctx, `
		INSERT INTO member_roles (user_id, community_id, role_id)
		SELECT $1, $2, id FROM roles WHERE community_id = $2 AND is_default = true
		ON CONFLICT DO NOTHING
	`, userID, communityID)
	if err != nil {
		return fmt.Errorf("assign default role: %w", err)
	}

	return nil
}

// RemoveMember removes a user from a community
func (q *CommunityQueries) RemoveMember(ctx context.Context, userID, communityID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		DELETE FROM community_members WHERE user_id = $1 AND community_id = $2
	`, userID, communityID)
	if err != nil {
		return fmt.Errorf("remove community member: %w", err)
	}
	return nil
}

// GetMember retrieves a community member with user data
func (q *CommunityQueries) GetMember(ctx context.Context, userID, communityID uuid.UUID) (*models.CommunityMember, error) {
	member := &models.CommunityMember{}
	user := &models.User{}
	err := q.pool.QueryRow(ctx, `
		SELECT cm.user_id, cm.community_id, cm.nickname, cm.joined_at, cm.timeout_until,
		       u.id, u.email, u.username, u.display_name, u.avatar_url, u.banner_url,
		       u.bio, u.status, u.custom_status, u.presence, u.created_at, u.updated_at
		FROM community_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.user_id = $1 AND cm.community_id = $2
	`, userID, communityID).Scan(
		&member.UserID, &member.CommunityID, &member.Nickname, &member.JoinedAt, &member.TimeoutUntil,
		&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.AvatarURL, &user.BannerURL,
		&user.Bio, &user.Status, &user.CustomStatus, &user.Presence, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get community member: %w", err)
	}
	member.User = user
	return member, nil
}

// ListMembers returns paginated community members with total count
func (q *CommunityQueries) ListMembers(ctx context.Context, communityID uuid.UUID, limit, offset int) ([]*models.CommunityMember, int, error) {
	var total int
	err := q.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM community_members WHERE community_id = $1
	`, communityID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count community members: %w", err)
	}

	rows, err := q.pool.Query(ctx, `
		SELECT cm.user_id, cm.community_id, cm.nickname, cm.joined_at, cm.timeout_until,
		       u.id, u.email, u.username, u.display_name, u.avatar_url, u.banner_url,
		       u.bio, u.status, u.custom_status, u.presence, u.created_at, u.updated_at
		FROM community_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.community_id = $1
		ORDER BY cm.joined_at
		LIMIT $2 OFFSET $3
	`, communityID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list community members: %w", err)
	}
	defer rows.Close()

	var members []*models.CommunityMember
	for rows.Next() {
		member := &models.CommunityMember{}
		user := &models.User{}
		if err := rows.Scan(
			&member.UserID, &member.CommunityID, &member.Nickname, &member.JoinedAt, &member.TimeoutUntil,
			&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.AvatarURL, &user.BannerURL,
			&user.Bio, &user.Status, &user.CustomStatus, &user.Presence, &user.CreatedAt, &user.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan community member: %w", err)
		}
		member.User = user
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate community members: %w", err)
	}

	return members, total, nil
}

// GetMemberPermissions returns the OR'd permission bits for a member across all their roles.
// If the user is the community owner, all permission bits are returned.
// Returns 0 if the user is not a member.
func (q *CommunityQueries) GetMemberPermissions(ctx context.Context, userID, communityID uuid.UUID) (int64, error) {
	// Check if user is the community owner
	var ownerID uuid.UUID
	err := q.pool.QueryRow(ctx, `
		SELECT owner_id FROM communities WHERE id = $1 AND deleted_at IS NULL
	`, communityID).Scan(&ownerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, nil
		}
		return 0, fmt.Errorf("get community owner: %w", err)
	}

	if ownerID == userID {
		return ^int64(0), nil
	}

	// Check membership and aggregate role permissions
	var perms *int64
	err = q.pool.QueryRow(ctx, `
		SELECT BIT_OR(r.permissions)
		FROM member_roles mr
		JOIN roles r ON r.id = mr.role_id
		WHERE mr.user_id = $1 AND mr.community_id = $2
	`, userID, communityID).Scan(&perms)
	if err != nil {
		return 0, fmt.Errorf("get member permissions: %w", err)
	}

	if perms != nil {
		return *perms, nil
	}

	// member_roles returned no rows — fall back to checking community_members.
	// This handles the case where the user is a valid member but has no role
	// assignments (e.g. the default role insert failed silently).
	var isMember bool
	err = q.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM community_members WHERE user_id = $1 AND community_id = $2)
	`, userID, communityID).Scan(&isMember)
	if err != nil {
		return 0, fmt.Errorf("fallback membership check: %w", err)
	}

	if isMember {
		// Member exists but has no roles — assign the default role now and
		// return default permissions so the request is not rejected.
		_, repairErr := q.pool.Exec(ctx, `
			INSERT INTO member_roles (user_id, community_id, role_id)
			SELECT $1, $2, id FROM roles WHERE community_id = $2 AND is_default = true
			ON CONFLICT DO NOTHING
		`, userID, communityID)
		if repairErr != nil {
			log.Printf("Warning: failed to repair member_roles for user %s in community %s: %v", userID, communityID, repairErr)
		}
		return int64(models.DefaultPermissions), nil
	}

	return 0, nil
}

// IsMember checks whether a user is a member of a community
func (q *CommunityQueries) IsMember(ctx context.Context, userID, communityID uuid.UUID) (bool, error) {
	var exists bool
	err := q.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM community_members WHERE user_id = $1 AND community_id = $2
		)
	`, userID, communityID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check community membership: %w", err)
	}
	return exists, nil
}

// SearchPublic searches for public communities by name, returning results with member counts
func (q *CommunityQueries) SearchPublic(ctx context.Context, query string, limit int) ([]*models.CommunitySearchResult, error) {
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	searchPattern := "%" + query + "%"
	rows, err := q.pool.Query(ctx, `
		SELECT c.id, c.name, c.description, c.icon_url, c.banner_url, c.owner_id,
		       c.visibility, c.created_at,
		       COUNT(cm.user_id) AS member_count
		FROM communities c
		LEFT JOIN community_members cm ON cm.community_id = c.id
		WHERE c.visibility = 'public' AND c.deleted_at IS NULL
		  AND c.name ILIKE $1
		GROUP BY c.id
		ORDER BY member_count DESC, c.name
		LIMIT $2
	`, searchPattern, limit)
	if err != nil {
		return nil, fmt.Errorf("search public communities: %w", err)
	}
	defer rows.Close()

	var results []*models.CommunitySearchResult
	for rows.Next() {
		r := &models.CommunitySearchResult{}
		if err := rows.Scan(
			&r.ID, &r.Name, &r.Description, &r.IconURL, &r.BannerURL,
			&r.OwnerID, &r.Visibility, &r.CreatedAt, &r.MemberCount,
		); err != nil {
			return nil, fmt.Errorf("scan search result: %w", err)
		}
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate search results: %w", err)
	}
	return results, nil
}
