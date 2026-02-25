package signaling

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/models"
)

// VoiceParticipant represents a user in a voice room
type VoiceParticipant struct {
	UserID     uuid.UUID `json:"user_id"`
	Username   string    `json:"username"`
	SelfMute   bool      `json:"self_mute"`
	SelfDeaf   bool      `json:"self_deaf"`
	ServerMute bool      `json:"server_mute"`
	ServerDeaf bool      `json:"server_deaf"`
	JoinedAt   time.Time `json:"joined_at"`
}

// VoiceRoom represents an active voice channel with participants
type VoiceRoom struct {
	ChannelID    uuid.UUID                       `json:"channel_id"`
	CommunityID  uuid.UUID                       `json:"community_id"`
	Participants map[uuid.UUID]*VoiceParticipant `json:"participants"`
	ScreenShares map[uuid.UUID]*ScreenShare      `json:"screen_shares"`
	mu           sync.RWMutex
}

// ScreenShare tracks an active screen share session
type ScreenShare struct {
	UserID    uuid.UUID          `json:"user_id"`
	StreamID  string             `json:"stream_id"`
	Quality   string             `json:"quality"`
	HasAudio  bool               `json:"has_audio"`
	StartedAt time.Time          `json:"started_at"`
	Viewers   map[uuid.UUID]bool `json:"viewers"`
}

// RoomManager manages voice rooms and screen share sessions in memory
type RoomManager struct {
	rooms map[uuid.UUID]*VoiceRoom // channelID -> room
	mu    sync.RWMutex
}

// NewRoomManager creates a new RoomManager
func NewRoomManager() *RoomManager {
	return &RoomManager{
		rooms: make(map[uuid.UUID]*VoiceRoom),
	}
}

// getOrCreateRoom returns the room for a channel, creating if it doesn't exist
func (rm *RoomManager) getOrCreateRoom(channelID, communityID uuid.UUID) *VoiceRoom {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	room, ok := rm.rooms[channelID]
	if !ok {
		room = &VoiceRoom{
			ChannelID:    channelID,
			CommunityID:  communityID,
			Participants: make(map[uuid.UUID]*VoiceParticipant),
			ScreenShares: make(map[uuid.UUID]*ScreenShare),
		}
		rm.rooms[channelID] = room
	}
	return room
}

// GetRoom returns the room for a channel (nil if no active room)
func (rm *RoomManager) GetRoom(channelID uuid.UUID) *VoiceRoom {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	return rm.rooms[channelID]
}

// JoinRoom adds a user to a voice room. Returns the previous channel if the user was in one.
func (rm *RoomManager) JoinRoom(channelID, communityID, userID uuid.UUID, username string) (previousChannelID *uuid.UUID) {
	// First, check if user is already in a different room and remove them
	previousChannelID = rm.removeUserFromAllRooms(userID)

	room := rm.getOrCreateRoom(channelID, communityID)
	room.mu.Lock()
	room.Participants[userID] = &VoiceParticipant{
		UserID:   userID,
		Username: username,
		JoinedAt: time.Now(),
	}
	room.mu.Unlock()

	log.Printf("User %s (%s) joined voice room: channel=%s", username, userID, channelID)
	return previousChannelID
}

// LeaveRoom removes a user from their current voice room.
// Returns the channel they left and whether they were actually in a room.
func (rm *RoomManager) LeaveRoom(userID uuid.UUID) (channelID uuid.UUID, wasInRoom bool) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	for cID, room := range rm.rooms {
		room.mu.RLock()
		_, exists := room.Participants[userID]
		room.mu.RUnlock()
		if exists {
			channelID = cID
			wasInRoom = true
			break
		}
	}

	if !wasInRoom {
		return uuid.Nil, false
	}

	room := rm.rooms[channelID]
	room.mu.Lock()
	delete(room.Participants, userID)
	// Also remove any screen share by this user
	delete(room.ScreenShares, userID)
	empty := len(room.Participants) == 0 && len(room.ScreenShares) == 0
	room.mu.Unlock()

	if empty {
		delete(rm.rooms, channelID)
		log.Printf("Voice room destroyed: channel=%s", channelID)
	}

	log.Printf("User %s left voice room: channel=%s", userID, channelID)
	return channelID, true
}

