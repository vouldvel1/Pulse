package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func searchHandlerForTest() *SearchHandler {
	return &SearchHandler{}
}

// ---- SearchHandler.Search ----

func TestSearch_NoAuth(t *testing.T) {
	h := searchHandlerForTest()
	req := httptest.NewRequest(http.MethodGet, "/api/search?q=hello", nil)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestSearch_EmptyQuery(t *testing.T) {
	h := searchHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/search?q=", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestSearch_QueryTooShort(t *testing.T) {
	h := searchHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/search?q=a", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestSearch_QueryTooLong(t *testing.T) {
	h := searchHandlerForTest()
	longQ := make([]byte, 201)
	for i := range longQ {
		longQ[i] = 'a'
	}
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/search?q="+string(longQ), nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestSearch_InvalidCommunityID(t *testing.T) {
	h := searchHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/search?q=hello&community_id=not-uuid", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestSearch_InvalidChannelID(t *testing.T) {
	h := searchHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/search?q=hello&channel_id=not-uuid", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}
