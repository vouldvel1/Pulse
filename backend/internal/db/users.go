package db

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pulse-chat/pulse/internal/models"
)

// UserQueries contains database operations for users
type UserQueries struct {
	pool *Pool
}

func NewUserQueries(pool *Pool) *UserQueries {
	return &UserQueries{pool: pool}
}

// CreateUser inserts a new user
func (q *UserQueries) CreateUser(ctx context.Context, email, username, displayName, passwordHash string) (*models.User, error) {
	user := &models.User{}
	err := q.pool.QueryRow(ctx, `
		INSERT INTO users (email, username, display_name, password_hash)
		VALUES ($1, $2, $3, $4)
		RETURNING id, email, username, display_name, password_hash, avatar_url, banner_url,
		          bio, status, custom_status, presence, totp_enabled, created_at, updated_at
	`, email, username, displayName, passwordHash).Scan(
		&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.PasswordHash,
		&user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus,
		&user.Presence, &user.TotpEnabled, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

// GetUserByEmail retrieves a user by email
func (q *UserQueries) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	user := &models.User{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, email, username, display_name, password_hash, avatar_url, banner_url,
		       bio, status, custom_status, presence, totp_secret, totp_enabled, created_at, updated_at
		FROM users WHERE email = $1 AND deleted_at IS NULL
	`, email).Scan(
		&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.PasswordHash,
		&user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus,
		&user.Presence, &user.TotpSecret, &user.TotpEnabled, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return user, nil
}

// GetUserByUsername retrieves a user by username
func (q *UserQueries) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	user := &models.User{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, email, username, display_name, password_hash, avatar_url, banner_url,
		       bio, status, custom_status, presence, totp_enabled, created_at, updated_at
		FROM users WHERE username = $1 AND deleted_at IS NULL
	`, username).Scan(
		&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.PasswordHash,
		&user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus,
		&user.Presence, &user.TotpEnabled, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	return user, nil
}

// GetUserByID retrieves a user by ID
func (q *UserQueries) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	user := &models.User{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, email, username, display_name, password_hash, avatar_url, banner_url,
		       bio, status, custom_status, presence, totp_enabled, created_at, updated_at
		FROM users WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(
		&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.PasswordHash,
		&user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus,
		&user.Presence, &user.TotpEnabled, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return user, nil
}

// UpdateUser updates user profile fields
func (q *UserQueries) UpdateUser(ctx context.Context, id uuid.UUID, displayName string, bio, avatarURL, bannerURL, customStatus *string) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE users SET display_name = $2, bio = $3, avatar_url = $4, banner_url = $5, custom_status = $6, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
	`, id, displayName, bio, avatarURL, bannerURL, customStatus)
	if err != nil {
		return fmt.Errorf("update user: %w", err)
	}
	return nil
}

// UpdateUsername changes the user's username. Returns an error if the username is already taken.
func (q *UserQueries) UpdateUsername(ctx context.Context, id uuid.UUID, username string) error {
	tag, err := q.pool.Exec(ctx, `
		UPDATE users SET username = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM users WHERE username = $2 AND id != $1 AND deleted_at IS NULL)
	`, id, username)
	if err != nil {
		return fmt.Errorf("update username: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("username already taken")
	}
	return nil
}

// UpdateEmail changes the user's email. Returns an error if the email is already taken.
func (q *UserQueries) UpdateEmail(ctx context.Context, id uuid.UUID, email string) error {
	tag, err := q.pool.Exec(ctx, `
		UPDATE users SET email = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2 AND id != $1 AND deleted_at IS NULL)
	`, id, email)
	if err != nil {
		return fmt.Errorf("update email: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("email already taken")
	}
	return nil
}

// UpdatePassword changes the user's password hash
func (q *UserQueries) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE users SET password_hash = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
	`, id, passwordHash)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

// DeleteUser performs a soft delete on a user account and revokes all tokens
func (q *UserQueries) DeleteUser(ctx context.Context, id uuid.UUID) error {
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete user tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Revoke all refresh tokens
	_, err = tx.Exec(ctx, `
		UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE
	`, id)
	if err != nil {
		return fmt.Errorf("revoke tokens on delete: %w", err)
	}

	// Remove from all communities
	_, err = tx.Exec(ctx, `
		DELETE FROM member_roles WHERE user_id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete member roles: %w", err)
	}

	_, err = tx.Exec(ctx, `
		DELETE FROM community_members WHERE user_id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete community memberships: %w", err)
	}

	// Soft delete the user
	_, err = tx.Exec(ctx, `
		UPDATE users SET deleted_at = NOW(), email = email || '-deleted-' || id::text, 
		                 username = username || '-deleted-' || id::text
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	if err != nil {
		return fmt.Errorf("soft delete user: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit delete user tx: %w", err)
	}
	return nil
}

// UpdatePresence updates a user's online presence
func (q *UserQueries) UpdatePresence(ctx context.Context, id uuid.UUID, presence string) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE users SET presence = $2 WHERE id = $1 AND deleted_at IS NULL
	`, id, presence)
	if err != nil {
		return fmt.Errorf("update presence: %w", err)
	}
	return nil
}

// RefreshToken operations

// CreateRefreshToken stores a new refresh token
func (q *UserQueries) CreateRefreshToken(ctx context.Context, userID uuid.UUID, tokenHash string, expiresAt time.Time) (*models.RefreshToken, error) {
	rt := &models.RefreshToken{}
	err := q.pool.QueryRow(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, token_hash, expires_at, created_at, revoked
	`, userID, tokenHash, expiresAt).Scan(
		&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.CreatedAt, &rt.Revoked,
	)
	if err != nil {
		return nil, fmt.Errorf("create refresh token: %w", err)
	}
	return rt, nil
}

// GetRefreshToken retrieves a valid (non-revoked, non-expired) refresh token by hash
func (q *UserQueries) GetRefreshToken(ctx context.Context, tokenHash string) (*models.RefreshToken, error) {
	rt := &models.RefreshToken{}
	err := q.pool.QueryRow(ctx, `
		SELECT id, user_id, token_hash, expires_at, created_at, revoked
		FROM refresh_tokens
		WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()
	`, tokenHash).Scan(
		&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.CreatedAt, &rt.Revoked,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get refresh token: %w", err)
	}
	return rt, nil
}

// RevokeRefreshToken marks a refresh token as revoked
func (q *UserQueries) RevokeRefreshToken(ctx context.Context, id uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// RevokeAllUserTokens revokes all refresh tokens for a user
func (q *UserQueries) RevokeAllUserTokens(ctx context.Context, userID uuid.UUID) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE
	`, userID)
	if err != nil {
		return fmt.Errorf("revoke all user tokens: %w", err)
	}
	return nil
}

// CleanExpiredTokens removes expired refresh tokens
func (q *UserQueries) CleanExpiredTokens(ctx context.Context) (int64, error) {
	result, err := q.pool.Exec(ctx, `
		DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = TRUE
	`)
	if err != nil {
		return 0, fmt.Errorf("clean expired tokens: %w", err)
	}
	return result.RowsAffected(), nil
}

// SearchUsers searches users by username prefix (for mentions, etc.)
func (q *UserQueries) SearchUsers(ctx context.Context, query string, limit int) ([]*models.User, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, email, username, display_name, avatar_url, bio, presence, created_at
		FROM users
		WHERE username ILIKE $1 AND deleted_at IS NULL
		ORDER BY username
		LIMIT $2
	`, query+"%", limit)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u := &models.User{}
		if err := rows.Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName,
			&u.AvatarURL, &u.Bio, &u.Presence, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users: %w", err)
	}

	return users, nil
}
