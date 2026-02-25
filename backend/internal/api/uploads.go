package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
	"github.com/pulse-chat/pulse/internal/storage"
	"github.com/pulse-chat/pulse/internal/ws"
)

const maxUploadSize = 25 << 20 // 25 MB

type UploadHandler struct {
	storage     *storage.Client
	messages    *db.MessageQueries
	channels    *db.ChannelQueries
	communities *db.CommunityQueries
	hub         *ws.Hub
}

func NewUploadHandler(storage *storage.Client, messages *db.MessageQueries, channels *db.ChannelQueries, communities *db.CommunityQueries, hub *ws.Hub) *UploadHandler {
	return &UploadHandler{
		storage:     storage,
		messages:    messages,
		channels:    channels,
		communities: communities,
		hub:         hub,
	}
}

// Upload handles POST /api/channels/{id}/upload
// Expects multipart form with "file" and optional "content" (message text)
func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := h.channels.GetByID(r.Context(), channelID)
	if err != nil {
		log.Printf("Error getting channel: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if channel == nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	// Check membership and permissions
	chanPerms, err := h.channels.GetUserChannelPermissions(r.Context(), userID, channelID, channel.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if chanPerms&models.PermAttachFiles == 0 && chanPerms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: attach files")
		return
	}
	if chanPerms&models.PermSendMessages == 0 && chanPerms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: send messages")
		return
	}

	// Parse multipart form
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeErrorWithCode(w, http.StatusBadRequest, "file too large or invalid form data", "INVALID_UPLOAD")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file field required")
		return
	}
	defer file.Close()

	// Validate file size
	if header.Size > maxUploadSize {
		writeErrorWithCode(w, http.StatusBadRequest, "file exceeds 25MB limit", "FILE_TOO_LARGE")
		return
	}

	// Validate MIME type
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		// Try to detect from extension
		ext := strings.ToLower(filepath.Ext(header.Filename))
		contentType = mimeFromExt(ext)
	}
	if !storage.ValidateMimeType(contentType) {
		writeErrorWithCode(w, http.StatusBadRequest, "file type not allowed", "INVALID_MIME_TYPE")
		return
	}

	// Generate unique object name
	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	ext := filepath.Ext(header.Filename)
	objectName := fmt.Sprintf("attachments/%s/%s%s", channelID, hex.EncodeToString(randBytes), ext)

	// Upload to MinIO
	fileURL, err := h.storage.Upload(r.Context(), objectName, file, header.Size, contentType)
	if err != nil {
		log.Printf("Error uploading file: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to upload file")
		return
	}

	// Create the message (with optional text content)
	content := r.FormValue("content")
	if content == "" {
		content = header.Filename
	}

	msg, err := h.messages.Create(r.Context(), channelID, userID, content, nil)
	if err != nil {
		log.Printf("Error creating message for upload: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create message")
		return
	}

	// Create attachment record
	att, err := h.messages.CreateAttachment(r.Context(), msg.ID, header.Filename, header.Size, contentType, fileURL, nil, nil)
	if err != nil {
		log.Printf("Error creating attachment record: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save attachment metadata")
		return
	}

	msg.Attachments = []models.Attachment{*att}

	// Broadcast message with attachment
	payload, _ := json.Marshal(msg)
	h.hub.BroadcastToChannel(channelID, ws.WSEvent{
		Type:    ws.EventMessage,
		Payload: payload,
	}, nil)

	writeJSON(w, http.StatusCreated, msg)
}

func mimeFromExt(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mp3":
		return "audio/mpeg"
	case ".ogg":
		return "audio/ogg"
	case ".wav":
		return "audio/wav"
	case ".pdf":
		return "application/pdf"
	case ".txt":
		return "text/plain"
	case ".zip":
		return "application/zip"
	case ".tar":
		return "application/x-tar"
	case ".gz":
		return "application/gzip"
	default:
		return "application/octet-stream"
	}
}
