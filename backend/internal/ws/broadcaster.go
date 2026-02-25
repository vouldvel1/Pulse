package ws

import "github.com/google/uuid"

// HubBroadcaster wraps Hub to satisfy signaling.Broadcaster interface
type HubBroadcaster struct {
	Hub *Hub
}

// BroadcastToChannel implements signaling.Broadcaster
func (hb *HubBroadcaster) BroadcastToChannel(channelID uuid.UUID, event interface{}, excludeUserID *uuid.UUID) {
	hb.Hub.BroadcastToChannelRaw(channelID, event, excludeUserID)
}

// SendToUser implements signaling.Broadcaster
func (hb *HubBroadcaster) SendToUser(userID uuid.UUID, event interface{}) {
	hb.Hub.SendToUserRaw(userID, event)
}
