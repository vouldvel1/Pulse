package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"unicode/utf8"

	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
	"github.com/pulse-chat/pulse/internal/ws"
)

type CommunityHandler struct {
	communities *db.CommunityQueries
	channels    *db.ChannelQueries
	invites     *db.InviteQueries
	hub         *ws.Hub
}

func NewCommunityHandler(communities *db.CommunityQueries, channels *db.ChannelQueries, invites *db.InviteQueries, hub *ws.Hub) *CommunityHandler {
	return &CommunityHandler{
		communities: communities,
		channels:    channels,
		invites:     invites,
		hub:         hub,
	}
}

// CreateCommunityRequest is the request body for creating a community
type CreateCommunityRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Visibility  string  `json:"visibility"`
}

// Create handles POST /api/communities
func (h *CommunityHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateCommunityRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || utf8.RuneCountInString(req.Name) > 100 {
		writeErrorWithCode(w, http.StatusBadRequest, "name must be 1-100 characters", "INVALID_NAME")
		return
	}

	if req.Visibility != "" && req.Visibility != "public" && req.Visibility != "private" {
		writeError(w, http.StatusBadRequest, "visibility must be 'public' or 'private'")
		return
	}

	community, err := h.communities.Create(r.Context(), userID, req.Name, req.Description, req.Visibility)
	if err != nil {
		log.Printf("Error creating community: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create community")
		return
	}

	// Create default "general" text channel
	_, err = h.channels.Create(r.Context(), community.ID, "general", models.ChannelTypeText, nil, nil, false)
	if err != nil {
		log.Printf("Error creating default channel: %v", err)
		// Community was created, don't fail the whole request
	}

	writeJSON(w, http.StatusCreated, community)
}

// Get handles GET /api/communities/{id}
// M9 fix: for private communities, only members receive the full details.
func (h *CommunityHandler) Get(w http.ResponseWriter, r *http.Request) {
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

	community, err := h.communities.GetByID(r.Context(), communityID)
	if err != nil {
		log.Printf("Error getting community: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if community == nil {
		writeError(w, http.StatusNotFound, "community not found")
		return
	}

	// M9: private communities may only be seen in full by members.
	if community.Visibility == "private" {
		isMember, err := h.communities.IsMember(r.Context(), userID, communityID)
		if err != nil {
			log.Printf("Error checking membership: %v", err)
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		if !isMember {
			writeError(w, http.StatusForbidden, "not a member of this community")
			return
		}
	}

	writeJSON(w, http.StatusOK, community)
}

// Update handles PATCH /api/communities/{id}
func (h *CommunityHandler) Update(w http.ResponseWriter, r *http.Request) {
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

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		IconURL     *string `json:"icon_url"`
		BannerURL   *string `json:"banner_url"`
		Visibility  *string `json:"visibility"`
	}
	if err := readJSONLax(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name != nil && (utf8.RuneCountInString(*req.Name) == 0 || utf8.RuneCountInString(*req.Name) > 100) {
		writeErrorWithCode(w, http.StatusBadRequest, "name must be 1-100 characters", "INVALID_NAME")
		return
	}

	if req.Visibility != nil && *req.Visibility != "public" && *req.Visibility != "private" {
		writeError(w, http.StatusBadRequest, "visibility must be 'public' or 'private'")
		return
	}

	community, err := h.communities.Update(r.Context(), communityID, req.Name, req.Description, req.IconURL, req.BannerURL, req.Visibility)
	if err != nil {
		log.Printf("Error updating community: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update community")
		return
	}
	if community == nil {
		writeError(w, http.StatusNotFound, "community not found")
		return
	}

	// Broadcast update event to all community channels
	channels, err := h.channels.ListByCommunity(r.Context(), communityID)
	if err == nil {
		payload, _ := json.Marshal(community)
		for _, ch := range channels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{
				Type:    ws.EventCommunityUpdate,
				Payload: payload,
			}, nil)
		}
	}

	writeJSON(w, http.StatusOK, community)
}

// Delete handles DELETE /api/communities/{id}
func (h *CommunityHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	// Only owner can delete
	community, err := h.communities.GetByID(r.Context(), communityID)
	if err != nil {
		log.Printf("Error getting community: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if community == nil {
		writeError(w, http.StatusNotFound, "community not found")
		return
	}
	if community.OwnerID != userID {
		writeError(w, http.StatusForbidden, "only the owner can delete the community")
		return
	}

	if err := h.communities.Delete(r.Context(), communityID); err != nil {
		log.Printf("Error deleting community: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete community")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "community deleted"})
}

