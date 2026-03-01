package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
)

// ---- Auth / JWT tests ----

func TestGenerateAndValidateToken(t *testing.T) {
	auth := NewAuth("supersecret")
	id := uuid.New()

	token, err := auth.GenerateAccessToken(id, "alice", time.Hour)
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	claims, err := auth.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if claims.UserID != id {
		t.Errorf("user_id: want %v, got %v", id, claims.UserID)
	}
	if claims.Username != "alice" {
		t.Errorf("username: want alice, got %s", claims.Username)
	}
}

func TestValidateToken_Expired(t *testing.T) {
	auth := NewAuth("supersecret")
	id := uuid.New()

	token, err := auth.GenerateAccessToken(id, "bob", -time.Second)
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	_, err = auth.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	auth1 := NewAuth("secret1")
	auth2 := NewAuth("secret2")
	id := uuid.New()

	token, _ := auth1.GenerateAccessToken(id, "carol", time.Hour)
	_, err := auth2.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error when validating with wrong secret")
	}
}

func TestValidateToken_Invalid(t *testing.T) {
	auth := NewAuth("supersecret")
	_, err := auth.ValidateToken("not.a.jwt")
	if err == nil {
		t.Fatal("expected error for garbage token")
	}
}

// ---- Auth middleware ----

func TestAuthMiddleware_MissingToken(t *testing.T) {
	auth := NewAuth("secret")
	handler := auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status: want %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

func TestAuthMiddleware_ValidBearerToken(t *testing.T) {
	auth := NewAuth("secret")
	id := uuid.New()
	token, _ := auth.GenerateAccessToken(id, "dave", time.Hour)

	var gotID uuid.UUID
	handler := auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID, _ = GetUserID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d", rr.Code)
	}
	if gotID != id {
		t.Errorf("user id in context: want %v, got %v", id, gotID)
	}
}

func TestAuthMiddleware_TokenViaCookie(t *testing.T) {
	auth := NewAuth("secret")
	id := uuid.New()
	token, _ := auth.GenerateAccessToken(id, "eve", time.Hour)

	var gotID uuid.UUID
	handler := auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID, _ = GetUserID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: token})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d", rr.Code)
	}
	if gotID != id {
		t.Errorf("user id in context: want %v, got %v", id, gotID)
	}
}

func TestAuthMiddleware_TokenViaQueryParam(t *testing.T) {
	auth := NewAuth("secret")
	id := uuid.New()
	token, _ := auth.GenerateAccessToken(id, "frank", time.Hour)

	var gotID uuid.UUID
	handler := auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID, _ = GetUserID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/?token="+token, nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d", rr.Code)
	}
	if gotID != id {
		t.Errorf("user id in context: want %v, got %v", id, gotID)
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	auth := NewAuth("secret")
	handler := auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer garbage.token.here")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", rr.Code)
	}
}

// ---- extractToken ----

func TestExtractToken_BearerHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer mytoken")
	if got := extractToken(req); got != "mytoken" {
		t.Errorf("want mytoken, got %q", got)
	}
}

func TestExtractToken_BearerCaseInsensitive(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "BEARER tok123")
	if got := extractToken(req); got != "tok123" {
		t.Errorf("want tok123, got %q", got)
	}
}

func TestExtractToken_Cookie(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: "cookietok"})
	if got := extractToken(req); got != "cookietok" {
		t.Errorf("want cookietok, got %q", got)
	}
}

func TestExtractToken_QueryParam(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/?token=qtok", nil)
	if got := extractToken(req); got != "qtok" {
		t.Errorf("want qtok, got %q", got)
	}
}

func TestExtractToken_None(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if got := extractToken(req); got != "" {
		t.Errorf("want empty string, got %q", got)
	}
}

// Authorization header takes priority over cookie
func TestExtractToken_HeaderTakesPriorityOverCookie(t *testing.T) {
	auth := NewAuth("secret")
	id := uuid.New()
	headerTok, _ := auth.GenerateAccessToken(id, "header", time.Hour)
	cookieTok := "cookievalue"

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+headerTok)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: cookieTok})

	got := extractToken(req)
	if got != headerTok {
		t.Errorf("header should win over cookie; want %q, got %q", headerTok, got)
	}
}

