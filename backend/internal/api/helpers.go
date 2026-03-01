package api

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// Response helpers

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}

type SuccessResponse struct {
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type PaginatedResponse struct {
	Data       interface{} `json:"data"`
	Total      int64       `json:"total"`
	Page       int         `json:"page"`
	PerPage    int         `json:"per_page"`
	TotalPages int         `json:"total_pages"`
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, ErrorResponse{Error: message})
}

func writeErrorWithCode(w http.ResponseWriter, status int, message, code string) {
	writeJSON(w, status, ErrorResponse{Error: message, Code: code})
}

// readJSON decodes the request body into dest and rejects unknown fields.
// M3 fix: use this only for POST and PUT requests where the full resource
// body is expected. For PATCH requests use readJSONLax instead.
func readJSON(r *http.Request, dest interface{}) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(dest)
}

// readJSONLax decodes the request body into dest but allows unknown fields.
// Use for PATCH (partial-update) endpoints so that clients sending extra
// fields (e.g. from a cached object) are not rejected.
func readJSONLax(r *http.Request, dest interface{}) error {
	return json.NewDecoder(r.Body).Decode(dest)
}

// parseUUID parses a UUID string. L8: kept as a thin alias because removing
// all call sites would touch many files; the wrapper adds no value but its
// removal would be a larger refactor — document for future cleanup.
func parseUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}
