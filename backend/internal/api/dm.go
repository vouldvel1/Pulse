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

// WS event types for DMs
const (
	EventDMMessage       = "dm_message"
	EventDMMessageEdit   = "dm_message_edit"
	EventDMMessageDelete = "dm_message_delete"
	EventDMChannelCreate = "dm_channel_create"
)

type DMHandler struct {
	dms   *db.DMQueries
	users *db.UserQueries
	hub   *ws.Hub
}

func NewDMHandler(dms *db.DMQueries, users *db.UserQueries, hub *ws.Hub) *DMHandler {
	return &DMHandler{
		dms:   dms,
		users: users,
		hub:   hub,
	}
}

type CreateDMRequest struct {
	RecipientID       string `json:"recipient_id"`
	RecipientUsername string `json:"recipient_username"`
}

type CreateGroupDMRequest struct {
	Name      string   `json:"name"`
	MemberIDs []string `json:"member_ids"`
}

type SendDMMessageRequest struct {
	Content   string     `json:"content"`
	ReplyToID *uuid.UUID `json:"reply_to_id"`
}

type EditDMMessageRequest struct {
	Content string `json:"content"`
}

// CreateDM handles POST /api/dm/channels — creates a 1-on-1 DM
func (h *DMHandler) CreateDM(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateDMRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var recipientID uuid.UUID

	if req.RecipientID != "" {
		// Resolve by UUID
		parsed, err := parseUUID(req.RecipientID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid recipient_id")
			return
		}
		recipientID = parsed
	} else if req.RecipientUsername != "" {
		// Resolve by username (strip leading @)
		username := req.RecipientUsername
		if len(username) > 0 && username[0] == '@' {
			username = username[1:]
		}
		user, err := h.users.GetUserByUsername(r.Context(), username)
		if err != nil {
			log.Printf("Error looking up user by username: %v", err)
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		if user == nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		recipientID = user.ID
	} else {
		writeError(w, http.StatusBadRequest, "recipient_id or recipient_username is required")
		return
	}

	if recipientID == userID {
		writeError(w, http.StatusBadRequest, "cannot create DM with yourself")
		return
	}

	channel, err := h.dms.CreateDMChannel(r.Context(), userID, recipientID)
	if err != nil {
		log.Printf("Error creating DM channel: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create DM channel")
		return
	}

	// Notify the recipient about the new DM channel
	payload, _ := json.Marshal(channel)
	h.hub.SendToUser(recipientID, ws.WSEvent{
		Type:    EventDMChannelCreate,
		Payload: payload,
	})

	writeJSON(w, http.StatusCreated, channel)
}

// CreateGroupDM handles POST /api/dm/channels/group
func (h *DMHandler) CreateGroupDM(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateGroupDMRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || utf8.RuneCountInString(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "name must be 1-100 characters")
		return
	}

	if len(req.MemberIDs) < 1 || len(req.MemberIDs) > 9 {
		writeError(w, http.StatusBadRequest, "group DM must have 1-9 additional members")
		return
	}

	memberIDs := make([]uuid.UUID, 0, len(req.MemberIDs))
	for _, idStr := range req.MemberIDs {
		id, err := parseUUID(idStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid member_id: "+idStr)
			return
		}
		memberIDs = append(memberIDs, id)
	}

	channel, err := h.dms.CreateGroupDM(r.Context(), userID, req.Name, memberIDs)
	if err != nil {
		log.Printf("Error creating group DM: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create group DM")
		return
	}

	// Notify all members
	payload, _ := json.Marshal(channel)
	for _, memberID := range memberIDs {
		if memberID == userID {
			continue
		}
		h.hub.SendToUser(memberID, ws.WSEvent{
			Type:    EventDMChannelCreate,
			Payload: payload,
		})
	}

	writeJSON(w, http.StatusCreated, channel)
}

// ListDMChannels handles GET /api/dm/channels
func (h *DMHandler) ListDMChannels(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channels, err := h.dms.ListDMChannels(r.Context(), userID)
	if err != nil {
		log.Printf("Error listing DM channels: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list DM channels")
		return
	}

	if channels == nil {
		channels = []*models.DMChannelWithMembers{}
	}

	writeJSON(w, http.StatusOK, channels)
}

