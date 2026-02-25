package api

import (
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
)

type AuditLogHandler struct {
	auditLog    *db.AuditLogQueries
	communities *db.CommunityQueries
}

func NewAuditLogHandler(auditLog *db.AuditLogQueries, communities *db.CommunityQueries) *AuditLogHandler {
	return &AuditLogHandler{
		auditLog:    auditLog,
		communities: communities,
	}
}

// List handles GET /api/communities/{id}/audit-log
func (h *AuditLogHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	// Check permission: PermViewAuditLog or PermAdmin
	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermViewAuditLog == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: view audit log")
		return
	}

	limit := 50
	var before *time.Time
	var actionFilter *string
	var actorFilter *uuid.UUID

	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := parsePositiveInt(l, 1, 100); err == nil {
			limit = parsed
		}
	}
	if b := r.URL.Query().Get("before"); b != "" {
		if t, err := time.Parse(time.RFC3339, b); err == nil {
			before = &t
		}
	}
	if a := r.URL.Query().Get("action"); a != "" {
		actionFilter = &a
	}
	if actor := r.URL.Query().Get("actor_id"); actor != "" {
		if id, err := uuid.Parse(actor); err == nil {
			actorFilter = &id
		}
	}

	entries, err := h.auditLog.List(r.Context(), communityID, limit, before, actionFilter, actorFilter)
	if err != nil {
		log.Printf("Error listing audit log: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if entries == nil {
		entries = []*models.AuditLogEntry{}
	}

	writeJSON(w, http.StatusOK, entries)
}

// parsePositiveInt parses a string as an int within [min, max]
func parsePositiveInt(s string, min, max int) (int, error) {
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, &parseIntError{s}
		}
		n = n*10 + int(c-'0')
	}
	if n < min {
		n = min
	}
	if n > max {
		n = max
	}
	return n, nil
}

type parseIntError struct {
	s string
}

func (e *parseIntError) Error() string {
	return "invalid integer: " + e.s
}
