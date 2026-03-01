package api

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"time"

	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
)

type InviteHandler struct {
	invites     *db.InviteQueries
	communities *db.CommunityQueries
}

func NewInviteHandler(invites *db.InviteQueries, communities *db.CommunityQueries) *InviteHandler {
	return &InviteHandler{
		invites:     invites,
		communities: communities,
	}
}

type CreateInviteRequest struct {
	MaxUses   *int   `json:"max_uses"`
	ExpiresIn *int64 `json:"expires_in"` // seconds from now
}

// Create handles POST /api/communities/{id}/invites
func (h *InviteHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	// Check permissions
	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermCreateInvite == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: create invite")
		return
	}

	var req CreateInviteRequest
	if err := readJSON(r, &req); err != nil {
		// Allow empty body (use defaults)
		req = CreateInviteRequest{}
	}

	// Generate unique code
	codeBytes := make([]byte, 6)
	if _, err := rand.Read(codeBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	code := hex.EncodeToString(codeBytes)

	var expiresAt *time.Time
	if req.ExpiresIn != nil && *req.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(*req.ExpiresIn) * time.Second)
		expiresAt = &t
	}

	invite, err := h.invites.Create(r.Context(), communityID, userID, code, req.MaxUses, expiresAt)
	if err != nil {
		log.Printf("Error creating invite: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create invite")
		return
	}

	writeJSON(w, http.StatusCreated, invite)
}

// List handles GET /api/communities/{id}/invites
func (h *InviteHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	// Check permissions
	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageCommunity == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage community")
		return
	}

	invites, err := h.invites.ListByCommunity(r.Context(), communityID)
	if err != nil {
		log.Printf("Error listing invites: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if invites == nil {
		invites = []*models.Invite{}
	}

	writeJSON(w, http.StatusOK, invites)
}

// Delete handles DELETE /api/invites/{id}
// C4 fix: look up the invite, then verify the caller is the creator or holds
// ManageInvites / Admin permission on the community before deleting.
func (h *InviteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	inviteID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid invite id")
		return
	}

	// Look up the invite by ID so we can check ownership and community.
	invite, err := h.invites.GetByID(r.Context(), inviteID)
	if err != nil {
		log.Printf("Error fetching invite: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if invite == nil {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}

	// Allow if the caller is the invite creator.
	if invite.CreatorID != userID {
		// Otherwise require ManageInvites or Admin permission.
		perms, err := h.communities.GetMemberPermissions(r.Context(), userID, invite.CommunityID)
		if err != nil {
			log.Printf("Error checking permissions: %v", err)
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		if perms&models.PermManageCommunity == 0 && perms&models.PermAdmin == 0 {
			writeError(w, http.StatusForbidden, "missing permission: manage invites")
			return
		}
	}

	if err := h.invites.Delete(r.Context(), inviteID); err != nil {
		log.Printf("Error deleting invite: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete invite")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "invite deleted"})
}

// GetByCode handles GET /api/invites/{code}
func (h *InviteHandler) GetByCode(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "invite code required")
		return
	}

	invite, err := h.invites.GetByCode(r.Context(), code)
	if err != nil {
		log.Printf("Error getting invite: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if invite == nil {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}

	// Also return the community info
	community, err := h.communities.GetByID(r.Context(), invite.CommunityID)
	if err != nil {
		log.Printf("Error getting community for invite: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"invite":    invite,
		"community": community,
	})
}