// ---- GetUserID / GetUsername helpers ----

func TestGetUserID_NotInContext(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	_, ok := GetUserID(req.Context())
	if ok {
		t.Error("expected ok=false when no user_id in context")
	}
}

func TestGetUsername_NotInContext(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	_, ok := GetUsername(req.Context())
	if ok {
		t.Error("expected ok=false when no username in context")
	}
}

// ---- CORS middleware ----

func TestCORS_AllowedOrigin(t *testing.T) {
	handler := CORS([]string{"https://example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://example.com")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Access-Control-Allow-Origin") != "https://example.com" {
		t.Errorf("ACAO header mismatch: %s", rr.Header().Get("Access-Control-Allow-Origin"))
	}
	if rr.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Error("expected ACAC: true for allowed origin")
	}
}

func TestCORS_DisallowedOrigin(t *testing.T) {
	handler := CORS([]string{"https://example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://evil.com")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Access-Control-Allow-Origin") == "https://evil.com" {
		t.Error("should not reflect disallowed origin")
	}
}

func TestCORS_Preflight(t *testing.T) {
	handler := CORS([]string{"https://example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/something", nil)
	req.Header.Set("Origin", "https://example.com")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("preflight status: want 204, got %d", rr.Code)
	}
}

func TestCORS_VaryHeader(t *testing.T) {
	handler := CORS([]string{"https://example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Vary") == "" {
		t.Error("expected Vary header to be set")
	}
}

func TestCORS_NoOriginHeader(t *testing.T) {
	handler := CORS([]string{"https://example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("non-CORS requests should pass through: got %d", rr.Code)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("no ACAO header expected when Origin is absent, got %q", got)
	}
}

// ---- RateLimiter.clientIP ----

func TestClientIP_NoProxies(t *testing.T) {
	rl := NewRateLimiter(nil, 10, 10)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "1.2.3.4:5678"
	req.Header.Set("X-Real-IP", "5.6.7.8")

	ip := rl.clientIP(req)
	if ip != "1.2.3.4" {
		t.Errorf("want 1.2.3.4 (no trusted proxies), got %s", ip)
	}
}

func TestClientIP_TrustedProxy(t *testing.T) {
	rl := NewRateLimiterWithProxies(nil, 10, 10, []string{"10.0.0.0/8"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Real-IP", "203.0.113.5")

	ip := rl.clientIP(req)
	if ip != "203.0.113.5" {
		t.Errorf("want 203.0.113.5 from trusted proxy header, got %s", ip)
	}
}

func TestClientIP_UntrustedProxy(t *testing.T) {
	rl := NewRateLimiterWithProxies(nil, 10, 10, []string{"10.0.0.0/8"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.168.1.1:1234" // not in trusted range
	req.Header.Set("X-Real-IP", "203.0.113.5")

	ip := rl.clientIP(req)
	if ip != "192.168.1.1" {
		t.Errorf("want 192.168.1.1 (untrusted proxy), got %s", ip)
	}
}

func TestClientIP_InvalidXRealIP(t *testing.T) {
	rl := NewRateLimiterWithProxies(nil, 10, 10, []string{"10.0.0.0/8"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Real-IP", "not-an-ip")

	ip := rl.clientIP(req)
	// Falls back to remote addr when X-Real-IP is unparseable
	if ip != "10.0.0.1" {
		t.Errorf("want 10.0.0.1 fallback, got %s", ip)
	}
}

// ---- Logger middleware ----

func TestLogger_PassesThrough(t *testing.T) {
	handler := Logger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusTeapot {
		t.Errorf("want 418, got %d", rr.Code)
	}
}

// ---- max helper ----

func TestMax(t *testing.T) {
	tests := []struct{ a, b, want int }{
		{1, 2, 2},
		{3, 1, 3},
		{0, 0, 0},
		{-1, 5, 5},
	}
	for _, tt := range tests {
		if got := max(tt.a, tt.b); got != tt.want {
			t.Errorf("max(%d,%d): want %d, got %d", tt.a, tt.b, tt.want, got)
		}
	}
}