// removeUserFromAllRooms removes a user from any room they're in. Returns previous channel if found.
func (rm *RoomManager) removeUserFromAllRooms(userID uuid.UUID) *uuid.UUID {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	var foundChannelID *uuid.UUID
	for channelID, room := range rm.rooms {
		room.mu.RLock()
		_, exists := room.Participants[userID]
		room.mu.RUnlock()
		if exists {
			cID := channelID
			foundChannelID = &cID
			break
		}
	}

	if foundChannelID == nil {
		return nil
	}

	room, ok := rm.rooms[*foundChannelID]
	if !ok {
		return nil
	}

	room.mu.Lock()
	delete(room.Participants, userID)
	delete(room.ScreenShares, userID)
	empty := len(room.Participants) == 0 && len(room.ScreenShares) == 0
	room.mu.Unlock()

	if empty {
		delete(rm.rooms, *foundChannelID)
		log.Printf("Voice room destroyed: channel=%s", *foundChannelID)
	}

	return foundChannelID
}

// UpdateVoiceState updates a user's mute/deaf state in their current room
func (rm *RoomManager) UpdateVoiceState(userID uuid.UUID, selfMute, selfDeaf bool) (channelID uuid.UUID, found bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for cID, room := range rm.rooms {
		room.mu.Lock()
		p, exists := room.Participants[userID]
		if exists {
			p.SelfMute = selfMute
			p.SelfDeaf = selfDeaf
			room.mu.Unlock()
			return cID, true
		}
		room.mu.Unlock()
	}
	return uuid.Nil, false
}

// ServerMuteUser sets server mute on a user
func (rm *RoomManager) ServerMuteUser(userID uuid.UUID, muted bool) (channelID uuid.UUID, found bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for cID, room := range rm.rooms {
		room.mu.Lock()
		p, exists := room.Participants[userID]
		if exists {
			p.ServerMute = muted
			room.mu.Unlock()
			return cID, true
		}
		room.mu.Unlock()
	}
	return uuid.Nil, false
}

// ServerDeafenUser sets server deafen on a user
func (rm *RoomManager) ServerDeafenUser(userID uuid.UUID, deafened bool) (channelID uuid.UUID, found bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for cID, room := range rm.rooms {
		room.mu.Lock()
		p, exists := room.Participants[userID]
		if exists {
			p.ServerDeaf = deafened
			room.mu.Unlock()
			return cID, true
		}
		room.mu.Unlock()
	}
	return uuid.Nil, false
}

// GetParticipants returns all participants in a voice room
func (rm *RoomManager) GetParticipants(channelID uuid.UUID) []VoiceParticipant {
	room := rm.GetRoom(channelID)
	if room == nil {
		return nil
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	participants := make([]VoiceParticipant, 0, len(room.Participants))
	for _, p := range room.Participants {
		participants = append(participants, *p)
	}
	return participants
}

// GetUserRoom returns the channel ID of the room the user is currently in
func (rm *RoomManager) GetUserRoom(userID uuid.UUID) (uuid.UUID, bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for channelID, room := range rm.rooms {
		room.mu.RLock()
		_, exists := room.Participants[userID]
		room.mu.RUnlock()
		if exists {
			return channelID, true
		}
	}
	return uuid.Nil, false
}

// StartScreenShare starts a screen share session in a voice room
func (rm *RoomManager) StartScreenShare(userID uuid.UUID, streamID, quality string, hasAudio bool) (channelID uuid.UUID, err error) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for cID, room := range rm.rooms {
		room.mu.Lock()
		_, isParticipant := room.Participants[userID]
		if isParticipant {
			room.ScreenShares[userID] = &ScreenShare{
				UserID:    userID,
				StreamID:  streamID,
				Quality:   quality,
				HasAudio:  hasAudio,
				StartedAt: time.Now(),
				Viewers:   make(map[uuid.UUID]bool),
			}
			room.mu.Unlock()
			return cID, nil
		}
		room.mu.Unlock()
	}
	return uuid.Nil, fmt.Errorf("user not in a voice channel")
}

