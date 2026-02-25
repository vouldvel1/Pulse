package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/pulse-chat/pulse/internal/cache"
	"github.com/pulse-chat/pulse/internal/middleware"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 65536
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // In production, restrict to your domain
	},
}

// Event types
const (
	EventMessage         = "message"
	EventMessageEdit     = "message_edit"
	EventMessageDelete   = "message_delete"
	EventMessageEmbeds   = "message_embeds"
	EventTyping          = "typing"
	EventPresence        = "presence"
	EventChannelJoin     = "channel_join"
	EventChannelLeave    = "channel_leave"
	EventReaction        = "reaction"
	EventReactionRemove  = "reaction_remove"
	EventNotification    = "notification"
	EventVoiceJoin       = "voice_join"
	EventVoiceLeave      = "voice_leave"
	EventVoiceState      = "voice_state"
	EventScreenShare     = "screen_share_offer"
	EventScreenAnswer    = "screen_share_answer"
	EventICECandidate    = "ice_candidate"
	EventMemberJoin      = "member_join"
	EventMemberLeave     = "member_leave"
	EventMemberUpdate    = "member_update"
	EventCommunityUpdate = "community_update"
	EventChannelUpdate   = "channel_update"
	EventVoiceSpeaking   = "voice:speaking"
	EventReady           = "ready"
	EventPing            = "ping"
	EventPong            = "pong"
	EventError           = "error"
)

// WSEvent is a WebSocket message envelope
type WSEvent struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// Client represents a WebSocket connection
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	userID   uuid.UUID
	username string
	channels map[uuid.UUID]bool
	mu       sync.RWMutex
}

// VoiceEventHandler is an interface for handling voice-related WS events
// This avoids a circular dependency between ws and signaling packages.
type VoiceEventHandler interface {
	HandleVoiceJoin(userID uuid.UUID, username string, channelID uuid.UUID) error
	HandleVoiceLeave(userID uuid.UUID, username string) error
	HandleVoiceState(userID uuid.UUID, selfMute, selfDeaf bool) error
	HandleVoiceSpeaking(userID uuid.UUID, isSpeaking bool) error
	HandleScreenShareOffer(fromUserID uuid.UUID, targetUserID uuid.UUID, channelID uuid.UUID, sdp json.RawMessage) error
	HandleScreenShareAnswer(fromUserID uuid.UUID, targetUserID uuid.UUID, channelID uuid.UUID, sdp json.RawMessage) error
	HandleICECandidate(fromUserID uuid.UUID, targetUserID uuid.UUID, channelID uuid.UUID, candidate json.RawMessage, target string) error
}

// Hub manages all WebSocket connections
type Hub struct {
	clients      map[*Client]bool
	userMap      map[uuid.UUID][]*Client
	channels     map[uuid.UUID]map[*Client]bool
	register     chan *Client
	unregister   chan *Client
	broadcast    chan *BroadcastMessage
	cache        *cache.Store
	auth         *middleware.Auth
	voiceHandler VoiceEventHandler
	mu           sync.RWMutex
}

// BroadcastMessage is a message sent to specific channels
type BroadcastMessage struct {
	ChannelID uuid.UUID
	Event     []byte
	ExcludeID *uuid.UUID
}

// NewHub creates a new WebSocket hub
func NewHub(cacheStore *cache.Store, auth *middleware.Auth) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		userMap:    make(map[uuid.UUID][]*Client),
		channels:   make(map[uuid.UUID]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *BroadcastMessage, 256),
		cache:      cacheStore,
		auth:       auth,
	}
}

// SetVoiceHandler sets the voice event handler (called after initialization to avoid circular deps)
func (h *Hub) SetVoiceHandler(handler VoiceEventHandler) {
	h.voiceHandler = handler
}

