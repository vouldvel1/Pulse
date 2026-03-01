package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
)

// authHandlerForTest constructs an AuthHandler with no DB or cache dependencies
// (they are nil). Tests in this file only exercise validation paths that return
// before any DB call is made.
func authHandlerForTest(t *testing.T) *AuthHandler {
	t.Helper()
	auth := middleware.NewAuth("testsecret")
	return &AuthHandler{
		auth:       auth,
		bcryptCost: 4, // fast for tests
		accessExp:  15 * time.Minute,
		refreshExp: 7 * 24 * time.Hour,
	}
}

// ---- Register validation ----

func TestRegister_InvalidJSON(t *testing.T) {
	h := authHandlerForTest(t)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader("not-json"))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestRegister_InvalidEmail(t *testing.T) {
	h := authHandlerForTest(t)
	body := `{"email":"not-an-email","username":"alice","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_EMAIL")
}

func TestRegister_InvalidUsername_TooShort(t *testing.T) {
	h := authHandlerForTest(t)
	body := `{"email":"alice@example.com","username":"ab","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_USERNAME")
}

func TestRegister_InvalidUsername_SpecialChars(t *testing.T) {
	h := authHandlerForTest(t)
	body := `{"email":"alice@example.com","username":"ali ce","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_USERNAME")
}

func TestRegister_DisplayNameTooLong(t *testing.T) {
	h := authHandlerForTest(t)
	longName := strings.Repeat("a", 65)
	body, _ := json.Marshal(RegisterRequest{
		Email:       "alice@example.com",
		Username:    "alice",
		DisplayName: longName,
		Password:    "password123",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_DISPLAY_NAME")
}

func TestRegister_PasswordTooShort(t *testing.T) {
	h := authHandlerForTest(t)
	body := `{"email":"alice@example.com","username":"alice","password":"short"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_PASSWORD")
}

func TestRegister_PasswordTooLong(t *testing.T) {
	h := authHandlerForTest(t)
	longPass := strings.Repeat("a", 129)
	body, _ := json.Marshal(map[string]string{
		"email":    "alice@example.com",
		"username": "alice",
		"password": longPass,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_PASSWORD")
}

func TestRegister_PasswordExactlyMinLength(t *testing.T) {
	// 8 chars exactly — passes validation and then hits the nil DB (panics).
	// We verify that no INVALID_PASSWORD error was written before reaching the DB.
	h := authHandlerForTest(t)
	body := `{"email":"alice@example.com","username":"alice","password":"12345678"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	rr := httptest.NewRecorder()
	panicked := safeCall(func() { h.Register(rr, req) })
	// Either panicked (reached nil DB) or returned non-validation error — neither is INVALID_PASSWORD.
	if !panicked {
		assertNotErrorCode(t, rr, "INVALID_PASSWORD")
	}
}

func TestRegister_PasswordExactlyMaxLength(t *testing.T) {
	h := authHandlerForTest(t)
	maxPass := strings.Repeat("a", 128)
	body, _ := json.Marshal(map[string]string{
		"email":    "alice@example.com",
		"username": "alice",
		"password": maxPass,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	panicked := safeCall(func() { h.Register(rr, req) })
	if !panicked {
		assertNotErrorCode(t, rr, "INVALID_PASSWORD")
	}
}

func TestRegister_EmailNormalized(t *testing.T) {
	// Validation passes for uppercase email (normalized to lowercase)
	h := authHandlerForTest(t)
	body := `{"email":"ALICE@EXAMPLE.COM","username":"alice","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	rr := httptest.NewRecorder()
	panicked := safeCall(func() { h.Register(rr, req) })
	// Should not get INVALID_EMAIL (normalization happens before regex check)
	if !panicked {
		assertNotErrorCode(t, rr, "INVALID_EMAIL")
	}
}

func TestRegister_UnknownFieldsRejected(t *testing.T) {
	h := authHandlerForTest(t)
	body := `{"email":"alice@example.com","username":"alice","password":"password123","extra":"field"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Register(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- Login validation ----

func TestLogin_InvalidJSON(t *testing.T) {
	h := authHandlerForTest(t)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader("bad"))
	rr := httptest.NewRecorder()
	h.Login(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestLogin_MissingEmail(t *testing.T) {
	h := authHandlerForTest(t)
	body := `{"email":"","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Login(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestLogin_MissingPassword(t *testing.T) {
	h := authHandlerForTest(t)
	body := `{"email":"alice@example.com","password":""}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Login(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- Logout ----

func TestLogout_ClearsCookies(t *testing.T) {
	h := authHandlerForTest(t)
	// Logout with no body (empty / nil db is fine as it checks db only if refresh token present)
	body := `{}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", strings.NewReader(body))
	rr := httptest.NewRecorder()
	h.Logout(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("want 200, got %d", rr.Code)
	}

	cookies := rr.Result().Cookies()
	var accessCleared, refreshCleared bool
	for _, c := range cookies {
		if c.Name == "access_token" && c.MaxAge == -1 {
			accessCleared = true
		}
		if c.Name == "refresh_token" && c.MaxAge == -1 {
			refreshCleared = true
		}
	}
	if !accessCleared {
		t.Error("access_token cookie should be cleared")
	}
	if !refreshCleared {
		t.Error("refresh_token cookie should be cleared")
	}
}

// ---- Me ----

func TestMe_Unauthorized_NoContext(t *testing.T) {
	h := authHandlerForTest(t)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rr := httptest.NewRecorder()
	h.Me(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestMe_WithUserIDInContext_HitsDB(t *testing.T) {
	h := authHandlerForTest(t)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)

	// Inject user_id into context (simulating passed auth middleware)
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, uuid.New())
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	panicked := safeCall(func() { h.Me(rr, req) }) // db is nil → panics, but NOT 401
	if !panicked && rr.Code == http.StatusUnauthorized {
		t.Error("should not get 401 when user_id is in context")
	}
}

// ---- hashToken ----

func TestHashToken_Deterministic(t *testing.T) {
	h1 := hashToken("mytoken")
	h2 := hashToken("mytoken")
	if h1 != h2 {
		t.Errorf("hashToken should be deterministic: %q != %q", h1, h2)
	}
}

func TestHashToken_DifferentInputs(t *testing.T) {
	h1 := hashToken("token1")
	h2 := hashToken("token2")
	if h1 == h2 {
		t.Error("different tokens should produce different hashes")
	}
}

func TestHashToken_IsHex(t *testing.T) {
	h := hashToken("anytoken")
	for _, c := range h {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("hash should be lowercase hex, got char %q in %q", string(c), h)
		}
	}
}

func TestHashToken_Length(t *testing.T) {
	// SHA-256 = 32 bytes = 64 hex chars
	h := hashToken("test")
	if len(h) != 64 {
		t.Errorf("expected 64-char hex hash, got %d chars: %q", len(h), h)
	}
}

// ---- setAuthCookies ----

func TestSetAuthCookies_SetsExpectedCookies(t *testing.T) {
	h := authHandlerForTest(t)
	rr := httptest.NewRecorder()
	h.setAuthCookies(rr, "access-tok", "refresh-tok")

	cookies := rr.Result().Cookies()
	var accessFound, refreshFound bool
	for _, c := range cookies {
		if c.Name == "access_token" {
			if c.Value != "access-tok" {
				t.Errorf("access_token value: want 'access-tok', got %q", c.Value)
			}
			if !c.HttpOnly {
				t.Error("access_token should be HttpOnly")
			}
			accessFound = true
		}
		if c.Name == "refresh_token" {
			if c.Value != "refresh-tok" {
				t.Errorf("refresh_token value: want 'refresh-tok', got %q", c.Value)
			}
			if !c.HttpOnly {
				t.Error("refresh_token should be HttpOnly")
			}
			refreshFound = true
		}
	}
	if !accessFound {
		t.Error("access_token cookie not set")
	}
	if !refreshFound {
		t.Error("refresh_token cookie not set")
	}
}

// ---- emailRegex / usernameRegex ----

func TestEmailRegex(t *testing.T) {
	valid := []string{
		"user@example.com",
		"user+tag@sub.domain.org",
		"user.name@domain.co",
		"a@b.io",
	}
	invalid := []string{
		"notanemail",
		"@domain.com",
		"user@",
		"user@domain",
		"",
	}
	for _, e := range valid {
		if !emailRegex.MatchString(e) {
			t.Errorf("emailRegex should match %q", e)
		}
	}
	for _, e := range invalid {
		if emailRegex.MatchString(e) {
			t.Errorf("emailRegex should NOT match %q", e)
		}
	}
}

func TestUsernameRegex(t *testing.T) {
	valid := []string{
		"alice",
		"alice123",
		"alice_bob",
		"ABC",
		strings.Repeat("a", 32), // exactly 32
	}
	invalid := []string{
		"ab",                    // too short
		strings.Repeat("a", 33), // too long
		"alice bob",             // space
		"alice-bob",             // hyphen
		"alice@bob",             // at sign
		"",
	}
	for _, u := range valid {
		if !usernameRegex.MatchString(u) {
			t.Errorf("usernameRegex should match %q", u)
		}
	}
	for _, u := range invalid {
		if usernameRegex.MatchString(u) {
			t.Errorf("usernameRegex should NOT match %q", u)
		}
	}
}

// ---- AuthResponse JSON shape ----

func TestAuthResponse_JSON(t *testing.T) {
	user := &models.User{ID: uuid.New(), Username: "alice"}
	resp := AuthResponse{
		AccessToken:  "access",
		RefreshToken: "refresh",
		ExpiresIn:    900,
		User:         user,
	}
	b, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(b, &m)
	if m["access_token"] != "access" {
		t.Errorf("access_token: %v", m["access_token"])
	}
	if m["expires_in"] != float64(900) {
		t.Errorf("expires_in: %v", m["expires_in"])
	}
}

// ---- test helpers ----

// safeCall invokes fn and recovers from any panic, returning true if a panic
// occurred. This lets boundary tests verify that validation passes (no error
// returned before reaching DB) without crashing when the nil DB panics.
func safeCall(fn func()) (panicked bool) {
	defer func() {
		if r := recover(); r != nil {
			panicked = true
		}
	}()
	fn()
	return false
}

func assertStatus(t *testing.T, rr *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rr.Code != want {
		t.Errorf("status: want %d, got %d (body: %s)", want, rr.Code, rr.Body.String())
	}
}

func assertErrorCode(t *testing.T, rr *httptest.ResponseRecorder, code string) {
	t.Helper()
	var resp ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if resp.Code != code {
		t.Errorf("error code: want %q, got %q (error: %q)", code, resp.Code, resp.Error)
	}
}

func assertNotErrorCode(t *testing.T, rr *httptest.ResponseRecorder, code string) {
	t.Helper()
	// Peek at body without consuming rr.Body (it may need to be read again)
	bodyBytes := rr.Body.Bytes()
	var resp ErrorResponse
	if err := json.Unmarshal(bodyBytes, &resp); err != nil {
		return // Not a JSON error response — that's fine
	}
	if resp.Code == code {
		t.Errorf("should NOT have error code %q but got it (status %d)", code, rr.Code)
	}
}
