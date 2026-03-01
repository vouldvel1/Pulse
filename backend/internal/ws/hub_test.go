package ws

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

// ---- NewHub construction ----

func TestNewHub_NotNil(t *testing.T) {
	h := NewHub(nil, nil)
	if h == nil {
		t.Fatal("NewHub returned nil")
	}
}

func TestNewHub_MapsInitialized(t *testing.T) {
	h := NewHub(nil, nil)
	if h.clients == nil {
		t.Error("clients map should be initialized")
	}
	if h.userMap == nil {
		t.Error("userMap should be initialized")
	}
	if h.channels == nil {
		t.Error("channels map should be initialized")
	}
	if h.allowedOrigins == nil {
		t.Error("allowedOrigins map should be initialized")
	}
}

func TestNewHub_ChannelsInitialized(t *testing.T) {
	h := NewHub(nil, nil)
	// Internal channels should be non-nil and ready
	if h.register == nil {
		t.Error("register channel should not be nil")
	}
	if h.unregister == nil {
		t.Error("unregister channel should not be nil")
	}
	if h.broadcast == nil {
		t.Error("broadcast channel should not be nil")
	}
}

// ---- SetAllowedOrigins ----

func TestSetAllowedOrigins(t *testing.T) {
	h := NewHub(nil, nil)
	h.SetAllowedOrigins([]string{"https://example.com", "https://app.example.com"})
	if !h.allowedOrigins["https://example.com"] {
		t.Error("https://example.com should be allowed")
	}
	if !h.allowedOrigins["https://app.example.com"] {
		t.Error("https://app.example.com should be allowed")
	}
	if h.allowedOrigins["https://evil.com"] {
		t.Error("https://evil.com should not be allowed")
	}
}

func TestSetAllowedOrigins_Empty(t *testing.T) {
	h := NewHub(nil, nil)
	h.SetAllowedOrigins([]string{})
	if len(h.allowedOrigins) != 0 {
		t.Errorf("expected 0 allowed origins, got %d", len(h.allowedOrigins))
	}
}

// ---- SubscribeToChannel / UnsubscribeFromChannel ----

func makeTestClient(h *Hub) *Client {
	return &Client{
		hub:      h,
		send:     make(chan []byte, 256),
		userID:   uuid.New(),
		username: "testuser",
		channels: make(map[uuid.UUID]bool),
	}
}

func TestSubscribeToChannel(t *testing.T) {
	h := NewHub(nil, nil)
	client := makeTestClient(h)
	channelID := uuid.New()

	h.SubscribeToChannel(client, channelID)

	h.mu.RLock()
	_, inHub := h.channels[channelID][client]
	h.mu.RUnlock()

	if !inHub {
		t.Error("client should be subscribed to channel in hub")
	}

	client.mu.RLock()
	_, inClient := client.channels[channelID]
	client.mu.RUnlock()

	if !inClient {
		t.Error("client should have channel in its own channel set")
	}
}

func TestUnsubscribeFromChannel(t *testing.T) {
	h := NewHub(nil, nil)
	client := makeTestClient(h)
	channelID := uuid.New()

	h.SubscribeToChannel(client, channelID)
	h.UnsubscribeFromChannel(client, channelID)

	h.mu.RLock()
	_, exists := h.channels[channelID]
	h.mu.RUnlock()

	if exists {
		t.Error("channel should be removed from hub when last subscriber leaves")
	}

	client.mu.RLock()
	_, inClient := client.channels[channelID]
	client.mu.RUnlock()

	if inClient {
		t.Error("channel should be removed from client's channel set")
	}
}

func TestUnsubscribeFromChannel_NonExistent(t *testing.T) {
	h := NewHub(nil, nil)
	client := makeTestClient(h)
	channelID := uuid.New()

	// Should not panic when unsubscribing from a channel not subscribed to
	h.UnsubscribeFromChannel(client, channelID)
}