// Run starts the hub's event loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.userMap[client.userID] = append(h.userMap[client.userID], client)
			h.mu.Unlock()

			// Set presence to online
			_ = h.cache.SetUserOnline(context.Background(), client.userID.String(), 5*time.Minute)

			log.Printf("Client connected: %s (%s)", client.username, client.userID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)

				// Remove from user map
				clients := h.userMap[client.userID]
				for i, c := range clients {
					if c == client {
						h.userMap[client.userID] = append(clients[:i], clients[i+1:]...)
						break
					}
				}
				if len(h.userMap[client.userID]) == 0 {
					delete(h.userMap, client.userID)
					// Set user offline
					_ = h.cache.RemoveUserPresence(context.Background(), client.userID.String())
					// Clean up voice state: if this user was in a voice channel, leave it
					if h.voiceHandler != nil {
						go func(uid uuid.UUID, uname string) {
							if err := h.voiceHandler.HandleVoiceLeave(uid, uname); err != nil {
								log.Printf("Voice leave on disconnect for %s: %v", uname, err)
							}
						}(client.userID, client.username)
					}
				}

				// Remove from all channels
				client.mu.RLock()
				for channelID := range client.channels {
					if ch, ok := h.channels[channelID]; ok {
						delete(ch, client)
						if len(ch) == 0 {
							delete(h.channels, channelID)
						}
					}
				}
				client.mu.RUnlock()
			}
			h.mu.Unlock()

			log.Printf("Client disconnected: %s (%s)", client.username, client.userID)

		case msg := <-h.broadcast:
			h.mu.RLock()
			if clients, ok := h.channels[msg.ChannelID]; ok {
				for client := range clients {
					if msg.ExcludeID != nil && client.userID == *msg.ExcludeID {
						continue
					}
					select {
					case client.send <- msg.Event:
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// HandleWebSocket upgrades HTTP to WebSocket
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Authenticate via query param or header
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		tokenStr = r.Header.Get("Sec-WebSocket-Protocol")
	}
	if tokenStr == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	claims, err := h.auth.ValidateToken(tokenStr)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var responseHeader http.Header
	if r.Header.Get("Sec-WebSocket-Protocol") != "" {
		responseHeader = http.Header{"Sec-WebSocket-Protocol": {tokenStr}}
	}

	conn, err := upgrader.Upgrade(w, r, responseHeader)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:      h,
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   claims.UserID,
		username: claims.Username,
		channels: make(map[uuid.UUID]bool),
	}

	h.register <- client

	go client.writePump()
	go client.readPump()

	// Send ready event
	readyPayload, _ := json.Marshal(map[string]interface{}{
		"user_id":  claims.UserID,
		"username": claims.Username,
	})
	readyEvent, _ := json.Marshal(WSEvent{
		Type:    EventReady,
		Payload: readyPayload,
	})
	client.send <- readyEvent
}

// SubscribeToChannel adds a client to a channel
func (h *Hub) SubscribeToChannel(client *Client, channelID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.channels[channelID]; !ok {
		h.channels[channelID] = make(map[*Client]bool)
	}
	h.channels[channelID][client] = true

	client.mu.Lock()
	client.channels[channelID] = true
	client.mu.Unlock()
}

// UnsubscribeFromChannel removes a client from a channel
func (h *Hub) UnsubscribeFromChannel(client *Client, channelID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if ch, ok := h.channels[channelID]; ok {
		delete(ch, client)
		if len(ch) == 0 {
			delete(h.channels, channelID)
		}
	}

	client.mu.Lock()
	delete(client.channels, channelID)
	client.mu.Unlock()
}

// BroadcastToChannel sends an event to all clients in a channel
func (h *Hub) BroadcastToChannel(channelID uuid.UUID, event WSEvent, excludeUserID *uuid.UUID) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Error marshaling broadcast event: %v", err)
		return
	}
	h.broadcast <- &BroadcastMessage{
		ChannelID: channelID,
		Event:     data,
		ExcludeID: excludeUserID,
	}
}

// BroadcastToChannelRaw sends an arbitrary JSON-marshalable event to all clients in a channel
func (h *Hub) BroadcastToChannelRaw(channelID uuid.UUID, event interface{}, excludeUserID *uuid.UUID) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Error marshaling broadcast event: %v", err)
		return
	}
	h.broadcast <- &BroadcastMessage{
		ChannelID: channelID,
		Event:     data,
		ExcludeID: excludeUserID,
	}
}

// SendToUser sends an event to all connections of a specific user
func (h *Hub) SendToUser(userID uuid.UUID, event WSEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Error marshaling user event: %v", err)
		return
	}

	h.mu.RLock()
	clients := h.userMap[userID]
	h.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.send <- data:
		default:
			// Client send buffer full, skip
		}
	}
}

// SendToUserRaw sends an arbitrary JSON-marshalable event to all connections of a specific user
func (h *Hub) SendToUserRaw(userID uuid.UUID, event interface{}) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Error marshaling user event: %v", err)
		return
	}

	h.mu.RLock()
	clients := h.userMap[userID]
	h.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.send <- data:
		default:
			// Client send buffer full, skip
		}
	}
}

// readPump pumps messages from the WebSocket to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	if err := c.conn.SetReadDeadline(time.Now().Add(pongWait)); err != nil {
		log.Printf("Error setting read deadline: %v", err)
		return
	}
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var event WSEvent
		if err := json.Unmarshal(message, &event); err != nil {
			log.Printf("Invalid WebSocket message: %v", err)
			continue
		}

		c.handleEvent(event)
	}
}

