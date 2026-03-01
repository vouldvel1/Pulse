package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// ---- ChannelHandler ----

func channelHandlerForTest() *ChannelHandler {
	return &ChannelHandler{hub: newTestHub()}
}

func TestChannelCreate_NoAuth(t *testing.T) {
	h := channelHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPost, "/api/communities/"+uuid.New().String()+"/channels",
			strings.NewReader(`{"name":"general","type":"text"}`)),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestChannelCreate_InvalidCommunityID(t *testing.T) {
	h := channelHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPost, "/api/communities/bad/channels",
				strings.NewReader(`{"name":"general","type":"text"}`)),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestChannelGet_NoAuth(t *testing.T) {
	h := channelHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/api/channels/"+uuid.New().String(), nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Get(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestChannelGet_InvalidID(t *testing.T) {
	h := channelHandlerForTest()
	req := ctxWithUser(
		setPathValue(httptest.NewRequest(http.MethodGet, "/api/channels/bad", nil), "id", "bad"),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Get(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestChannelUpdate_NoAuth(t *testing.T) {
	h := channelHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPatch, "/api/channels/"+uuid.New().String(),
			strings.NewReader(`{"name":"new"}`)),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Update(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestChannelDelete_NoAuth(t *testing.T) {
	h := channelHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodDelete, "/api/channels/"+uuid.New().String(), nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestChannelList_NoAuth(t *testing.T) {
	h := channelHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/api/communities/"+uuid.New().String()+"/channels", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

// ---- InviteHandler ----

func inviteHandlerForTest() *InviteHandler {
	return &InviteHandler{}
}

func TestInviteCreate_NoAuth(t *testing.T) {
	h := inviteHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPost, "/api/communities/"+uuid.New().String()+"/invites", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestInviteCreate_InvalidCommunityID(t *testing.T) {
	h := inviteHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPost, "/api/communities/bad/invites", nil),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestInviteList_NoAuth(t *testing.T) {
	h := inviteHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/api/communities/"+uuid.New().String()+"/invites", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestInviteDelete_NoAuth(t *testing.T) {
	h := inviteHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodDelete, "/api/invites/"+uuid.New().String(), nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestInviteDelete_InvalidID(t *testing.T) {
	h := inviteHandlerForTest()
	req := ctxWithUser(
		setPathValue(httptest.NewRequest(http.MethodDelete, "/api/invites/bad", nil), "id", "bad"),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestInviteGetByCode_EmptyCode(t *testing.T) {
	h := inviteHandlerForTest()
	// PathValue "code" is empty string (not set)
	req := httptest.NewRequest(http.MethodGet, "/api/invites/", nil)
	rr := httptest.NewRecorder()
	h.GetByCode(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- RoleHandler ----

func roleHandlerForTest() *RoleHandler {
	return &RoleHandler{hub: newTestHub()}
}

func TestRoleCreate_NoAuth(t *testing.T) {
	h := roleHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPost, "/api/communities/"+uuid.New().String()+"/roles",
			strings.NewReader(`{"name":"mod"}`)),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestRoleCreate_InvalidCommunityID(t *testing.T) {
	h := roleHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPost, "/api/communities/bad/roles",
				strings.NewReader(`{"name":"mod"}`)),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestRoleList_NoAuth(t *testing.T) {
	h := roleHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/api/communities/"+uuid.New().String()+"/roles", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.List(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestRoleUpdate_NoAuth(t *testing.T) {
	h := roleHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPatch, "/api/roles/"+uuid.New().String(),
			strings.NewReader(`{"name":"new"}`)),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Update(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestRoleDelete_NoAuth(t *testing.T) {
	h := roleHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodDelete, "/api/roles/"+uuid.New().String(), nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.Delete(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestRoleAssign_NoAuth(t *testing.T) {
	h := roleHandlerForTest()
	req := setPathValues(
		httptest.NewRequest(http.MethodPut, "/", nil),
		map[string]string{
			"id":     uuid.New().String(),
			"userId": uuid.New().String(),
			"roleId": uuid.New().String(),
		},
	)
	rr := httptest.NewRecorder()
	h.AssignRole(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestRoleRemove_NoAuth(t *testing.T) {
	h := roleHandlerForTest()
	req := setPathValues(
		httptest.NewRequest(http.MethodDelete, "/", nil),
		map[string]string{
			"id":     uuid.New().String(),
			"userId": uuid.New().String(),
			"roleId": uuid.New().String(),
		},
	)
	rr := httptest.NewRecorder()
	h.RemoveRole(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestRoleGetMemberRoles_NoAuth(t *testing.T) {
	h := roleHandlerForTest()
	req := setPathValues(
		httptest.NewRequest(http.MethodGet, "/", nil),
		map[string]string{
			"id":     uuid.New().String(),
			"userId": uuid.New().String(),
		},
	)
	rr := httptest.NewRecorder()
	h.GetMemberRoles(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}
