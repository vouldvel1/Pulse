package api

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/storage"
	"golang.org/x/crypto/bcrypt"
)

const maxAvatarSize = 8 << 20 // 8 MB

var (
	profileUsernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)
	profileEmailRegex    = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
)

// Allowed MIME types for avatar/banner uploads
var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

type UserHandler struct {
	users      *db.UserQueries
	storage    *storage.Client
	bcryptCost int
}

func NewUserHandler(users *db.UserQueries, opts ...UserHandlerOption) *UserHandler {
	h := &UserHandler{users: users, bcryptCost: 12}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

type UserHandlerOption func(*UserHandler)

func WithStorage(s *storage.Client) UserHandlerOption {
	return func(h *UserHandler) { h.storage = s }
}

func WithBcryptCost(cost int) UserHandlerOption {
	return func(h *UserHandler) { h.bcryptCost = cost }
}

// PublicUser is a safe subset of user data to expose via search
type PublicUser struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url"`
	Bio         *string `json:"bio"`
}

// Search handles GET /api/users/search?q=username&limit=20
func (h *UserHandler) Search(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, http.StatusOK, []PublicUser{})
		return
	}

	// Strip leading @ if present
	query = strings.TrimPrefix(query, "@")

	if len(query) < 1 {
		writeJSON(w, http.StatusOK, []PublicUser{})
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	users, err := h.users.SearchUsers(r.Context(), query, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "search failed")
		return
	}

	results := make([]PublicUser, 0, len(users))
	for _, u := range users {
		results = append(results, PublicUser{
			ID:          u.ID.String(),
			Username:    u.Username,
			DisplayName: u.DisplayName,
			AvatarURL:   u.AvatarURL,
			Bio:         u.Bio,
		})
	}

	writeJSON(w, http.StatusOK, results)
}

