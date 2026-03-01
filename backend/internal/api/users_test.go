package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func userHandlerForTest() *UserHandler {
	return &UserHandler{bcryptCost: 4}
}

// ---- UserHandler.Search ----

func TestUserSearch_NoAuth(t *testing.T) {
	h := userHandlerForTest()
	req := httptest.NewRequest(http.MethodGet, "/api/users/search?q=alice", nil)
	rr := httptest.NewRecorder()
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestUserSearch_EmptyQuery_ReturnsOK(t *testing.T) {
	h := userHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/users/search?q=", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	// Empty query short-circuits before DB call — returns 200 []
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusOK)
}

func TestUserSearch_AtSignOnly_ReturnsOK(t *testing.T) {
	h := userHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodGet, "/api/users/search?q=@", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	// "@" stripped → empty query → returns 200 []
	h.Search(rr, req)
	assertStatus(t, rr, http.StatusOK)
}

// ---- UserHandler.UpdateProfile ----

func TestUpdateProfile_NoAuth(t *testing.T) {
	h := userHandlerForTest()
	req := httptest.NewRequest(http.MethodPatch, "/api/users/me", strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestUpdateProfile_InvalidJSON(t *testing.T) {
	h := userHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPatch, "/api/users/me", strings.NewReader("{bad")),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestUpdateProfile_InvalidUsername(t *testing.T) {
	h := userHandlerForTest()
	body := `{"username":"ab"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPatch, "/api/users/me", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_USERNAME")
}

func TestUpdateProfile_InvalidEmail(t *testing.T) {
	h := userHandlerForTest()
	body := `{"email":"notanemail"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPatch, "/api/users/me", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_EMAIL")
}

// ---- UserHandler.ChangePassword ----

func TestChangePassword_NoAuth(t *testing.T) {
	h := userHandlerForTest()
	req := httptest.NewRequest(http.MethodPut, "/api/users/me/password",
		strings.NewReader(`{"current_password":"old","new_password":"newpass123"}`))
	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestChangePassword_InvalidJSON(t *testing.T) {
	h := userHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPut, "/api/users/me/password", strings.NewReader("bad")),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestChangePassword_MissingCurrentPassword(t *testing.T) {
	h := userHandlerForTest()
	body := `{"current_password":"","new_password":"newpass123"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPut, "/api/users/me/password", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestChangePassword_MissingNewPassword(t *testing.T) {
	h := userHandlerForTest()
	body := `{"current_password":"old","new_password":""}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPut, "/api/users/me/password", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestChangePassword_NewPasswordTooShort(t *testing.T) {
	h := userHandlerForTest()
	body := `{"current_password":"oldpass","new_password":"short"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPut, "/api/users/me/password", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_PASSWORD")
}

func TestChangePassword_NewPasswordTooLong(t *testing.T) {
	h := userHandlerForTest()
	longPass := strings.Repeat("a", 129)
	body := `{"current_password":"oldpass","new_password":"` + longPass + `"}`
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPut, "/api/users/me/password", strings.NewReader(body)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
	assertErrorCode(t, rr, "INVALID_PASSWORD")
}

// ---- UserHandler.DeleteAccount ----

func TestDeleteAccount_NoAuth(t *testing.T) {
	h := userHandlerForTest()
	req := httptest.NewRequest(http.MethodDelete, "/api/users/me",
		strings.NewReader(`{"password":"mypassword"}`))
	rr := httptest.NewRecorder()
	h.DeleteAccount(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestDeleteAccount_InvalidJSON(t *testing.T) {
	h := userHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodDelete, "/api/users/me", strings.NewReader("bad")),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.DeleteAccount(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestDeleteAccount_MissingPassword(t *testing.T) {
	h := userHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodDelete, "/api/users/me", strings.NewReader(`{"password":""}`)),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.DeleteAccount(rr, req)
	assertStatus(t, rr, http.StatusBadRequest)
}

// ---- UploadAvatar / UploadBanner ----

func TestUploadAvatar_NoAuth(t *testing.T) {
	h := userHandlerForTest()
	req := httptest.NewRequest(http.MethodPost, "/api/users/me/avatar", nil)
	rr := httptest.NewRecorder()
	h.UploadAvatar(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestUploadBanner_NoAuth(t *testing.T) {
	h := userHandlerForTest()
	req := httptest.NewRequest(http.MethodPost, "/api/users/me/banner", nil)
	rr := httptest.NewRecorder()
	h.UploadBanner(rr, req)
	assertStatus(t, rr, http.StatusUnauthorized)
}

func TestUploadAvatar_NoStorageConfigured(t *testing.T) {
	// h.storage == nil → 500 "storage not configured"
	h := userHandlerForTest()
	req := ctxWithUser(
		httptest.NewRequest(http.MethodPost, "/api/users/me/avatar", nil),
		uuid.New(),
	)
	rr := httptest.NewRecorder()
	h.UploadAvatar(rr, req)
	assertStatus(t, rr, http.StatusInternalServerError)
}
