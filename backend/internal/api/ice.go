package api

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ICEHandler serves ephemeral TURN credentials for WebRTC ICE negotiation.
// Credentials are generated using the same HMAC-SHA1 scheme as LiveKit's
// built-in TURN server, so both the LiveKit SDK and raw RTCPeerConnection
// (used by screen share) can authenticate against the same TURN server.
type ICEHandler struct {
	turnSecret  string // matches turn.secret in livekit.yaml
	turnHost    string // host:port of the TURN server (e.g. "127.0.0.1:3478")
	turnTLSPort string // TLS port shared with LiveKit TCP port (e.g. "7881")
}

// NewICEHandler creates a new ICEHandler.
// turnHost is the publicly reachable host of the LiveKit/TURN server.
// turnSecret must match the `turn.secret` value in livekit.yaml.
func NewICEHandler(turnHost, turnTLSPort, turnSecret string) *ICEHandler {
	return &ICEHandler{
		turnSecret:  turnSecret,
		turnHost:    turnHost,
		turnTLSPort: turnTLSPort,
	}
}

type iceServerResponse struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// GetICEServers returns a list of ICE servers (STUN + TURN) with short-lived
// ephemeral credentials. Credentials expire in 24 hours.
//
// GET /api/voice/ice-servers
func (h *ICEHandler) GetICEServers(w http.ResponseWriter, r *http.Request) {
	ttl := 24 * time.Hour
	expiry := time.Now().Add(ttl).Unix()

	// Username format: "<expiry>:<random_or_user_id>"
	// We use just the expiry timestamp; LiveKit TURN validates expiry only.
	username := fmt.Sprintf("%d", expiry)

	credential, err := generateTURNCredential(username, h.turnSecret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate TURN credentials")
		return
	}

	servers := []iceServerResponse{
		// LiveKit STUN (same host, port 7880 handles STUN on UDP implicitly via RTC port)
		{
			URLs: []string{
				fmt.Sprintf("stun:%s", h.turnHost),
			},
		},
	}

	// Only add TURN servers if a secret is configured
	if h.turnSecret != "" {
		host := strings.Split(h.turnHost, ":")[0]
		servers = append(servers,
			// TURN over UDP (port 3478)
			iceServerResponse{
				URLs:       []string{fmt.Sprintf("turn:%s:3478?transport=udp", host)},
				Username:   username,
				Credential: credential,
			},
			// TURN over TCP / TURNS over TLS (LiveKit TCP port)
			iceServerResponse{
				URLs:       []string{fmt.Sprintf("turn:%s:%s?transport=tcp", host, h.turnTLSPort)},
				Username:   username,
				Credential: credential,
			},
		)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ice_servers": servers,
	})
}

// generateTURNCredential produces an HMAC-SHA1 credential for the given username.
// This matches the algorithm used by LiveKit's built-in TURN server.
func generateTURNCredential(username, secret string) (string, error) {
	mac := hmac.New(sha1.New, []byte(secret))
	if _, err := mac.Write([]byte(username)); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(mac.Sum(nil)), nil
}