// GetDMChannel handles GET /api/dm/channels/{id}
func (h *DMHandler) GetDMChannel(w http.ResponseWriter, r *http.Request) {
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

	channel, err := h.dms.GetDMChannel(r.Context(), channelID, userID)
	if err != nil {
		log.Printf("Error getting DM channel: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if channel == nil {
		writeError(w, http.StatusNotFound, "DM channel not found")
		return
	}

	writeJSON(w, http.StatusOK, channel)
}

// SendMessage handles POST /api/dm/channels/{id}/messages
func (h *DMHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
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

	// Verify membership
	isMember, err := h.dms.IsDMChannelMember(r.Context(), channelID, userID)
	if err != nil {
		log.Printf("Error checking DM membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this DM channel")
		return
	}

	var req SendDMMessageRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Content == "" || utf8.RuneCountInString(req.Content) > 4000 {
		writeErrorWithCode(w, http.StatusBadRequest, "content must be 1-4000 characters", "INVALID_CONTENT")
		return
	}

	msg, err := h.dms.CreateDMMessage(r.Context(), channelID, userID, req.Content, req.ReplyToID)
	if err != nil {
		log.Printf("Error creating DM message: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to send message")
		return
	}

	// Broadcast to all members of the DM channel
	memberIDs, err := h.dms.GetDMChannelMemberIDs(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting DM member IDs: %v", err)
		// Message already saved, just log the error
	} else {
		payload, _ := json.Marshal(msg)
		for _, memberID := range memberIDs {
			h.hub.SendToUser(memberID, ws.WSEvent{
				Type:    EventDMMessage,
				Payload: payload,
			})
		}
	}

	writeJSON(w, http.StatusCreated, msg)
}

// ListMessages handles GET /api/dm/channels/{id}/messages
func (h *DMHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
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

	isMember, err := h.dms.IsDMChannelMember(r.Context(), channelID, userID)
	if err != nil {
		log.Printf("Error checking DM membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this DM channel")
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
		id, err := parseUUID(b)
		if err == nil {
			before = &id
		}
	}

	messages, err := h.dms.ListDMMessages(r.Context(), channelID, before, limit)
	if err != nil {
		log.Printf("Error listing DM messages: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	if messages == nil {
		messages = []*models.DMMessage{}
	}

	writeJSON(w, http.StatusOK, messages)
}

// EditMessage handles PATCH /api/dm/channels/{channelId}/messages/{messageId}
func (h *DMHandler) EditMessage(w http.ResponseWriter, r *http.Request) {
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

	isMember, err := h.dms.IsDMChannelMember(r.Context(), channelID, userID)
	if err != nil {
		log.Printf("Error checking DM membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this DM channel")
		return
	}

	var req EditDMMessageRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Content == "" || utf8.RuneCountInString(req.Content) > 4000 {
		writeErrorWithCode(w, http.StatusBadRequest, "content must be 1-4000 characters", "INVALID_CONTENT")
		return
	}

	msg, err := h.dms.EditDMMessage(r.Context(), messageID, userID, req.Content)
	if err != nil {
		log.Printf("Error editing DM message: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to edit message")
		return
	}
	if msg == nil {
		writeError(w, http.StatusNotFound, "message not found or not yours")
		return
	}

	// Broadcast edit to all members
	memberIDs, err := h.dms.GetDMChannelMemberIDs(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting DM member IDs for edit broadcast: %v", err)
	} else {
		payload, _ := json.Marshal(msg)
		for _, memberID := range memberIDs {
			h.hub.SendToUser(memberID, ws.WSEvent{
				Type:    EventDMMessageEdit,
				Payload: payload,
			})
		}
	}

	writeJSON(w, http.StatusOK, msg)
}

// DeleteMessage handles DELETE /api/dm/channels/{channelId}/messages/{messageId}
func (h *DMHandler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
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

	isMember, err := h.dms.IsDMChannelMember(r.Context(), channelID, userID)
	if err != nil {
		log.Printf("Error checking DM membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this DM channel")
		return
	}

	deletedChannelID, err := h.dms.DeleteDMMessage(r.Context(), messageID, userID)
	if err != nil {
		log.Printf("Error deleting DM message: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete message")
		return
	}
	if deletedChannelID == uuid.Nil {
		writeError(w, http.StatusNotFound, "message not found or not yours")
		return
	}

	// Broadcast deletion to all members
	memberIDs, err := h.dms.GetDMChannelMemberIDs(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting DM member IDs for delete broadcast: %v", err)
	} else {
		payload, _ := json.Marshal(map[string]string{
			"id":         messageID.String(),
			"channel_id": channelID.String(),
		})
		for _, memberID := range memberIDs {
			h.hub.SendToUser(memberID, ws.WSEvent{
				Type:    EventDMMessageDelete,
				Payload: payload,
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
