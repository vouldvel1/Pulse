package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pulse-chat/pulse/internal/cache"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"golang.org/x/crypto/bcrypt"
)

var (
	emailRegex    = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)
)

type AuthHandler struct {
	users      *db.UserQueries
	cache      *cache.Store
	auth       *middleware.Auth
	bcryptCost int
	accessExp  time.Duration
	refreshExp time.Duration
}

func NewAuthHandler(users *db.UserQueries, cache *cache.Store, auth *middleware.Auth, bcryptCost int, accessExp, refreshExp time.Duration) *AuthHandler {
	return &AuthHandler{
		users:      users,
		cache:      cache,
		auth:       auth,
		bcryptCost: bcryptCost,
		accessExp:  accessExp,
		refreshExp: refreshExp,
	}
}

// RegisterRequest is the request body for user registration
type RegisterRequest struct {
	Email       string `json:"email"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

// LoginRequest is the request body for login
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse is returned on successful auth
type AuthResponse struct {
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
	ExpiresIn    int         `json:"expires_in"`
	User         interface{} `json:"user"`
}

// Register handles POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate email
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if !emailRegex.MatchString(req.Email) {
		writeErrorWithCode(w, http.StatusBadRequest, "invalid email format", "INVALID_EMAIL")
		return
	}

	// Validate username
	req.Username = strings.TrimSpace(strings.ToLower(req.Username))
	if !usernameRegex.MatchString(req.Username) {
		writeErrorWithCode(w, http.StatusBadRequest, "username must be 3-32 characters, alphanumeric and underscores only", "INVALID_USERNAME")
		return
	}

	// Validate display name
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	if utf8.RuneCountInString(req.DisplayName) > 64 {
		writeErrorWithCode(w, http.StatusBadRequest, "display name must be 64 characters or less", "INVALID_DISPLAY_NAME")
		return
	}

	// Validate password
	if len(req.Password) < 8 || len(req.Password) > 128 {
		writeErrorWithCode(w, http.StatusBadRequest, "password must be between 8 and 128 characters", "INVALID_PASSWORD")
		return
	}

	// Check if email already exists
	existing, err := h.users.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing != nil {
		writeErrorWithCode(w, http.StatusConflict, "email already registered", "EMAIL_EXISTS")
		return
	}

	// Check if username already exists
	existing, err = h.users.GetUserByUsername(r.Context(), req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing != nil {
		writeErrorWithCode(w, http.StatusConflict, "username already taken", "USERNAME_EXISTS")
		return
	}

	// Hash password with bcrypt
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), h.bcryptCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Create user
	user, err := h.users.CreateUser(r.Context(), req.Email, req.Username, req.DisplayName, string(hash))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	// Generate tokens
	accessToken, err := h.auth.GenerateAccessToken(user.ID, user.Username, h.accessExp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	refreshToken, err := h.generateRefreshToken(r, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate refresh token")
		return
	}

	// Set cookie
	h.setAuthCookies(w, accessToken, refreshToken)

	writeJSON(w, http.StatusCreated, AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(h.accessExp.Seconds()),
		User:         user,
	})
}

// Login handles POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	// Find user
	user, err := h.users.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if user == nil {
		writeErrorWithCode(w, http.StatusUnauthorized, "invalid email or password", "INVALID_CREDENTIALS")
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		writeErrorWithCode(w, http.StatusUnauthorized, "invalid email or password", "INVALID_CREDENTIALS")
		return
	}

	// Generate tokens
	accessToken, err := h.auth.GenerateAccessToken(user.ID, user.Username, h.accessExp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	refreshToken, err := h.generateRefreshToken(r, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate refresh token")
		return
	}

	h.setAuthCookies(w, accessToken, refreshToken)

	writeJSON(w, http.StatusOK, AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(h.accessExp.Seconds()),
		User:         user,
	})
}

// RefreshToken handles POST /api/auth/refresh
func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := readJSON(r, &req); err != nil {
		// Try cookie
		cookie, cookieErr := r.Cookie("refresh_token")
		if cookieErr != nil {
			writeError(w, http.StatusBadRequest, "refresh token required")
			return
		}
		req.RefreshToken = cookie.Value
	}

	if req.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh token required")
		return
	}

	// Hash the token to look up
	hash := hashToken(req.RefreshToken)

	// Find the refresh token
	rt, err := h.users.GetRefreshToken(r.Context(), hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if rt == nil {
		writeErrorWithCode(w, http.StatusUnauthorized, "invalid refresh token", "INVALID_REFRESH_TOKEN")
		return
	}

	// Revoke the old token (rotation)
	if err := h.users.RevokeRefreshToken(r.Context(), rt.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Get user
	user, err := h.users.GetUserByID(r.Context(), rt.UserID)
	if err != nil || user == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Generate new tokens
	accessToken, err := h.auth.GenerateAccessToken(user.ID, user.Username, h.accessExp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	refreshToken, err := h.generateRefreshToken(r, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate refresh token")
		return
	}

	h.setAuthCookies(w, accessToken, refreshToken)

	writeJSON(w, http.StatusOK, AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(h.accessExp.Seconds()),
		User:         user,
	})
}

// Logout handles POST /api/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	// Try to revoke the refresh token
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := readJSON(r, &req); err == nil && req.RefreshToken != "" {
		hash := hashToken(req.RefreshToken)
		rt, err := h.users.GetRefreshToken(r.Context(), hash)
		if err == nil && rt != nil {
			_ = h.users.RevokeRefreshToken(r.Context(), rt.ID)
		}
	}

	// Clear cookies
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "logged out successfully"})
}

// Me handles GET /api/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.users.GetUserByID(r.Context(), userID)
	if err != nil || user == nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// generateRefreshToken creates a cryptographically random refresh token
func (h *AuthHandler) generateRefreshToken(r *http.Request, userID fmt.Stringer) (string, error) {
	uid, ok := userID.(interface{ String() string })
	if !ok {
		return "", fmt.Errorf("invalid user ID type")
	}

	parsed, err := parseUUID(uid.String())
	if err != nil {
		return "", fmt.Errorf("parse user id: %w", err)
	}

	// Generate random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("generate random bytes: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	// Store hashed version in DB
	hash := hashToken(token)
	expiresAt := time.Now().Add(h.refreshExp)

	_, err = h.users.CreateRefreshToken(r.Context(), parsed, hash, expiresAt)
	if err != nil {
		return "", fmt.Errorf("store refresh token: %w", err)
	}

	return token, nil
}

func (h *AuthHandler) setAuthCookies(w http.ResponseWriter, accessToken, refreshToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    accessToken,
		Path:     "/",
		MaxAge:   int(h.accessExp.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Path:     "/api/auth",
		MaxAge:   int(h.refreshExp.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