// UpdateProfile handles PATCH /api/users/me
func (h *UserHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		DisplayName  *string `json:"display_name"`
		Bio          *string `json:"bio"`
		CustomStatus *string `json:"custom_status"`
		Username     *string `json:"username"`
		Email        *string `json:"email"`
	}
	if err := readJSONLax(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate and apply username change
	if req.Username != nil {
		username := strings.ToLower(strings.TrimSpace(*req.Username))
		if !profileUsernameRegex.MatchString(username) {
			writeErrorWithCode(w, http.StatusBadRequest, "username must be 3-32 alphanumeric characters or underscores", "INVALID_USERNAME")
			return
		}
		if err := h.users.UpdateUsername(r.Context(), userID, username); err != nil {
			if strings.Contains(err.Error(), "already taken") {
				writeErrorWithCode(w, http.StatusConflict, "username already taken", "USERNAME_TAKEN")
				return
			}
			log.Printf("Error updating username: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to update username")
			return
		}
	}

	// Validate and apply email change
	if req.Email != nil {
		email := strings.ToLower(strings.TrimSpace(*req.Email))
		if !profileEmailRegex.MatchString(email) {
			writeErrorWithCode(w, http.StatusBadRequest, "invalid email address", "INVALID_EMAIL")
			return
		}
		if err := h.users.UpdateEmail(r.Context(), userID, email); err != nil {
			if strings.Contains(err.Error(), "already taken") {
				writeErrorWithCode(w, http.StatusConflict, "email already in use", "EMAIL_TAKEN")
				return
			}
			log.Printf("Error updating email: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to update email")
			return
		}
	}

	// Get current user to fill in defaults for fields not being updated
	currentUser, err := h.users.GetUserByID(r.Context(), userID)
	if err != nil || currentUser == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	displayName := currentUser.DisplayName
	if req.DisplayName != nil {
		dn := strings.TrimSpace(*req.DisplayName)
		if dn == "" || utf8.RuneCountInString(dn) > 64 {
			writeErrorWithCode(w, http.StatusBadRequest, "display name must be 1-64 characters", "INVALID_DISPLAY_NAME")
			return
		}
		displayName = dn
	}

	bio := currentUser.Bio
	if req.Bio != nil {
		b := *req.Bio
		if utf8.RuneCountInString(b) > 500 {
			writeErrorWithCode(w, http.StatusBadRequest, "bio must be under 500 characters", "INVALID_BIO")
			return
		}
		if b == "" {
			bio = nil
		} else {
			bio = &b
		}
	}

	customStatus := currentUser.CustomStatus
	if req.CustomStatus != nil {
		cs := *req.CustomStatus
		if utf8.RuneCountInString(cs) > 128 {
			writeErrorWithCode(w, http.StatusBadRequest, "custom status must be under 128 characters", "INVALID_STATUS")
			return
		}
		if cs == "" {
			customStatus = nil
		} else {
			customStatus = &cs
		}
	}

	if err := h.users.UpdateUser(r.Context(), userID, displayName, bio, currentUser.AvatarURL, currentUser.BannerURL, customStatus); err != nil {
		log.Printf("Error updating user profile: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	// Return the updated user
	updatedUser, err := h.users.GetUserByID(r.Context(), userID)
	if err != nil || updatedUser == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, updatedUser)
}

// UploadAvatar handles POST /api/users/me/avatar
func (h *UserHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	h.uploadImage(w, r, "avatars")
}

// UploadBanner handles POST /api/users/me/banner
func (h *UserHandler) UploadBanner(w http.ResponseWriter, r *http.Request) {
	h.uploadImage(w, r, "banners")
}

func (h *UserHandler) uploadImage(w http.ResponseWriter, r *http.Request, folder string) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.storage == nil {
		writeError(w, http.StatusInternalServerError, "storage not configured")
		return
	}

	if err := r.ParseMultipartForm(maxAvatarSize); err != nil {
		writeErrorWithCode(w, http.StatusBadRequest, "file too large or invalid form data", "INVALID_UPLOAD")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file field required")
		return
	}
	defer file.Close()

	if header.Size > maxAvatarSize {
		writeErrorWithCode(w, http.StatusBadRequest, "file exceeds 8MB limit", "FILE_TOO_LARGE")
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		ext := strings.ToLower(filepath.Ext(header.Filename))
		contentType = mimeFromExt(ext)
	}
	if !allowedImageTypes[contentType] {
		writeErrorWithCode(w, http.StatusBadRequest, "only JPEG, PNG, GIF, and WebP images are allowed", "INVALID_MIME_TYPE")
		return
	}

	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	ext := filepath.Ext(header.Filename)
	objectName := fmt.Sprintf("%s/%s/%s%s", folder, userID, hex.EncodeToString(randBytes), ext)

	fileURL, err := h.storage.Upload(r.Context(), objectName, file, header.Size, contentType)
	if err != nil {
		log.Printf("Error uploading %s: %v", folder, err)
		writeError(w, http.StatusInternalServerError, "failed to upload file")
		return
	}

	// Get current user to preserve other fields
	currentUser, err := h.users.GetUserByID(r.Context(), userID)
	if err != nil || currentUser == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	avatarURL := currentUser.AvatarURL
	bannerURL := currentUser.BannerURL
	if folder == "avatars" {
		avatarURL = &fileURL
	} else {
		bannerURL = &fileURL
	}

	if err := h.users.UpdateUser(r.Context(), userID, currentUser.DisplayName, currentUser.Bio, avatarURL, bannerURL, currentUser.CustomStatus); err != nil {
		log.Printf("Error saving %s URL: %v", folder, err)
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	updatedUser, err := h.users.GetUserByID(r.Context(), userID)
	if err != nil || updatedUser == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, updatedUser)
}

// ChangePassword handles PUT /api/users/me/password
func (h *UserHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "current_password and new_password are required")
		return
	}

	if len(req.NewPassword) < 8 || len(req.NewPassword) > 128 {
		writeErrorWithCode(w, http.StatusBadRequest, "new password must be 8-128 characters", "INVALID_PASSWORD")
		return
	}

	// Verify current password
	currentUser, err := h.users.GetUserByID(r.Context(), userID)
	if err != nil || currentUser == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(currentUser.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		writeErrorWithCode(w, http.StatusForbidden, "current password is incorrect", "WRONG_PASSWORD")
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), h.bcryptCost)
	if err != nil {
		log.Printf("Error hashing new password: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := h.users.UpdatePassword(r.Context(), userID, string(newHash)); err != nil {
		log.Printf("Error updating password: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to change password")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "password changed"})
}

// DeleteAccount handles DELETE /api/users/me
func (h *UserHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Password == "" {
		writeError(w, http.StatusBadRequest, "password is required to delete account")
		return
	}

	// Verify password
	currentUser, err := h.users.GetUserByID(r.Context(), userID)
	if err != nil || currentUser == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(currentUser.PasswordHash), []byte(req.Password)); err != nil {
		writeErrorWithCode(w, http.StatusForbidden, "password is incorrect", "WRONG_PASSWORD")
		return
	}

	if err := h.users.DeleteUser(r.Context(), userID); err != nil {
		log.Printf("Error deleting account: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete account")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "account deleted"})
}