// StopScreenShare stops a user's screen share
func (rm *RoomManager) StopScreenShare(userID uuid.UUID) (channelID uuid.UUID, err error) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for cID, room := range rm.rooms {
		room.mu.Lock()
		_, hasShare := room.ScreenShares[userID]
		if hasShare {
			delete(room.ScreenShares, userID)
			room.mu.Unlock()
			return cID, nil
		}
		room.mu.Unlock()
	}
	return uuid.Nil, fmt.Errorf("user has no active screen share")
}

// AddScreenShareViewer adds a viewer to a screen share session
func (rm *RoomManager) AddScreenShareViewer(broadcasterID, viewerID uuid.UUID) error {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for _, room := range rm.rooms {
		room.mu.Lock()
		share, hasShare := room.ScreenShares[broadcasterID]
		if hasShare {
			share.Viewers[viewerID] = true
			room.mu.Unlock()
			return nil
		}
		room.mu.Unlock()
	}
	return fmt.Errorf("screen share not found for broadcaster %s", broadcasterID)
}

// RemoveScreenShareViewer removes a viewer from a screen share session
func (rm *RoomManager) RemoveScreenShareViewer(broadcasterID, viewerID uuid.UUID) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for _, room := range rm.rooms {
		room.mu.Lock()
		share, hasShare := room.ScreenShares[broadcasterID]
		if hasShare {
			delete(share.Viewers, viewerID)
			room.mu.Unlock()
			return
		}
		room.mu.Unlock()
	}
}

// GetScreenShares returns all active screen shares in a channel
func (rm *RoomManager) GetScreenShares(channelID uuid.UUID) []ScreenShare {
	room := rm.GetRoom(channelID)
	if room == nil {
		return nil
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	shares := make([]ScreenShare, 0, len(room.ScreenShares))
	for _, s := range room.ScreenShares {
		shares = append(shares, *s)
	}
	return shares
}

// MarshalParticipants returns a JSON-encoded list of participants for a channel
func (rm *RoomManager) MarshalParticipants(channelID uuid.UUID) json.RawMessage {
	participants := rm.GetParticipants(channelID)
	if participants == nil {
		participants = []VoiceParticipant{}
	}
	data, err := json.Marshal(participants)
	if err != nil {
		return json.RawMessage("[]")
	}
	return data
}

// GetActiveRooms returns info about all active voice rooms (for admin/debug)
func (rm *RoomManager) GetActiveRooms() []VoiceRoomInfo {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	rooms := make([]VoiceRoomInfo, 0, len(rm.rooms))
	for _, room := range rm.rooms {
		room.mu.RLock()
		rooms = append(rooms, VoiceRoomInfo{
			ChannelID:        room.ChannelID,
			CommunityID:      room.CommunityID,
			ParticipantCount: len(room.Participants),
			ScreenShareCount: len(room.ScreenShares),
		})
		room.mu.RUnlock()
	}
	return rooms
}

// VoiceRoomInfo is a summary of a voice room for external use
type VoiceRoomInfo struct {
	ChannelID        uuid.UUID `json:"channel_id"`
	CommunityID      uuid.UUID `json:"community_id"`
	ParticipantCount int       `json:"participant_count"`
	ScreenShareCount int       `json:"screen_share_count"`
}

// FindUserForScreenShare returns the channel containing the specified user's screen share
func (rm *RoomManager) FindUserForScreenShare(broadcasterID uuid.UUID) (channelID uuid.UUID, found bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	for cID, room := range rm.rooms {
		room.mu.RLock()
		_, hasShare := room.ScreenShares[broadcasterID]
		room.mu.RUnlock()
		if hasShare {
			return cID, true
		}
	}
	return uuid.Nil, false
}

// VoiceStateToModel converts a VoiceParticipant to a models.VoiceState (for API responses)
func VoiceStateToModel(p *VoiceParticipant, channelID, communityID uuid.UUID) models.VoiceState {
	return models.VoiceState{
		UserID:      p.UserID,
		ChannelID:   channelID,
		CommunityID: communityID,
		SelfMute:    p.SelfMute,
		SelfDeaf:    p.SelfDeaf,
		ServerMute:  p.ServerMute,
		ServerDeaf:  p.ServerDeaf,
		JoinedAt:    p.JoinedAt,
	}
}