// writePump pumps messages from the hub to the WebSocket
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				return
			}
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				return
			}

			// Drain queued messages
			n := len(c.send)
			for i := 0; i < n; i++ {
				if _, err := w.Write([]byte("\n")); err != nil {
					break
				}
				msg := <-c.send
				if _, err := w.Write(msg); err != nil {
					break
				}
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				return
			}
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleEvent routes incoming WebSocket events
func (c *Client) handleEvent(event WSEvent) {
	switch event.Type {
	case EventPing:
		pongData, _ := json.Marshal(WSEvent{Type: EventPong})
		c.send <- pongData

	case EventChannelJoin:
		var payload struct {
			ChannelID uuid.UUID `json:"channel_id"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return
		}
		c.hub.SubscribeToChannel(c, payload.ChannelID)

	case EventChannelLeave:
		var payload struct {
			ChannelID uuid.UUID `json:"channel_id"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return
		}
		c.hub.UnsubscribeFromChannel(c, payload.ChannelID)

	case EventTyping:
		var payload struct {
			ChannelID uuid.UUID `json:"channel_id"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return
		}
		typingPayload, _ := json.Marshal(map[string]interface{}{
			"channel_id": payload.ChannelID,
			"user_id":    c.userID,
			"username":   c.username,
		})
		c.hub.BroadcastToChannel(payload.ChannelID, WSEvent{
			Type:    EventTyping,
			Payload: typingPayload,
		}, &c.userID)

	case EventPresence:
		var payload struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return
		}
		_ = c.hub.cache.SetUserPresence(context.Background(), c.userID.String(), payload.Status, 5*time.Minute)

	case EventVoiceJoin:
		if c.hub.voiceHandler == nil {
			log.Printf("Voice handler not configured")
			return
		}
		var payload struct {
			ChannelID uuid.UUID `json:"channel_id"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			log.Printf("Invalid voice_join payload: %v", err)
			return
		}
		if err := c.hub.voiceHandler.HandleVoiceJoin(c.userID, c.username, payload.ChannelID); err != nil {
			log.Printf("Voice join error: %v", err)
			errPayload, _ := json.Marshal(map[string]string{"error": err.Error()})
			errEvent, _ := json.Marshal(WSEvent{Type: EventError, Payload: errPayload})
			c.send <- errEvent
		}

	case EventVoiceLeave:
		if c.hub.voiceHandler == nil {
			return
		}
		if err := c.hub.voiceHandler.HandleVoiceLeave(c.userID, c.username); err != nil {
			log.Printf("Voice leave error: %v", err)
		}

	case EventVoiceState:
		if c.hub.voiceHandler == nil {
			return
		}
		var payload struct {
			SelfMute bool `json:"self_mute"`
			SelfDeaf bool `json:"self_deaf"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			log.Printf("Invalid voice_state payload: %v", err)
			return
		}
		if err := c.hub.voiceHandler.HandleVoiceState(c.userID, payload.SelfMute, payload.SelfDeaf); err != nil {
			log.Printf("Voice state error: %v", err)
		}

	case EventScreenShare:
		if c.hub.voiceHandler == nil {
			return
		}
		var payload struct {
			TargetUserID uuid.UUID       `json:"target_user_id"`
			ChannelID    uuid.UUID       `json:"channel_id"`
			SDP          json.RawMessage `json:"sdp"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			log.Printf("Invalid screen_share_offer payload: %v", err)
			return
		}
		if err := c.hub.voiceHandler.HandleScreenShareOffer(c.userID, payload.TargetUserID, payload.ChannelID, payload.SDP); err != nil {
			log.Printf("Screen share offer error: %v", err)
		}

	case EventScreenAnswer:
		if c.hub.voiceHandler == nil {
			return
		}
		var payload struct {
			TargetUserID uuid.UUID       `json:"target_user_id"`
			ChannelID    uuid.UUID       `json:"channel_id"`
			SDP          json.RawMessage `json:"sdp"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			log.Printf("Invalid screen_share_answer payload: %v", err)
			return
		}
		if err := c.hub.voiceHandler.HandleScreenShareAnswer(c.userID, payload.TargetUserID, payload.ChannelID, payload.SDP); err != nil {
			log.Printf("Screen share answer error: %v", err)
		}

	case EventICECandidate:
		if c.hub.voiceHandler == nil {
			return
		}
		var payload struct {
			TargetUserID uuid.UUID       `json:"target_user_id"`
			ChannelID    uuid.UUID       `json:"channel_id"`
			Candidate    json.RawMessage `json:"candidate"`
			Target       string          `json:"target"` // "peer" for P2P screen share, "sfu" for voice
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			log.Printf("Invalid ice_candidate payload: %v", err)
			return
		}
		if err := c.hub.voiceHandler.HandleICECandidate(c.userID, payload.TargetUserID, payload.ChannelID, payload.Candidate, payload.Target); err != nil {
			log.Printf("ICE candidate error: %v", err)
		}

	case EventVoiceSpeaking:
		if c.hub.voiceHandler == nil {
			return
		}
		var payload struct {
			IsSpeaking bool `json:"is_speaking"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			log.Printf("Invalid voice:speaking payload: %v", err)
			return
		}
		if err := c.hub.voiceHandler.HandleVoiceSpeaking(c.userID, payload.IsSpeaking); err != nil {
			log.Printf("Voice speaking error: %v", err)
		}

	default:
		log.Printf("Unknown event type: %s from user %s", event.Type, c.username)
	}
}