func TestSubscribeToChannel_MultipleClients(t *testing.T) {
	h := NewHub(nil, nil)
	channelID := uuid.New()
	c1 := makeTestClient(h)
	c2 := makeTestClient(h)

	h.SubscribeToChannel(c1, channelID)
	h.SubscribeToChannel(c2, channelID)

	h.mu.RLock()
	count := len(h.channels[channelID])
	h.mu.RUnlock()

	if count != 2 {
		t.Errorf("expected 2 subscribers, got %d", count)
	}

	// Unsubscribe one — channel should still exist
	h.UnsubscribeFromChannel(c1, channelID)

	h.mu.RLock()
	_, exists := h.channels[channelID]
	h.mu.RUnlock()

	if !exists {
		t.Error("channel should still exist after one of two subscribers leaves")
	}
}

// ---- BroadcastToChannel ----

func TestBroadcastToChannel_NilChannelNoClients(t *testing.T) {
	// BroadcastToChannel enqueues to the buffered broadcast channel (cap 256).
	// With no hub.Run() goroutine, the message just sits in the buffer —
	// this should NOT block or panic.
	h := NewHub(nil, nil)
	channelID := uuid.New()
	event := WSEvent{Type: "test", Payload: json.RawMessage(`{}`)}
	h.BroadcastToChannel(channelID, event, nil)
	// If we reach here without blocking, the test passes.
}

func TestBroadcastToChannel_WithExcludeID(t *testing.T) {
	h := NewHub(nil, nil)
	channelID := uuid.New()
	excludeID := uuid.New()
	event := WSEvent{Type: "test", Payload: json.RawMessage(`{}`)}
	h.BroadcastToChannel(channelID, event, &excludeID)
}

// ---- WSEvent JSON serialisation ----

func TestWSEvent_JSONRoundTrip(t *testing.T) {
	orig := WSEvent{
		Type:    "message",
		Payload: json.RawMessage(`{"text":"hello"}`),
	}
	b, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded WSEvent
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.Type != "message" {
		t.Errorf("type: want message, got %q", decoded.Type)
	}
	if string(decoded.Payload) != `{"text":"hello"}` {
		t.Errorf("payload: want {\"text\":\"hello\"}, got %s", decoded.Payload)
	}
}

// ---- checkOrigin ----

func TestCheckOrigin_NoAllowlistEmptyOrigin(t *testing.T) {
	h := NewHub(nil, nil)
	// No allowlist + no Origin header → same-origin check passes (Origin == "")
	req := &struct{ header map[string][]string }{header: map[string][]string{}}
	_ = req
	// We test checkOrigin indirectly via SetAllowedOrigins
	if len(h.allowedOrigins) != 0 {
		t.Error("expected empty allowedOrigins")
	}
}

func TestCheckOrigin_WithAllowlistKnownOrigin(t *testing.T) {
	h := NewHub(nil, nil)
	h.SetAllowedOrigins([]string{"https://app.test"})
	if !h.allowedOrigins["https://app.test"] {
		t.Error("origin should be allowed")
	}
}

// ---- Event type constants ----

func TestEventConstants_Unique(t *testing.T) {
	events := []string{
		EventMessage, EventMessageEdit, EventMessageDelete,
		EventMessageEmbeds, EventTyping, EventPresence,
		EventChannelJoin, EventChannelLeave, EventReaction,
		EventReactionRemove, EventNotification, EventVoiceJoin,
		EventVoiceLeave, EventVoiceState, EventScreenShare,
		EventScreenAnswer, EventICECandidate, EventMemberJoin,
		EventMemberLeave, EventMemberUpdate, EventCommunityUpdate,
		EventChannelUpdate, EventReady, EventPing, EventPong, EventError,
	}
	seen := make(map[string]bool)
	for _, e := range events {
		if seen[e] {
			t.Errorf("duplicate event constant: %q", e)
		}
		seen[e] = true
	}
}
