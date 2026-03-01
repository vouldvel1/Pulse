package middleware

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/cache"
)

type contextKey string

const (
	UserIDKey   contextKey = "user_id"
	UsernameKey contextKey = "username"
)

// Claims represents JWT claims
type Claims struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
	jwt.RegisteredClaims
}

// Auth middleware validates JWT tokens
type Auth struct {
	jwtSecret []byte
}

func NewAuth(jwtSecret string) *Auth {
	return &Auth{jwtSecret: []byte(jwtSecret)}
}

// GenerateAccessToken creates a new JWT access token
func (a *Auth) GenerateAccessToken(userID uuid.UUID, username string, expiry time.Duration) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "pulse",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.jwtSecret)
}

// ValidateToken validates a JWT token and returns claims
func (a *Auth) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return a.jwtSecret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}

// Middleware returns an HTTP middleware that validates JWT tokens
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := extractToken(r)
		if tokenString == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing authorization token"})
			return
		}

		claims, err := a.ValidateToken(tokenString)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid or expired token"})
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
		ctx = context.WithValue(ctx, UsernameKey, claims.Username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// extractToken extracts the Bearer token from Authorization header or cookie
func extractToken(r *http.Request) string {
	// Check Authorization header first
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			return parts[1]
		}
	}

	// Fallback to cookie
	cookie, err := r.Cookie("access_token")
	if err == nil {
		return cookie.Value
	}

	// Check query param for WebSocket connections
	return r.URL.Query().Get("token")
}

// GetUserID extracts user ID from context
func GetUserID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(UserIDKey).(uuid.UUID)
	return id, ok
}

// GetUsername extracts username from context
func GetUsername(ctx context.Context) (string, bool) {
	name, ok := ctx.Value(UsernameKey).(string)
	return name, ok
}

// RateLimiter middleware using Redis sliding window.
// trustedProxies is the set of CIDR subnets whose X-Real-IP / X-Forwarded-For
// headers should be trusted. When empty, only r.RemoteAddr is used.
type RateLimiter struct {
	cache          *cache.Store
	rps            int
	burst          int
	window         time.Duration
	trustedProxies []*net.IPNet
}

func NewRateLimiter(cache *cache.Store, rps, burst int) *RateLimiter {
	return &RateLimiter{
		cache:  cache,
		rps:    rps,
		burst:  burst,
		window: time.Second / time.Duration(max(rps, 1)),
	}
}

// NewRateLimiterWithProxies creates a RateLimiter that trusts X-Real-IP from
// the given proxy subnets (e.g. "10.0.0.0/8", "172.16.0.0/12").
func NewRateLimiterWithProxies(cache *cache.Store, rps, burst int, trustedCIDRs []string) *RateLimiter {
	rl := NewRateLimiter(cache, rps, burst)
	for _, cidr := range trustedCIDRs {
		_, ipNet, err := net.ParseCIDR(cidr)
		if err == nil {
			rl.trustedProxies = append(rl.trustedProxies, ipNet)
		}
	}
	return rl
}

// clientIP returns the real client IP, only trusting proxy headers when the
// direct peer address is within a trusted proxy subnet.
func (rl *RateLimiter) clientIP(r *http.Request) string {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteHost = r.RemoteAddr
	}

	if len(rl.trustedProxies) > 0 {
		remoteIP := net.ParseIP(remoteHost)
		for _, subnet := range rl.trustedProxies {
			if remoteIP != nil && subnet.Contains(remoteIP) {
				if forwarded := r.Header.Get("X-Real-IP"); forwarded != "" {
					if ip := net.ParseIP(strings.TrimSpace(forwarded)); ip != nil {
						return ip.String()
					}
				}
				break
			}
		}
	}

	return remoteHost
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := rl.clientIP(r)
		key := fmt.Sprintf("ratelimit:%s", ip)
		// Use the configured window (derived from rps) so the actual refill
		// rate matches the intended requests-per-second.
		limited, err := rl.cache.RateLimit(r.Context(), key, rl.burst, rl.window)
		if err != nil {
			// On Redis error, allow the request through
			next.ServeHTTP(w, r)
			return
		}

		if limited {
			w.Header().Set("Retry-After", "1")
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// CORS middleware reflects the request Origin (instead of using a wildcard)
// so that credentials can be included while remaining browser-safe.
// C1 fix: Access-Control-Allow-Credentials: true requires a specific origin,
// not the wildcard "*". Reflect the request origin from an allowlist.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && allowed[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Requested-With")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.Header().Add("Vary", "Origin")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Logger middleware logs HTTP requests
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		fmt.Printf("[%s] %s %s %d %s\n",
			time.Now().Format(time.RFC3339),
			r.Method,
			r.URL.Path,
			wrapped.statusCode,
			time.Since(start),
		)
	})
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Hijack implements http.Hijacker so that WebSocket upgrades work through
// the Logger middleware. Without this, the gorilla/websocket upgrader fails
// with "response does not implement http.Hijacker".
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := rw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("underlying ResponseWriter does not implement http.Hijacker")
	}
	return h.Hijack()
}

// Flush implements http.Flusher for streaming responses.
func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// writeJSON is intentionally duplicated from api/helpers.go.
// L1: the middleware and api packages cannot share a helper without creating a
// circular import (api imports middleware for auth). Extracting to a third
// shared package (e.g. httputil) is the correct long-term fix.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		fmt.Printf("Error encoding JSON response: %v\n", err)
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
