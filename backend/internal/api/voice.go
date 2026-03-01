package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/livekit/protocol/auth"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/signaling"
	"github.com/pulse-chat/pulse/internal/ws"
)

// VoiceHandler handles voice channel REST API endpoints
type VoiceHandler struct {
	voiceQueries     *db.VoiceStateQueries
	channelQueries   *db.ChannelQueries
	communityQueries *db.CommunityQueries
	roomManager      *signaling.RoomManager
	hub              *ws.Hub
	livekitAPIKey    string
	livekitAPISecret string
	livekitWSURL     string // Browser-facing LiveKit WebSocket URL
}

// NewVoiceHandler creates a new VoiceHandler
func NewVoiceHandler(
	voiceQueries *db.VoiceStateQueries,
	channelQueries *db.ChannelQueries,
	communityQueries *db.CommunityQueries,
	roomManager *signaling.RoomManager,
	hub *ws.Hub,
	livekitAPIKey, livekitAPISecret, livekitWSURL string,
) *VoiceHandler {
	return &VoiceHandler{
		voiceQueries:     voiceQueries,
		channelQueries:   channelQueries,
		communityQueries: communityQueries,
		roomManager:      roomManager,
		hub:              hub,
		livekitAPIKey:    livekitAPIKey,
		livekitAPISecret: livekitAPISecret,
		livekitWSURL:     livekitWSURL,
	}
}

// JoinVoice handles a user joining a voice channel
func (h *VoiceHandler) JoinVoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	username, _ := middleware.GetUsername(r.Context())

	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel ID")
		return
	}

	// Verify channel exists and is a voice channel
	channel, err := h.channelQueries.GetByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}
	if channel.Type != "voice" {
		writeError(w, http.StatusBadRequest, "not a voice channel")
		return
	}

	// Verify user is a member of the community
	isMember, err := h.communityQueries.IsMember(r.Context(), userID, channel.CommunityID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check membership")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this community")
		return
	}

	// Join the voice room (in-memory state)
	previousChannel := h.roomManager.JoinRoom(channelID, channel.CommunityID, userID, username)

	// Persist to database
	_, err = h.voiceQueries.Join(r.Context(), userID, channelID, channel.CommunityID)
	if err != nil {
		log.Printf("Error persisting voice state: %v", err)
		// Non-fatal — in-memory state is authoritative
	}

	// If user was in another channel, broadcast leave to that channel
	if previousChannel != nil {
		leavePayload, marshalErr := json.Marshal(map[string]interface{}{
			"user_id":    userID,
			"channel_id": *previousChannel,
			"username":   username,
		})
		if marshalErr == nil {
			h.hub.BroadcastToChannel(*previousChannel, ws.WSEvent{
				Type:    ws.EventVoiceLeave,
				Payload: leavePayload,
			}, nil)
		}
	}

	// Broadcast voice_join to the channel
	joinPayload, err := json.Marshal(map[string]interface{}{
		"user_id":    userID,
		"channel_id": channelID,
		"username":   username,
		"self_mute":  false,
		"self_deaf":  false,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to marshal event")
		return
	}
	h.hub.BroadcastToChannel(channelID, ws.WSEvent{
		Type:    ws.EventVoiceJoin,
		Payload: joinPayload,
	}, &userID)

	// Generate LiveKit access token for this user
	// Room name = channel ID (each voice channel is a LiveKit room)
	roomName := channelID.String()

	at := auth.NewAccessToken(h.livekitAPIKey, h.livekitAPISecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	at.AddGrant(grant).
		SetIdentity(userID.String()).
		SetName(username).
		SetValidFor(24 * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		log.Printf("Error generating LiveKit token: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to generate voice token")
		return
	}

	// Get current participants
	participants := h.roomManager.GetParticipants(channelID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"channel_id":   channelID,
		"participants": participants,
		"token":        token,
		"livekit_url":  h.livekitWSURL,
	})
}

