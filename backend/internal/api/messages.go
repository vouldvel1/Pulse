package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
	"github.com/pulse-chat/pulse/internal/ws"
)

type MessageHandler struct {
	messages    *db.MessageQueries
	channels    *db.ChannelQueries
	communities *db.CommunityQueries
	hub         *ws.Hub
}

func NewMessageHandler(messages *db.MessageQueries, channels *db.ChannelQueries, communities *db.CommunityQueries, hub *ws.Hub) *MessageHandler {
	return &MessageHandler{
		messages:    messages,
		channels:    channels,
		communities: communities,
		hub:         hub,
	}
}

type SendMessageRequest struct {
	Content   string     `json:"content"`
	ReplyToID *uuid.UUID `json:"reply_to_id"`
}

// Send handles POST /api/channels/{id}/messages
func (h *MessageHandler) Send(w http.ResponseWriter, r *http.Request) {
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

	// Check membership and permissions
	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms == 0 {
		writeError(w, http.StatusForbidden, "not a member of this community")
		return
	}

	// Check channel-level permissions
	chanPerms, err := h.channels.GetUserChannelPermissions(r.Context(), userID, channelID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking channel permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if chanPerms&models.PermSendMessages == 0 && chanPerms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: send messages")
		return
	}

	var req SendMessageRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Content == "" || utf8.RuneCountInString(req.Content) > 4000 {
		writeErrorWithCode(w, http.StatusBadRequest, "content must be 1-4000 characters", "INVALID_CONTENT")
		return
	}

	msg, err := h.messages.Create(r.Context(), channelID, userID, req.Content, req.ReplyToID)
	if err != nil {
		log.Printf("Error creating message: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to send message")
		return
	}

	// Broadcast message to channel subscribers
	payload, _ := json.Marshal(msg)
	h.hub.BroadcastToChannel(channelID, ws.WSEvent{
		Type:    ws.EventMessage,
		Payload: payload,
	}, nil)

	// Asynchronously extract URLs and fetch link embeds
	urls := ExtractURLs(req.Content)
	if len(urls) > 0 {
		go func() {
			embeds := FetchEmbeds(r.Context(), urls)
			if len(embeds) > 0 {
				embedPayload, marshalErr := json.Marshal(map[string]interface{}{
					"message_id": msg.ID,
					"channel_id": channelID,
					"embeds":     embeds,
				})
				if marshalErr != nil {
					log.Printf("Error marshaling embeds: %v", marshalErr)
					return
				}
				h.hub.BroadcastToChannel(channelID, ws.WSEvent{
					Type:    ws.EventMessageEmbeds,
					Payload: embedPayload,
				}, nil)
			}
		}()
	}

	writeJSON(w, http.StatusCreated, msg)
}

// List handles GET /api/channels/{id}/messages
func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
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

	// Check membership
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

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var before *uuid.UUID
	if b := r.URL.Query().Get("before"); b != "" {
		if parsed, err := parseUUID(b); err == nil {
			before = &parsed
		}
	}

	messages, err := h.messages.List(r.Context(), channelID, before, limit)
	if err != nil {
		log.Printf("Error listing messages: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if messages == nil {
		messages = []*models.Message{}
	}

	writeJSON(w, http.StatusOK, messages)
}

// Edit handles PATCH /api/channels/{channelId}/messages/{messageId}
func (h *MessageHandler) Edit(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	messageID, err := parseUUID(r.PathValue("messageId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Content == "" || utf8.RuneCountInString(req.Content) > 4000 {
		writeErrorWithCode(w, http.StatusBadRequest, "content must be 1-4000 characters", "INVALID_CONTENT")
		return
	}

	msg, err := h.messages.Update(r.Context(), messageID, userID, req.Content)
	if err != nil {
		log.Printf("Error updating message: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update message")
		return
	}
	if msg == nil {
		writeError(w, http.StatusNotFound, "message not found or not authorized")
		return
	}

	// Broadcast edit
	payload, _ := json.Marshal(msg)
	h.hub.BroadcastToChannel(msg.ChannelID, ws.WSEvent{
		Type:    ws.EventMessageEdit,
		Payload: payload,
	}, nil)

	writeJSON(w, http.StatusOK, msg)
}

// Delete handles DELETE /api/channels/{channelId}/messages/{messageId}
func (h *MessageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("channelId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	messageID, err := parseUUID(r.PathValue("messageId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	// Check if user has manage messages permission (moderator)
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

	isModerator := perms&models.PermManageMessages != 0 || perms&models.PermAdmin != 0

	if err := h.messages.Delete(r.Context(), messageID, userID, isModerator); err != nil {
		log.Printf("Error deleting message: %v", err)
		writeError(w, http.StatusNotFound, "message not found or not authorized")
		return
	}

	// Broadcast deletion
	payload, _ := json.Marshal(map[string]interface{}{
		"id":         messageID,
		"channel_id": channelID,
	})
	h.hub.BroadcastToChannel(channelID, ws.WSEvent{
		Type:    ws.EventMessageDelete,
		Payload: payload,
	}, nil)

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "message deleted"})
}

