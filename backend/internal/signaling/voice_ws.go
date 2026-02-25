package signaling

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
)

// Broadcaster defines the interface for sending WS events (avoids importing ws package)
type Broadcaster interface {
	BroadcastToChannel(channelID uuid.UUID, event interface{}, excludeUserID *uuid.UUID)
	SendToUser(userID uuid.UUID, event interface{})
}

// VoiceStateLeaver defines the minimal DB interface for cleaning up voice state on disconnect.
// This avoids a circular import between signaling and db packages.
type VoiceStateLeaver interface {
	LeaveCleanup(ctx context.Context, userID uuid.UUID) error
}

// WSEventEnvelope matches the ws.WSEvent struct to avoid circular import
type WSEventEnvelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// VoiceWSHandler implements the ws.VoiceEventHandler interface
// It bridges WebSocket events with the room manager and screen share signaling
type VoiceWSHandler struct {
	roomManager      *RoomManager
	broadcaster      Broadcaster
	voiceStateLeaver VoiceStateLeaver
}

// NewVoiceWSHandler creates a new VoiceWSHandler
func NewVoiceWSHandler(roomManager *RoomManager, broadcaster Broadcaster, voiceStateLeaver VoiceStateLeaver) *VoiceWSHandler {
	return &VoiceWSHandler{
		roomManager:      roomManager,
		broadcaster:      broadcaster,
		voiceStateLeaver: voiceStateLeaver,
	}
}

// HandleVoiceJoin processes a voice_join event from a WebSocket client
func (h *VoiceWSHandler) HandleVoiceJoin(userID uuid.UUID, username string, channelID uuid.UUID) error {
	// Note: The REST API handler is the primary way to join voice.
	// This WS handler is for clients that want to join via WS instead of REST.
	// The REST handler already handles room joining, token generation, and broadcasting.
	// This is a lightweight version that just broadcasts the join event.

	room := h.roomManager.GetRoom(channelID)
	if room == nil {
		return fmt.Errorf("no active voice room for channel %s — use REST API to join", channelID)
	}

	// Check if user is already in the room
	room.mu.RLock()
	_, alreadyIn := room.Participants[userID]
	room.mu.RUnlock()

	if !alreadyIn {
		return fmt.Errorf("user not in voice room — use POST /api/voice/channels/{id}/join")
	}

	// Just re-broadcast current state (useful for reconnection)
	participant := room.Participants[userID]
	if participant == nil {
		return nil
	}

	statePayload, err := json.Marshal(map[string]interface{}{
		"user_id":     userID,
		"channel_id":  channelID,
		"username":    username,
		"self_mute":   participant.SelfMute,
		"self_deaf":   participant.SelfDeaf,
		"server_mute": participant.ServerMute,
		"server_deaf": participant.ServerDeaf,
	})
	if err != nil {
		return fmt.Errorf("marshal voice state: %w", err)
	}

	h.broadcaster.BroadcastToChannel(channelID, WSEventEnvelope{
		Type:    "voice_state",
		Payload: statePayload,
	}, nil)

	return nil
}

