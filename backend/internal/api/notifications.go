package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
	"github.com/pulse-chat/pulse/internal/ws"
)

type NotificationHandler struct {
	notifications *db.NotificationQueries
	hub           *ws.Hub
}

func NewNotificationHandler(notifications *db.NotificationQueries, hub *ws.Hub) *NotificationHandler {
	return &NotificationHandler{
		notifications: notifications,
		hub:           hub,
	}
}

// List handles GET /api/notifications
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var before *uuid.UUID
	if b := r.URL.Query().Get("before"); b != "" {
		id, err := parseUUID(b)
		if err == nil {
			before = &id
		}
	}

	unreadOnly := r.URL.Query().Get("unread") == "true"

	notifications, err := h.notifications.List(r.Context(), userID, before, limit, unreadOnly)
	if err != nil {
		log.Printf("Error listing notifications: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list notifications")
		return
	}

	if notifications == nil {
		notifications = []*models.Notification{}
	}

	writeJSON(w, http.StatusOK, notifications)
}

// GetUnreadCount handles GET /api/notifications/unread-count
func (h *NotificationHandler) GetUnreadCount(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	count, err := h.notifications.GetUnreadCount(r.Context(), userID)
	if err != nil {
		log.Printf("Error getting unread count: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to get unread count")
		return
	}

	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

// MarkRead handles PATCH /api/notifications/{id}/read
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	notifID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid notification id")
		return
	}

	if err := h.notifications.MarkRead(r.Context(), notifID, userID); err != nil {
		log.Printf("Error marking notification read: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to mark as read")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "marked as read"})
}

// MarkAllRead handles POST /api/notifications/read-all
func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	count, err := h.notifications.MarkAllRead(r.Context(), userID)
	if err != nil {
		log.Printf("Error marking all read: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to mark all as read")
		return
	}

	writeJSON(w, http.StatusOK, map[string]int64{"marked": count})
}

// Delete handles DELETE /api/notifications/{id}
func (h *NotificationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	notifID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid notification id")
		return
	}

	if err := h.notifications.Delete(r.Context(), notifID, userID); err != nil {
		log.Printf("Error deleting notification: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete notification")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// SendNotification creates a notification and pushes it via WS to the user
func (h *NotificationHandler) SendNotification(r *http.Request, userID uuid.UUID, notifType, title, body string, resourceID *uuid.UUID) {
	notif, err := h.notifications.Create(r.Context(), userID, notifType, title, body, resourceID)
	if err != nil {
		log.Printf("Error creating notification for user %s: %v", userID, err)
		return
	}

	payload, marshalErr := json.Marshal(notif)
	if marshalErr != nil {
		log.Printf("Error marshaling notification: %v", marshalErr)
		return
	}
	h.hub.SendToUser(userID, ws.WSEvent{
		Type:    ws.EventNotification,
		Payload: payload,
	})
}
