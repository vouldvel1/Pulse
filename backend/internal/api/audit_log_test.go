package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func auditLogHandlerForTest() *AuditLogHandler {
	return &AuditLogHandler{}
}

// ---- AuditLogHandler.List ----

func TestAuditLogList_NoAuth(t *testing.T) {
	h := auditLogHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/api/communities/"+uuid.New().String()+"/audit-log", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestAuditLogList_InvalidCommunityID(t *testing.T) {
	h := auditLogHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodGet, "/api/communities/bad/audit-log", nil),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}