// HandleVoiceLeave processes a voice_leave event from a WebSocket client
func (h *VoiceWSHandler) HandleVoiceLeave(userID uuid.UUID, username string) error {
	// Check if user has an active screen share before leaving
	_, hadScreenShare := h.roomManager.FindUserForScreenShare(userID)

	channelID, wasInRoom := h.roomManager.LeaveRoom(userID)
	if !wasInRoom {
		// Even if not in a room (already cleaned from memory), clean up DB state
		if h.voiceStateLeaver != nil {
			if err := h.voiceStateLeaver.LeaveCleanup(context.Background(), userID); err != nil {
				log.Printf("Voice state DB cleanup for %s: %v", userID, err)
			}
		}
		return nil // Silently ignore if not in a room
	}

	// Clean up DB voice state so the user doesn't appear as a stale participant
	if h.voiceStateLeaver != nil {
		if err := h.voiceStateLeaver.LeaveCleanup(context.Background(), userID); err != nil {
			log.Printf("Voice state DB cleanup for %s: %v", userID, err)
		}
	}

	// If user was screen sharing, broadcast stop
	if hadScreenShare {
		stopPayload, marshalErr := json.Marshal(map[string]interface{}{
			"user_id":    userID,
			"channel_id": channelID,
		})
		if marshalErr == nil {
			h.broadcaster.BroadcastToChannel(channelID, WSEventEnvelope{
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
	if err != nil {
		return fmt.Errorf("marshal voice leave: %w", err)
	}

	h.broadcaster.BroadcastToChannel(channelID, WSEventEnvelope{
		Type:    "voice_leave",
		Payload: leavePayload,
	}, nil)

	return nil
}

// HandleVoiceState processes a voice_state event (mute/deaf toggle)
func (h *VoiceWSHandler) HandleVoiceState(userID uuid.UUID, selfMute, selfDeaf bool) error {
	channelID, found := h.roomManager.UpdateVoiceState(userID, selfMute, selfDeaf)
	if !found {
		return fmt.Errorf("user not in a voice channel")
	}

	statePayload, err := json.Marshal(map[string]interface{}{
		"user_id":    userID,
		"channel_id": channelID,
		"self_mute":  selfMute,
		"self_deaf":  selfDeaf,
	})
	if err != nil {
		return fmt.Errorf("marshal voice state: %w", err)
	}

	h.broadcaster.BroadcastToChannel(channelID, WSEventEnvelope{
		Type:    "voice_state",
		Payload: statePayload,
	}, nil)

	return nil
}

// HandleScreenShareOffer relays an SDP offer for P2P screen sharing
// Server is only a signaling relay — never receives media
func (h *VoiceWSHandler) HandleScreenShareOffer(fromUserID uuid.UUID, targetUserID uuid.UUID, channelID uuid.UUID, sdp json.RawMessage) error {
	log.Printf("Screen share offer: %s -> %s in channel %s", fromUserID, targetUserID, channelID)

	// Track the screen share in the room manager (idempotent — first offer registers it)
	_, ssErr := h.roomManager.StartScreenShare(fromUserID, "", "720p60", false)
	if ssErr != nil {
		log.Printf("Screen share state tracking (non-fatal): %v", ssErr)
	} else {
		// Broadcast screen_share_start to all participants in the channel
		startPayload, marshalErr := json.Marshal(map[string]interface{}{
			"user_id":    fromUserID,
			"channel_id": channelID,
		})
		if marshalErr == nil {
			h.broadcaster.BroadcastToChannel(channelID, WSEventEnvelope{
				Type:    "screen_share_start",
				Payload: startPayload,
			}, nil)
		}
	}

	// Relay the SDP offer to the target user
	offerPayload, err := json.Marshal(map[string]interface{}{
		"from_user_id": fromUserID,
		"channel_id":   channelID,
		"sdp":          sdp,
	})
	if err != nil {
		return fmt.Errorf("marshal screen share offer: %w", err)
	}

	h.broadcaster.SendToUser(targetUserID, WSEventEnvelope{
		Type:    "screen_share_offer",
		Payload: offerPayload,
	})

	return nil
}

// HandleScreenShareAnswer relays an SDP answer for P2P screen sharing
func (h *VoiceWSHandler) HandleScreenShareAnswer(fromUserID uuid.UUID, targetUserID uuid.UUID, channelID uuid.UUID, sdp json.RawMessage) error {
	log.Printf("Screen share answer: %s -> %s in channel %s", fromUserID, targetUserID, channelID)

	answerPayload, err := json.Marshal(map[string]interface{}{
		"from_user_id": fromUserID,
		"channel_id":   channelID,
		"sdp":          sdp,
	})
	if err != nil {
		return fmt.Errorf("marshal screen share answer: %w", err)
	}

	h.broadcaster.SendToUser(targetUserID, WSEventEnvelope{
		Type:    "screen_share_answer",
		Payload: answerPayload,
	})

	return nil
}

// HandleVoiceSpeaking broadcasts a speaking indicator to other participants in the same voice channel
func (h *VoiceWSHandler) HandleVoiceSpeaking(userID uuid.UUID, isSpeaking bool) error {
	channelID, found := h.roomManager.GetUserRoom(userID)
	if !found {
		return fmt.Errorf("user not in a voice channel")
	}

	payload, err := json.Marshal(map[string]interface{}{
		"user_id":     userID,
		"is_speaking": isSpeaking,
	})
	if err != nil {
		return fmt.Errorf("marshal voice speaking: %w", err)
	}

	h.broadcaster.BroadcastToChannel(channelID, WSEventEnvelope{
		Type:    "voice:speaking",
		Payload: payload,
	}, &userID)

	return nil
}

// HandleICECandidate relays ICE candidates for P2P screen share signaling
func (h *VoiceWSHandler) HandleICECandidate(fromUserID uuid.UUID, targetUserID uuid.UUID, channelID uuid.UUID, candidate json.RawMessage, target string) error {
	// P2P screen share — relay to the target user
	candidatePayload, err := json.Marshal(map[string]interface{}{
		"from_user_id": fromUserID,
		"channel_id":   channelID,
		"candidate":    candidate,
		"target":       "peer",
	})
	if err != nil {
		return fmt.Errorf("marshal ICE candidate relay: %w", err)
	}

	h.broadcaster.SendToUser(targetUserID, WSEventEnvelope{
		Type:    "ice_candidate",
		Payload: candidatePayload,
	})

	return nil
}