// GetPinned handles GET /api/channels/{id}/pins
func (h *MessageHandler) GetPinned(w http.ResponseWriter, r *http.Request) {
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
	if err != nil || channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

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

	messages, err := h.messages.GetPinned(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting pinned messages: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if messages == nil {
		messages = []*models.Message{}
	}

	writeJSON(w, http.StatusOK, messages)
}

// Pin handles PUT /api/channels/{channelId}/messages/{messageId}/pin
func (h *MessageHandler) Pin(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("channelId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	messageID, err := parseUUID(r.PathValue("messageId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
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
	if perms&models.PermManageMessages == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage messages")
		return
	}

	if err := h.messages.Pin(r.Context(), messageID, true); err != nil {
		log.Printf("Error pinning message: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to pin message")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "message pinned"})
}

// Unpin handles DELETE /api/channels/{channelId}/messages/{messageId}/pin
func (h *MessageHandler) Unpin(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("channelId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	messageID, err := parseUUID(r.PathValue("messageId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
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
	if perms&models.PermManageMessages == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage messages")
		return
	}

	if err := h.messages.Pin(r.Context(), messageID, false); err != nil {
		log.Printf("Error unpinning message: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to unpin message")
		return
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "message unpinned"})
}

// AddReaction handles PUT /api/channels/{channelId}/messages/{messageId}/reactions/{emoji}
func (h *MessageHandler) AddReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("channelId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	messageID, err := parseUUID(r.PathValue("messageId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	emoji := r.PathValue("emoji")
	if emoji == "" || utf8.RuneCountInString(emoji) > 64 {
		writeError(w, http.StatusBadRequest, "invalid emoji")
		return
	}

	channel, err := h.channels.GetByID(r.Context(), channelID)
	if err != nil || channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	isMember, err := h.communities.IsMember(r.Context(), userID, channel.CommunityID)
	if err != nil || !isMember {
		writeError(w, http.StatusForbidden, "not a member of this community")
		return
	}

	_, err = h.messages.AddReaction(r.Context(), messageID, userID, emoji)
	if err != nil {
		log.Printf("Error adding reaction: %v", err)
		writeErrorWithCode(w, http.StatusConflict, "reaction already exists or invalid", "REACTION_ERROR")
		return
	}

	// Broadcast reaction
	payload, _ := json.Marshal(map[string]interface{}{
		"message_id": messageID,
		"channel_id": channelID,
		"user_id":    userID,
		"emoji":      emoji,
	})
	h.hub.BroadcastToChannel(channelID, ws.WSEvent{
		Type:    ws.EventReaction,
		Payload: payload,
	}, nil)

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "reaction added"})
}

// RemoveReaction handles DELETE /api/channels/{channelId}/messages/{messageId}/reactions/{emoji}
func (h *MessageHandler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("channelId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	messageID, err := parseUUID(r.PathValue("messageId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	emoji := r.PathValue("emoji")
	if emoji == "" {
		writeError(w, http.StatusBadRequest, "invalid emoji")
		return
	}

	if err := h.messages.RemoveReaction(r.Context(), messageID, userID, emoji); err != nil {
		log.Printf("Error removing reaction: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to remove reaction")
		return
	}

	// Broadcast reaction removal
	payload, _ := json.Marshal(map[string]interface{}{
		"message_id": messageID,
		"channel_id": channelID,
		"user_id":    userID,
		"emoji":      emoji,
	})
	h.hub.BroadcastToChannel(channelID, ws.WSEvent{
		Type:    ws.EventReactionRemove,
		Payload: payload,
	}, nil)

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "reaction removed"})
}
