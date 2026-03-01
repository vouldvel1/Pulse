package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func notificationHandlerForTest() *NotificationHandler {
	return &NotificationHandler{hub: newTestHub()}
}

// ---- NotificationHandler.List ----

func TestNotificationList_NoAuth(t *testing.T) {
	h := notificationHandlerForTest()
	req := httptest.NewRequest(http.MethodGet, "/api/notifications", nil)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

// ---- NotificationHandler.GetUnreadCount ----

func TestNotificationGetUnreadCount_NoAuth(t *testing.T) {
	h := notificationHandlerForTest()
	req := httptest.NewRequest(http.MethodGet, "/api/notifications/unread-count", nil)
	rr := httptest.NewRecorder()
	h.GetUnreadCount(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

// ---- NotificationHandler.MarkRead ----

func TestNotificationMarkRead_NoAuth(t *testing.T) {
	h := notificationHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPatch, "/api/notifications/"+uuid.New().String()+"/read", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.MarkRead(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestNotificationMarkRead_InvalidID(t *testing.T) {
	h := notificationHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPatch, "/api/notifications/bad/read", nil),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.MarkRead(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- NotificationHandler.MarkAllRead ----

func TestNotificationMarkAllRead_NoAuth(t *testing.T) {
	h := notificationHandlerForTest()
	req := httptest.NewRequest(http.MethodPost, "/api/notifications/read-all", nil)
	rr := httptest.NewRecorder()
	h.MarkAllRead(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

// ---- NotificationHandler.Delete ----

func TestNotificationDelete_NoAuth(t *testing.T) {
	h := notificationHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodDelete, "/api/notifications/"+uuid.New().String(), nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestNotificationDelete_InvalidID(t *testing.T) {
	h := notificationHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodDelete, "/api/notifications/bad", nil),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}
