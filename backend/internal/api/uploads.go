package api

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
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

type UploadHandler struct {
	storage       *storage.Client
	messages      *db.MessageQueries
	channels      *db.ChannelQueries
	communities   *db.CommunityQueries
	hub           *ws.Hub
	maxUploadSize int64
}

func NewUploadHandler(stor *storage.Client, messages *db.MessageQueries, channels *db.ChannelQueries, communities *db.CommunityQueries, hub *ws.Hub, maxUploadSize int64) *UploadHandler {
	return &UploadHandler{
		storage:       stor,
		messages:      messages,
		channels:      channels,
		communities:   communities,
		hub:           hub,
		maxUploadSize: maxUploadSize,
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

	// M5: Use cfg.MaxUploadSize via h.maxUploadSize consistently; the old
	// hardcoded 32<<20 is gone.
	// H10: MaxBytesReader limits the body before parsing so large requests
	// are rejected at the TCP level without buffering the full payload.
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadSize)

	// Parse multipart form
	if err := r.ParseMultipartForm(h.maxUploadSize); err != nil {
		writeErrorWithCode(w, http.StatusBadRequest, "file too large or invalid form data", "INVALID_UPLOAD")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file field required")
		return
	}
	defer file.Close()

	// Validate file size against configured limit
	if header.Size > h.maxUploadSize {
		writeErrorWithCode(w, http.StatusBadRequest, fmt.Sprintf("file exceeds %d byte limit", h.maxUploadSize), "FILE_TOO_LARGE")
		return
	}

	// H2: Detect MIME type from the first 512 bytes of the actual file body,
	// not from the client-supplied Content-Type header.
	sniffBuf := make([]byte, 512)
	n, _ := file.Read(sniffBuf)
	sniffBuf = sniffBuf[:n]
	detectedType := http.DetectContentType(sniffBuf)

	// Normalise — DetectContentType can return "application/octet-stream" for
	// unknown types; in that case fall back to the extension mapping.
	contentType := detectedType
	if contentType == "application/octet-stream" {
		ext := strings.ToLower(filepath.Ext(header.Filename))
		contentType = mimeFromExt(ext)
	}

	if !storage.ValidateMimeType(contentType) {
		writeErrorWithCode(w, http.StatusBadRequest, "file type not allowed", "INVALID_MIME_TYPE")
		return
	}

	// Reconstruct the full reader (sniffed bytes + remainder of file body).
	fullReader := io.MultiReader(bytes.NewReader(sniffBuf), file)

	// Generate unique object name
	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	ext := filepath.Ext(header.Filename)
	objectName := fmt.Sprintf("attachments/%s/%s%s", channelID, hex.EncodeToString(randBytes), ext)

	// Upload to MinIO
	fileURL, err := h.storage.Upload(r.Context(), objectName, fullReader, header.Size, contentType)
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
