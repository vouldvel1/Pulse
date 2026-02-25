package api

import (
	"encoding/json"
	"log"
	"net/http"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
	"github.com/pulse-chat/pulse/internal/ws"
)

type ChannelHandler struct {
	channels    *db.ChannelQueries
	communities *db.CommunityQueries
	hub         *ws.Hub
}

func NewChannelHandler(channels *db.ChannelQueries, communities *db.CommunityQueries, hub *ws.Hub) *ChannelHandler {
	return &ChannelHandler{
		channels:    channels,
		communities: communities,
		hub:         hub,
	}
}

type CreateChannelRequest struct {
	Name      string     `json:"name"`
	Type      string     `json:"type"`
	ParentID  *uuid.UUID `json:"parent_id"`
	Topic     *string    `json:"topic"`
	IsPrivate bool       `json:"is_private"`
}

// Create handles POST /api/communities/{id}/channels
func (h *ChannelHandler) Create(w http.ResponseWriter, r *http.Request) {
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
	if perms&models.PermManageChannels == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage channels")
		return
	}

	var req CreateChannelRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || utf8.RuneCountInString(req.Name) > 100 {
		writeErrorWithCode(w, http.StatusBadRequest, "name must be 1-100 characters", "INVALID_NAME")
		return
	}

	// Validate channel type
	switch req.Type {
	case models.ChannelTypeText, models.ChannelTypeAnnouncement, models.ChannelTypeVoice, models.ChannelTypeCategory:
		// valid
	default:
		writeErrorWithCode(w, http.StatusBadRequest, "type must be one of: text, announcement, voice, category", "INVALID_TYPE")
		return
	}

	channel, err := h.channels.Create(r.Context(), communityID, req.Name, req.Type, req.ParentID, req.Topic, req.IsPrivate)
	if err != nil {
		log.Printf("Error creating channel: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	// Broadcast channel creation to community members
	payload, _ := json.Marshal(channel)
	allChannels, err := h.channels.ListByCommunity(r.Context(), communityID)
	if err == nil {
		for _, ch := range allChannels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{
				Type:    ws.EventChannelUpdate,
				Payload: payload,
			}, nil)
		}
	}

	writeJSON(w, http.StatusCreated, channel)
}

// List handles GET /api/communities/{id}/channels
func (h *ChannelHandler) List(w http.ResponseWriter, r *http.Request) {
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

	channels, err := h.channels.ListByCommunity(r.Context(), communityID)
	if err != nil {
		log.Printf("Error listing channels: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if channels == nil {
		channels = []*models.Channel{}
	}

	writeJSON(w, http.StatusOK, channels)
}

// Get handles GET /api/channels/{id}
func (h *ChannelHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := h.channels.GetByID(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting channel: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	// Must be a member of the community
	isMember, err := h.communities.IsMember(r.Context(), userID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this community")
		return
	}

	writeJSON(w, http.StatusOK, channel)
}

// Update handles PATCH /api/channels/{id}
func (h *ChannelHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := h.channels.GetByID(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting channel: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	// Check permissions
	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageChannels == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage channels")
		return
	}

	var req struct {
		Name      *string `json:"name"`
		Topic     *string `json:"topic"`
		Position  *int    `json:"position"`
		IsPrivate *bool   `json:"is_private"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name != nil && (utf8.RuneCountInString(*req.Name) == 0 || utf8.RuneCountInString(*req.Name) > 100) {
		writeErrorWithCode(w, http.StatusBadRequest, "name must be 1-100 characters", "INVALID_NAME")
		return
	}

	updated, err := h.channels.Update(r.Context(), channelID, req.Name, req.Topic, req.Position, req.IsPrivate)
	if err != nil {
		log.Printf("Error updating channel: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update channel")
		return
	}
	if updated == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	// Broadcast channel update
	payload, _ := json.Marshal(updated)
	h.hub.BroadcastToChannel(channelID, ws.WSEvent{
		Type:    ws.EventChannelUpdate,
		Payload: payload,
	}, nil)

	writeJSON(w, http.StatusOK, updated)
}

// Delete handles DELETE /api/channels/{id}
func (h *ChannelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := h.channels.GetByID(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting channel: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	// Check permissions
	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageChannels == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage channels")
		return
	}

	if err := h.channels.Delete(r.Context(), channelID); err != nil {
		log.Printf("Error deleting channel: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete channel")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "channel deleted"})
}

// SetPermissionOverwrite handles PUT /api/channels/{id}/permissions/{roleId}
func (h *ChannelHandler) SetPermissionOverwrite(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	roleID, err := parseUUID(r.PathValue("roleId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	channel, err := h.channels.GetByID(r.Context(), channelID)
	if err != nil || channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	// Check permissions
	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	var req struct {
		Allow int64 `json:"allow"`
		Deny  int64 `json:"deny"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.channels.SetPermissionOverwrite(r.Context(), channelID, roleID, req.Allow, req.Deny); err != nil {
		log.Printf("Error setting permission overwrite: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to set permission overwrite")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "permission overwrite updated"})
}

// DeletePermissionOverwrite handles DELETE /api/channels/{id}/permissions/{roleId}
func (h *ChannelHandler) DeletePermissionOverwrite(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	roleID, err := parseUUID(r.PathValue("roleId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	channel, err := h.channels.GetByID(r.Context(), channelID)
	if err != nil || channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	if err := h.channels.DeletePermissionOverwrite(r.Context(), channelID, roleID); err != nil {
		log.Printf("Error deleting permission overwrite: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete permission overwrite")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "permission overwrite removed"})
}
