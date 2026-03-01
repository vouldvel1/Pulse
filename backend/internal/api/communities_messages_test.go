package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/ws"
)

// newTestHub creates a Hub whose broadcast channel is large enough that
// BroadcastToChannel never blocks during tests (no goroutine reads it).
func newTestHub() *ws.Hub {
	return ws.NewHub(nil, nil)
}

// communityHandlerForTest returns a CommunityHandler with nil db deps.
// Only validation paths that short-circuit before any DB call are tested here.
func communityHandlerForTest() *CommunityHandler {
	return &CommunityHandler{hub: newTestHub()}
}

// ctxWithUser injects a user_id uuid into the request context.
func ctxWithUser(r *http.Request, id uuid.UUID) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.UserIDKey, id)
	return r.WithContext(ctx)
}

// ---- CommunityHandler.Create ----

func TestCommunityCreate_NoAuth(t *testing.T) {
	h := communityHandlerForTest()
	req := httptest.NewRequest(http.MethodPost, "/api/communities", strings.NewReader(`{"name":"test"}`))
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestCommunityCreate_InvalidJSON(t *testing.T) {
	h := communityHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/communities", strings.NewReader("bad")),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCommunityCreate_EmptyName(t *testing.T) {
	h := communityHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/communities", strings.NewReader(`{"name":""}`)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_NAME")
}

func TestCommunityCreate_NameTooLong(t *testing.T) {
	h := communityHandlerForTest()
	longName := strings.Repeat("a", 101)
	body, _ := json.Marshal(map[string]string{"name": longName})
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/communities", strings.NewReader(string(body))),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_NAME")
}

func TestCommunityCreate_InvalidVisibility(t *testing.T) {
	h := communityHandlerForTest()
	body := `{"name":"test","visibility":"secret"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/communities", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCommunityCreate_ValidVisibility_Public(t *testing.T) {
	// Should pass visibility check and then fail at DB (db is nil → panic).
	h := communityHandlerForTest()
	body := `{"name":"testcommunity","visibility":"public"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/communities", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	panicked := safeCall(func() { h.Create(rr, req) })
	if !panicked && rr.Code == http.StatusBadRequest {
		t.Errorf("visibility='public' should not produce a 400, got: %s", rr.Body.String())
	}
}

// ---- CommunityHandler.Get ----

func TestCommunityGet_NoAuth(t *testing.T) {
	h := communityHandlerForTest()
	req := httptest.NewRequest(http.MethodGet, "/api/communities/"+uuid.New().String(), nil)
	rr := httptest.NewRecorder()
	h.Get(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestCommunityGet_InvalidID(t *testing.T) {
	h := communityHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/communities/not-a-uuid", nil),
		uuid.New(),
	)
	// PathValue won't be set via httptest path; simulate by using a mux or
	// directly setting the path value pattern. Since we are not using a real mux
	// here, we set it manually via a wrapper.
	req = setPathValue(req, "id", "not-a-uuid")
	rr := httptest.NewRecorder()
	h.Get(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- CommunityHandler.Leave ----

func TestCommunityLeave_NoAuth(t *testing.T) {
	h := communityHandlerForTest()
	req := httptest.NewRequest(http.MethodDelete, "/api/communities/"+uuid.New().String()+"/members/me", nil)
	rr := httptest.NewRecorder()
	h.Leave(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

// ---- CommunityHandler.Search ----

func TestCommunitySearch_EmptyQuery(t *testing.T) {
	h := communityHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/communities/search?q=", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusOK)
	// Should return empty array
	var results interface{}
	if err := json.NewDecoder(rr.Body).Decode(&results); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

// ---- MessageHandler ----

func messageHandlerForTest() *MessageHandler {
	return &MessageHandler{hub: newTestHub()}
}

func TestMessageSend_NoAuth(t *testing.T) {
	h := messageHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPost, "/api/channels/"+uuid.New().String()+"/messages", strings.NewReader(`{"content":"hi"}`)),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Send(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestMessageEdit_NoAuth(t *testing.T) {
	h := messageHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"content":"edit"}`)),
		"messageId", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Edit(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestMessageEdit_InvalidMessageID(t *testing.T) {
	h := messageHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"content":"edit"}`)),
			"messageId", "not-a-uuid",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Edit(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestMessageEdit_EmptyContent(t *testing.T) {
	h := messageHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"content":""}`)),
			"messageId", uuid.New().String(),
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Edit(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_CONTENT")
}

func TestMessageEdit_ContentTooLong(t *testing.T) {
	h := messageHandlerForTest()
	longContent := strings.Repeat("a", 4001)
	body, _ := json.Marshal(map[string]string{"content": longContent})
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(string(body))),
			"messageId", uuid.New().String(),
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Edit(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_CONTENT")
}

func TestMessageDelete_NoAuth(t *testing.T) {
	h := messageHandlerForTest()
	req := setPathValues(
		httptest.NewRequest(http.MethodDelete, "/", nil),
		map[string]string{
			"channelId": uuid.New().String(),
			"messageId": uuid.New().String(),
		},
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestMessageDelete_InvalidChannelID(t *testing.T) {
	h := messageHandlerForTest()
	req := ctxWithUser(
		setPathValues(
			httptest.NewRequest(http.MethodDelete, "/", nil),
			map[string]string{
				"channelId": "bad",
				"messageId": uuid.New().String(),
			},
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestMessageDelete_InvalidMessageID(t *testing.T) {
	h := messageHandlerForTest()
	req := ctxWithUser(
		setPathValues(
			httptest.NewRequest(http.MethodDelete, "/", nil),
			map[string]string{
				"channelId": uuid.New().String(),
				"messageId": "bad",
			},
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestMessageList_NoAuth(t *testing.T) {
	h := messageHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestMessageList_InvalidChannelID(t *testing.T) {
	h := messageHandlerForTest()
	req := ctxWithUser(
		setPathValue(httptest.NewRequest(http.MethodGet, "/", nil), "id", "not-uuid"),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- AddReaction / RemoveReaction validation ----

func TestAddReaction_NoAuth(t *testing.T) {
	h := messageHandlerForTest()
	req := setPathValues(httptest.NewRequest(http.MethodPut, "/", nil), map[string]string{
		"channelId": uuid.New().String(),
		"messageId": uuid.New().String(),
		"emoji":     "👍",
	})
	rr := httptest.NewRecorder()
	h.AddReaction(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestAddReaction_EmptyEmoji(t *testing.T) {
	h := messageHandlerForTest()
	req := ctxWithUser(
		setPathValues(httptest.NewRequest(http.MethodPut, "/", nil), map[string]string{
			"channelId": uuid.New().String(),
			"messageId": uuid.New().String(),
			"emoji":     "",
		}),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.AddReaction(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestRemoveReaction_EmptyEmoji(t *testing.T) {
	h := messageHandlerForTest()
	req := ctxWithUser(
		setPathValues(httptest.NewRequest(http.MethodDelete, "/", nil), map[string]string{
			"channelId": uuid.New().String(),
			"messageId": uuid.New().String(),
			"emoji":     "",
		}),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.RemoveReaction(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- setPathValue helpers ----
// net/http's PathValue is only populated by the router; for unit tests we
// use a small helper that writes into the request's context via httptest.

func setPathValue(r *http.Request, key, value string) *http.Request {
	return setPathValues(r, map[string]string{key: value})
}

func setPathValues(r *http.Request, kv map[string]string) *http.Request {
	// Use http.SetPathValue introduced in Go 1.22
	for k, v := range kv {
		r.SetPathValue(k, v)
	}
	return r
}
