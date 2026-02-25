package api

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
)

// SearchHandler handles search-related API endpoints
type SearchHandler struct {
	searchQueries *db.SearchQueries
}

func NewSearchHandler(searchQueries *db.SearchQueries) *SearchHandler {
	return &SearchHandler{searchQueries: searchQueries}
}

// Search performs full-text search across messages
// GET /api/search?q=term&community_id=uuid&channel_id=uuid&limit=25&offset=0
func (h *SearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}
	if len(query) < 2 {
		writeError(w, http.StatusBadRequest, "query must be at least 2 characters")
		return
	}
	if len(query) > 200 {
		writeError(w, http.StatusBadRequest, "query must be at most 200 characters")
		return
	}

	// Optional filters
	var communityID *uuid.UUID
	if cid := r.URL.Query().Get("community_id"); cid != "" {
		parsed, err := parseUUID(cid)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid community_id")
			return
		}
		communityID = &parsed
	}

	var channelID *uuid.UUID
	if chid := r.URL.Query().Get("channel_id"); chid != "" {
		parsed, err := parseUUID(chid)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid channel_id")
			return
		}
		channelID = &parsed
	}

	limit := 25
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	results, total, err := h.searchQueries.SearchMessages(
		r.Context(), userID, query, communityID, channelID, limit, offset,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "search failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"results": results,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}