// ListMine handles GET /api/communities
func (h *CommunityHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communities, err := h.communities.ListByUser(r.Context(), userID)
	if err != nil {
		log.Printf("Error listing communities: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if communities == nil {
		communities = []*models.Community{}
	}

	writeJSON(w, http.StatusOK, communities)
}

// ListMembers handles GET /api/communities/{id}/members
func (h *CommunityHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
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

	// Must be a member
	isMember, err := h.communities.IsMember(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this community")
		return
	}

	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	members, total, err := h.communities.ListMembers(r.Context(), communityID, limit, offset)
	if err != nil {
		log.Printf("Error listing members: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	totalPages := (total + limit - 1) / limit
	page := (offset / limit) + 1

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Data:       members,
		Total:      int64(total),
		Page:       page,
		PerPage:    limit,
		TotalPages: totalPages,
	})
}

// Join handles POST /api/invites/{code}/join
// C8 fix: validate the invite and add the member BEFORE incrementing the use
// count, so a failed AddMember does not drain max_uses.
func (h *CommunityHandler) Join(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	code := r.PathValue("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "invite code required")
		return
	}

	// Validate the invite (does not increment yet).
	invite, err := h.invites.GetByCode(r.Context(), code)
	if err != nil {
		log.Printf("Error getting invite: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if invite == nil {
		writeErrorWithCode(w, http.StatusNotFound, "invite not found, expired, or maxed out", "INVALID_INVITE")
		return
	}

	// Check if already a member before consuming a use slot.
	isMember, err := h.communities.IsMember(r.Context(), userID, invite.CommunityID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if isMember {
		writeErrorWithCode(w, http.StatusConflict, "already a member of this community", "ALREADY_MEMBER")
		return
	}

	// Add member first — only then increment the use count.
	if err := h.communities.AddMember(r.Context(), userID, invite.CommunityID); err != nil {
		log.Printf("Error adding member: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to join community")
		return
	}

	// C8: increment use count only after a successful join.
	if _, err := h.invites.Use(r.Context(), code); err != nil {
		// Non-fatal: membership was already granted; log but continue.
		log.Printf("Warning: failed to increment invite use count for code %s: %v", code, err)
	}

	// Get community for response
	community, err := h.communities.GetByID(r.Context(), invite.CommunityID)
	if err != nil {
		log.Printf("Error getting community after join: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Broadcast member join to community channels
	channels, err := h.channels.ListByCommunity(r.Context(), invite.CommunityID)
	if err == nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"user_id":      userID,
			"community_id": invite.CommunityID,
		})
		for _, ch := range channels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{
				Type:    ws.EventMemberJoin,
				Payload: payload,
			}, nil)
		}
	}

	writeJSON(w, http.StatusOK, community)
}

// Search handles GET /api/communities/search?q=...
func (h *CommunityHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeJSON(w, http.StatusOK, []*models.CommunitySearchResult{})
		return
	}

	limit := 25
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	results, err := h.communities.SearchPublic(r.Context(), query, limit)
	if err != nil {
		log.Printf("Error searching communities: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to search communities")
		return
	}

	if results == nil {
		results = []*models.CommunitySearchResult{}
	}

	writeJSON(w, http.StatusOK, results)
}

// JoinPublic handles POST /api/communities/{id}/join — join a public community without an invite
func (h *CommunityHandler) JoinPublic(w http.ResponseWriter, r *http.Request) {
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

	// Must be a public community
	community, err := h.communities.GetByID(r.Context(), communityID)
	if err != nil {
		log.Printf("Error getting community: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if community == nil {
		writeError(w, http.StatusNotFound, "community not found")
		return
	}
	if community.Visibility != "public" {
		writeError(w, http.StatusForbidden, "community is not public; use an invite to join")
		return
	}

	// Check if already a member
	isMember, err := h.communities.IsMember(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if isMember {
		writeErrorWithCode(w, http.StatusConflict, "already a member of this community", "ALREADY_MEMBER")
		return
	}

	// Add member
	if err := h.communities.AddMember(r.Context(), userID, communityID); err != nil {
		log.Printf("Error adding member: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to join community")
		return
	}

	// Broadcast member join to community channels
	channels, err := h.channels.ListByCommunity(r.Context(), communityID)
	if err == nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"user_id":      userID,
			"community_id": communityID,
		})
		for _, ch := range channels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{
				Type:    ws.EventMemberJoin,
				Payload: payload,
			}, nil)
		}
	}

	writeJSON(w, http.StatusOK, community)
}

// Leave handles DELETE /api/communities/{id}/members/me
func (h *CommunityHandler) Leave(w http.ResponseWriter, r *http.Request) {
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

	// Can't leave if you're the owner
	community, err := h.communities.GetByID(r.Context(), communityID)
	if err != nil {
		log.Printf("Error getting community: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if community == nil {
		writeError(w, http.StatusNotFound, "community not found")
		return
	}
	if community.OwnerID == userID {
		writeErrorWithCode(w, http.StatusForbidden, "the owner cannot leave the community; transfer ownership or delete it", "OWNER_CANNOT_LEAVE")
		return
	}

	if err := h.communities.RemoveMember(r.Context(), userID, communityID); err != nil {
		log.Printf("Error removing member: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to leave community")
		return
	}

	// Broadcast member leave
	channels, err := h.channels.ListByCommunity(r.Context(), communityID)
	if err == nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"user_id":      userID,
			"community_id": communityID,
		})
		for _, ch := range channels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{
				Type:    ws.EventMemberLeave,
				Payload: payload,
			}, nil)
		}
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "left community"})
}