// LeaveVoice handles a user leaving a voice channel
func (h *VoiceHandler) LeaveVoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	username, _ := middleware.GetUsername(r.Context())

	// Check if user has an active screen share BEFORE leaving
	// (LeaveRoom deletes screen shares, so we must check first)
	_, hadScreenShare := h.roomManager.FindUserForScreenShare(userID)

	// Leave the voice room (in-memory)
	channelID, wasInRoom := h.roomManager.LeaveRoom(userID)
	if !wasInRoom {
		writeError(w, http.StatusBadRequest, "not in a voice channel")
		return
	}

	// Remove from database.
	// M7: in-memory RoomManager state is the authoritative source for active
	// voice participants. A DB failure here (e.g. the row was already cleaned
	// up by a disconnect webhook) must not prevent the REST response from
	// succeeding — the user has already been removed from the in-memory room
	// above. Log unexpected errors but ignore ErrNotInVoice (already cleaned).
	_, dbErr := h.voiceQueries.Leave(r.Context(), userID)
	if dbErr != nil && !errors.Is(dbErr, db.ErrNotInVoice) {
		log.Printf("LeaveVoice: DB cleanup for user %s failed (non-fatal): %v", userID, dbErr)
	}

	// If user was screen sharing, broadcast stop
	if hadScreenShare {
		stopPayload, marshalErr := json.Marshal(map[string]interface{}{
			"user_id":    userID,
			"channel_id": channelID,
		})
		if marshalErr == nil {
			h.hub.BroadcastToChannel(channelID, ws.WSEvent{
				Type:    "screen_share_stop",
				Payload: stopPayload,
			}, nil)
		}
	}

	// Broadcast voice_leave
	leavePayload, err := json.Marshal(map[string]interface{}{
		"user_id":    userID,
		"channel_id": channelID,
		"username":   username,
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, ws.WSEvent{
			Type:    ws.EventVoiceLeave,
			Payload: leavePayload,
		}, nil)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "left voice channel",
	})
}

// UpdateVoiceState handles updating a user's mute/deaf state
func (h *VoiceHandler) UpdateVoiceState(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		SelfMute bool `json:"self_mute"`
		SelfDeaf bool `json:"self_deaf"`
	}
	if err := readJSONLax(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Update in-memory state
	channelID, found := h.roomManager.UpdateVoiceState(userID, req.SelfMute, req.SelfDeaf)
	if !found {
		writeError(w, http.StatusBadRequest, "not in a voice channel")
		return
	}

	// Update database
	if err := h.voiceQueries.UpdateState(r.Context(), userID, req.SelfMute, req.SelfDeaf); err != nil {
		log.Printf("Error updating voice state in DB: %v", err)
	}

	// Broadcast voice_state update
	statePayload, err := json.Marshal(map[string]interface{}{
		"user_id":    userID,
		"channel_id": channelID,
		"self_mute":  req.SelfMute,
		"self_deaf":  req.SelfDeaf,
	})
	if err == nil {
		h.hub.BroadcastToChannel(channelID, ws.WSEvent{
			Type:    ws.EventVoiceState,
			Payload: statePayload,
		}, nil)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "voice state updated",
	})
}

// GetVoiceParticipants returns the list of users in a voice channel
func (h *VoiceHandler) GetVoiceParticipants(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel ID")
		return
	}

	participants := h.roomManager.GetParticipants(channelID)
	if participants == nil {
		participants = []signaling.VoiceParticipant{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"participants": participants,
	})
}

// DisconnectCallback is a helper that creates a disconnect handler
// for LiveKit webhook integration (future use). For now, WS-based
// voice_leave handles cleanup.
func (h *VoiceHandler) handleDisconnect(channelID uuid.UUID, disconnectUserID uuid.UUID) {
	log.Printf("User %s disconnected from channel %s — triggering voice leave", disconnectUserID, channelID)

	chID, wasInRoom := h.roomManager.LeaveRoom(disconnectUserID)
	if !wasInRoom {
		return
	}

	if _, dbErr := h.voiceQueries.Leave(context.Background(), disconnectUserID); dbErr != nil {
		log.Printf("Error removing voice state from DB on disconnect: %v", dbErr)
	}

	leavePayload, marshalErr := json.Marshal(map[string]interface{}{
		"user_id":    disconnectUserID,
		"channel_id": chID,
		"username":   "",
	})
	if marshalErr == nil {
		h.hub.BroadcastToChannel(chID, ws.WSEvent{
			Type:    ws.EventVoiceLeave,
			Payload: leavePayload,
		}, nil)
	}
}
