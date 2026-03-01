package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func dmHandlerForTest() *DMHandler {
	return &DMHandler{hub: newTestHub()}
}

// ---- DMHandler.CreateDM ----

func TestCreateDM_NoAuth(t *testing.T) {
	h := dmHandlerForTest()
	req := httptest.NewRequest(http.MethodPost, "/api/dm/channels",
		strings.NewReader(`{"recipient_id":"`+uuid.New().String()+`"}`))
	rr := httptest.NewRecorder()
	h.CreateDM(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestCreateDM_InvalidJSON(t *testing.T) {
	h := dmHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels", strings.NewReader("bad")),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.CreateDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCreateDM_InvalidRecipientID(t *testing.T) {
	h := dmHandlerForTest()
	body := `{"recipient_id":"not-a-uuid"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.CreateDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCreateDM_MissingRecipient(t *testing.T) {
	// Neither recipient_id nor recipient_username provided
	h := dmHandlerForTest()
	body := `{"recipient_id":"","recipient_username":""}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.CreateDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCreateDM_SelfDM(t *testing.T) {
	h := dmHandlerForTest()
	selfID := uuid.New()
	body := `{"recipient_id":"` + selfID.String() + `"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels", strings.NewReader(body)),
		selfID,
	)
	rr := httptest.NewRecorder()
	h.CreateDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- DMHandler.CreateGroupDM ----

func TestCreateGroupDM_NoAuth(t *testing.T) {
	h := dmHandlerForTest()
	req := httptest.NewRequest(http.MethodPost, "/api/dm/channels/group",
		strings.NewReader(`{"name":"group","member_ids":["`+uuid.New().String()+`"]}`))
	rr := httptest.NewRecorder()
	h.CreateGroupDM(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestCreateGroupDM_EmptyName(t *testing.T) {
	h := dmHandlerForTest()
	body := `{"name":"","member_ids":["` + uuid.New().String() + `"]}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels/group", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.CreateGroupDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCreateGroupDM_NoMembers(t *testing.T) {
	h := dmHandlerForTest()
	body := `{"name":"mygroup","member_ids":[]}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels/group", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.CreateGroupDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCreateGroupDM_TooManyMembers(t *testing.T) {
	h := dmHandlerForTest()
	ids := make([]string, 10)
	for i := range ids {
		ids[i] = `"` + uuid.New().String() + `"`
	}
	body := `{"name":"mygroup","member_ids":[` + strings.Join(ids, ",") + `]}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels/group", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.CreateGroupDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestCreateGroupDM_InvalidMemberID(t *testing.T) {
	h := dmHandlerForTest()
	body := `{"name":"mygroup","member_ids":["not-a-uuid"]}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels/group", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.CreateGroupDM(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- DMHandler.ListDMChannels ----

func TestListDMChannels_NoAuth(t *testing.T) {
	h := dmHandlerForTest()
	req := httptest.NewRequest(http.MethodGet, "/api/dm/channels", nil)
	rr := httptest.NewRecorder()
	h.ListDMChannels(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

// ---- DMHandler.GetDMChannel ----

func TestGetDMChannel_NoAuth(t *testing.T) {
	h := dmHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/api/dm/channels/"+uuid.New().String(), nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.GetDMChannel(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestGetDMChannel_InvalidID(t *testing.T) {
	h := dmHandlerForTest()
	req := ctxWithUser(
		setPathValue(httptest.NewRequest(http.MethodGet, "/api/dm/channels/bad", nil), "id", "bad"),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.GetDMChannel(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- DMHandler.SendMessage ----

func TestDMSendMessage_NoAuth(t *testing.T) {
	h := dmHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodPost, "/api/dm/channels/"+uuid.New().String()+"/messages",
			strings.NewReader(`{"content":"hi"}`)),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.SendMessage(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestDMSendMessage_InvalidChannelID(t *testing.T) {
	h := dmHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodPost, "/api/dm/channels/bad/messages",
				strings.NewReader(`{"content":"hi"}`)),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.SendMessage(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- DMHandler.ListMessages ----

func TestDMListMessages_NoAuth(t *testing.T) {
	h := dmHandlerForTest()
	req := setPathValue(
		httptest.NewRequest(http.MethodGet, "/api/dm/channels/"+uuid.New().String()+"/messages", nil),
		"id", uuid.New().String(),
	)
	rr := httptest.NewRecorder()
	h.ListMessages(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestDMListMessages_InvalidChannelID(t *testing.T) {
	h := dmHandlerForTest()
	req := ctxWithUser(
		setPathValue(
			httptest.NewRequest(http.MethodGet, "/api/dm/channels/bad/messages", nil),
			"id", "bad",
		),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.ListMessages(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}
