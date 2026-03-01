package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ---- writeJSON ----

func TestWriteJSON_SetsContentType(t *testing.T) {
	rr := httptest.NewRecorder()
	writeJSON(rr, http.StatusOK, map[string]string{"k": "v"})

	ct := rr.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type: want application/json, got %q", ct)
	}
}

func TestWriteJSON_StatusCode(t *testing.T) {
	rr := httptest.NewRecorder()
	writeJSON(rr, http.StatusCreated, struct{}{})
	if rr.Code != http.StatusCreated {
		t.Errorf("status: want 201, got %d", rr.Code)
	}
}

func TestWriteJSON_Body(t *testing.T) {
	rr := httptest.NewRecorder()
	writeJSON(rr, http.StatusOK, map[string]string{"hello": "world"})

	var got map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["hello"] != "world" {
		t.Errorf("body: want {hello:world}, got %v", got)
	}
}

// ---- writeError ----

func TestWriteError_Shape(t *testing.T) {
	rr := httptest.NewRecorder()
	writeError(rr, http.StatusBadRequest, "bad input")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", rr.Code)
	}

	var resp ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Error != "bad input" {
		t.Errorf("error message: want 'bad input', got %q", resp.Error)
	}
}

// ---- writeErrorWithCode ----

func TestWriteErrorWithCode_Shape(t *testing.T) {
	rr := httptest.NewRecorder()
	writeErrorWithCode(rr, http.StatusConflict, "already exists", "DUPLICATE")

	var resp ErrorResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Error != "already exists" {
		t.Errorf("error: want 'already exists', got %q", resp.Error)
	}
	if resp.Code != "DUPLICATE" {
		t.Errorf("code: want 'DUPLICATE', got %q", resp.Code)
	}
}

// ---- readJSON ----

func TestReadJSON_Valid(t *testing.T) {
	body := `{"name":"alice"}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	var dest struct {
		Name string `json:"name"`
	}
	if err := readJSON(req, &dest); err != nil {
		t.Fatalf("readJSON: %v", err)
	}
	if dest.Name != "alice" {
		t.Errorf("want alice, got %s", dest.Name)
	}
}

func TestReadJSON_RejectsUnknownFields(t *testing.T) {
	body := `{"name":"alice","extra":"field"}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	var dest struct {
		Name string `json:"name"`
	}
	if err := readJSON(req, &dest); err == nil {
		t.Error("expected error for unknown field, got nil")
	}
}

func TestReadJSON_Invalid(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("not-json"))
	var dest struct{}
	if err := readJSON(req, &dest); err == nil {
		t.Error("expected error for invalid JSON")
	}
}

// ---- readJSONLax ----

func TestReadJSONLax_AllowsUnknownFields(t *testing.T) {
	body := `{"name":"bob","unknown":"field"}`
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body))
	var dest struct {
		Name string `json:"name"`
	}
	if err := readJSONLax(req, &dest); err != nil {
		t.Fatalf("readJSONLax: %v", err)
	}
	if dest.Name != "bob" {
		t.Errorf("want bob, got %s", dest.Name)
	}
}

func TestReadJSONLax_Invalid(t *testing.T) {
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader("{bad json"))
	var dest struct{}
	if err := readJSONLax(req, &dest); err == nil {
		t.Error("expected error for invalid JSON")
	}
}

// ---- parseUUID ----

func TestParseUUID_Valid(t *testing.T) {
	const s = "550e8400-e29b-41d4-a716-446655440000"
	id, err := parseUUID(s)
	if err != nil {
		t.Fatalf("parseUUID: %v", err)
	}
	if id.String() != s {
		t.Errorf("want %s, got %s", s, id.String())
	}
}

func TestParseUUID_Invalid(t *testing.T) {
	_, err := parseUUID("not-a-uuid")
	if err == nil {
		t.Error("expected error for invalid UUID")
	}
}

func TestParseUUID_Empty(t *testing.T) {
	_, err := parseUUID("")
	if err == nil {
		t.Error("expected error for empty string")
	}
}

// ---- readJSON with empty body ----

func TestReadJSON_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(nil))
	var dest struct{ Name string }
	err := readJSON(req, &dest)
	if err == nil {
		t.Error("expected error for empty body")
	}
}

// ---- SuccessResponse / PaginatedResponse JSON shape ----

func TestSuccessResponse_JSON(t *testing.T) {
	sr := SuccessResponse{Message: "ok", Data: 42}
	b, err := json.Marshal(sr)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(b, &m)
	if m["message"] != "ok" {
		t.Errorf("message field: %v", m["message"])
	}
}

func TestPaginatedResponse_JSON(t *testing.T) {
	pr := PaginatedResponse{Data: []int{1, 2}, Total: 2, Page: 1, PerPage: 10, TotalPages: 1}
	b, err := json.Marshal(pr)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(b, &m)
	if m["total"] != float64(2) {
		t.Errorf("total field: %v", m["total"])
	}
	if m["per_page"] != float64(10) {
		t.Errorf("per_page field: %v", m["per_page"])
	}
}

// ---- Ensure writeJSON body ends with newline (json.Encoder adds \n) ----

func TestWriteJSON_EndsWithNewline(t *testing.T) {
	rr := httptest.NewRecorder()
	writeJSON(rr, http.StatusOK, struct{}{})
	body, _ := io.ReadAll(rr.Body)
	if len(body) == 0 || body[len(body)-1] != '\n' {
		t.Errorf("expected trailing newline from json.Encoder, body=%q", string(body))
	}
}
