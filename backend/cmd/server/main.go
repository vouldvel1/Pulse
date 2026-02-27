package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pulse-chat/pulse/internal/api"
	"github.com/pulse-chat/pulse/internal/cache"
	"github.com/pulse-chat/pulse/internal/config"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/signaling"
	"github.com/pulse-chat/pulse/internal/storage"
	"github.com/pulse-chat/pulse/internal/ws"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to PostgreSQL
	log.Println("Connecting to PostgreSQL...")
	dbPool, err := db.New(ctx, cfg.Postgres.DSN())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer dbPool.Close()

	// Run migrations
	log.Println("Running migrations...")
	if err := dbPool.RunMigrations(ctx, "migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Connect to Redis
	log.Println("Connecting to Redis...")
	cacheStore, err := cache.New(cfg.Redis.Addr(), cfg.Redis.Password)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer cacheStore.Close()

	// Connect to MinIO
	log.Println("Connecting to MinIO...")
	storageClient, err := storage.New(
		cfg.MinIO.Endpoint,
		cfg.MinIO.AccessKey,
		cfg.MinIO.SecretKey,
		cfg.MinIO.Bucket,
		cfg.MinIO.UseSSL,
	)
	if err != nil {
		log.Fatalf("Failed to connect to MinIO: %v", err)
	}

	// Ensure storage bucket exists
	if err := storageClient.EnsureBucket(ctx); err != nil {
		log.Fatalf("Failed to ensure storage bucket: %v", err)
	}

	// Initialize auth middleware
	authMW := middleware.NewAuth(cfg.JWT.Secret)

	// Initialize database queries
	userQueries := db.NewUserQueries(dbPool)
	communityQueries := db.NewCommunityQueries(dbPool)
	channelQueries := db.NewChannelQueries(dbPool)
	messageQueries := db.NewMessageQueries(dbPool)
	inviteQueries := db.NewInviteQueries(dbPool)
	roleQueries := db.NewRoleQueries(dbPool)
	auditLogQueries := db.NewAuditLogQueries(dbPool)
	dmQueries := db.NewDMQueries(dbPool)
	notificationQueries := db.NewNotificationQueries(dbPool)
	searchQueries := db.NewSearchQueries(dbPool)

	// Initialize WebSocket hub
	hub := ws.NewHub(cacheStore, authMW)
	go hub.Run()

	// Initialize API handlers
	authHandler := api.NewAuthHandler(
		userQueries,
		cacheStore,
		authMW,
		cfg.BcryptCost,
		cfg.JWT.AccessExpiry,
		cfg.JWT.RefreshExpiry,
	)
	communityHandler := api.NewCommunityHandler(communityQueries, channelQueries, inviteQueries, hub)
	channelHandler := api.NewChannelHandler(channelQueries, communityQueries, hub)
	messageHandler := api.NewMessageHandler(messageQueries, channelQueries, communityQueries, hub)
	uploadHandler := api.NewUploadHandler(storageClient, messageQueries, channelQueries, communityQueries, hub)
	inviteHandler := api.NewInviteHandler(inviteQueries, communityQueries)
	roleHandler := api.NewRoleHandler(roleQueries, communityQueries, channelQueries, auditLogQueries, hub)
	auditLogHandler := api.NewAuditLogHandler(auditLogQueries, communityQueries)
	dmHandler := api.NewDMHandler(dmQueries, userQueries, hub)
	notificationHandler := api.NewNotificationHandler(notificationQueries, hub)
	searchHandler := api.NewSearchHandler(searchQueries)
	userHandler := api.NewUserHandler(userQueries, api.WithStorage(storageClient), api.WithBcryptCost(cfg.BcryptCost))

	// Initialize Phase 3: Voice & Screen sharing
	voiceStateQueries := db.NewVoiceStateQueries(dbPool)
	roomManager := signaling.NewRoomManager()

	// Set up voice WebSocket event handler
	hubBroadcaster := &ws.HubBroadcaster{Hub: hub}
	voiceWSHandler := signaling.NewVoiceWSHandler(roomManager, hubBroadcaster, voiceStateQueries)
	hub.SetVoiceHandler(voiceWSHandler)

	voiceHandler := api.NewVoiceHandler(
		voiceStateQueries, channelQueries, communityQueries,
		roomManager, hub,
		cfg.LiveKitAPIKey, cfg.LiveKitAPISecret, cfg.LiveKitWSURL,
	)

	// ICE server handler — serves ephemeral TURN credentials for WebRTC
	// turnHost is the publicly reachable host:port of the LiveKit TURN server.
	// In production, replace with your server's public IP or domain.
	turnHost := cfg.Domain + ":3478"
	iceHandler := api.NewICEHandler(turnHost, "7881", cfg.LiveKitTURNSecret)

	// Setup router
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"ok","time":"%s"}`, time.Now().Format(time.RFC3339))
	})

	// Auth routes (no auth required)
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/auth/refresh", authHandler.RefreshToken)

	// Auth routes (auth required)
	mux.Handle("POST /api/auth/logout", authMW.Middleware(http.HandlerFunc(authHandler.Logout)))
	mux.Handle("GET /api/auth/me", authMW.Middleware(http.HandlerFunc(authHandler.Me)))

	// User routes (auth required)
	mux.Handle("GET /api/users/search", authMW.Middleware(http.HandlerFunc(userHandler.Search)))
	mux.Handle("PATCH /api/users/me", authMW.Middleware(http.HandlerFunc(userHandler.UpdateProfile)))
	mux.Handle("POST /api/users/me/avatar", authMW.Middleware(http.HandlerFunc(userHandler.UploadAvatar)))
	mux.Handle("POST /api/users/me/banner", authMW.Middleware(http.HandlerFunc(userHandler.UploadBanner)))
	mux.Handle("PUT /api/users/me/password", authMW.Middleware(http.HandlerFunc(userHandler.ChangePassword)))
	mux.Handle("DELETE /api/users/me", authMW.Middleware(http.HandlerFunc(userHandler.DeleteAccount)))

	// WebSocket
	mux.HandleFunc("GET /ws", hub.HandleWebSocket)

	// Community routes (auth required)
	mux.Handle("POST /api/communities", authMW.Middleware(http.HandlerFunc(communityHandler.Create)))
	mux.Handle("GET /api/communities", authMW.Middleware(http.HandlerFunc(communityHandler.ListMine)))
	mux.Handle("GET /api/communities/search", authMW.Middleware(http.HandlerFunc(communityHandler.Search)))
	mux.Handle("GET /api/communities/{id}", authMW.Middleware(http.HandlerFunc(communityHandler.Get)))
	mux.Handle("PATCH /api/communities/{id}", authMW.Middleware(http.HandlerFunc(communityHandler.Update)))
	mux.Handle("DELETE /api/communities/{id}", authMW.Middleware(http.HandlerFunc(communityHandler.Delete)))
	mux.Handle("GET /api/communities/{id}/members", authMW.Middleware(http.HandlerFunc(communityHandler.ListMembers)))
	mux.Handle("POST /api/communities/{id}/join", authMW.Middleware(http.HandlerFunc(communityHandler.JoinPublic)))
	mux.Handle("DELETE /api/communities/{id}/members/me", authMW.Middleware(http.HandlerFunc(communityHandler.Leave)))

	// Channel routes (auth required)
	mux.Handle("POST /api/communities/{id}/channels", authMW.Middleware(http.HandlerFunc(channelHandler.Create)))
	mux.Handle("GET /api/communities/{id}/channels", authMW.Middleware(http.HandlerFunc(channelHandler.List)))
	mux.Handle("GET /api/channels/{id}", authMW.Middleware(http.HandlerFunc(channelHandler.Get)))
	mux.Handle("PATCH /api/channels/{id}", authMW.Middleware(http.HandlerFunc(channelHandler.Update)))
	mux.Handle("DELETE /api/channels/{id}", authMW.Middleware(http.HandlerFunc(channelHandler.Delete)))
	mux.Handle("PUT /api/channels/{id}/permissions/{roleId}", authMW.Middleware(http.HandlerFunc(channelHandler.SetPermissionOverwrite)))
	mux.Handle("DELETE /api/channels/{id}/permissions/{roleId}", authMW.Middleware(http.HandlerFunc(channelHandler.DeletePermissionOverwrite)))

	// Message routes (auth required)
	mux.Handle("POST /api/channels/{id}/messages", authMW.Middleware(http.HandlerFunc(messageHandler.Send)))
	mux.Handle("GET /api/channels/{id}/messages", authMW.Middleware(http.HandlerFunc(messageHandler.List)))
	mux.Handle("PATCH /api/channels/{channelId}/messages/{messageId}", authMW.Middleware(http.HandlerFunc(messageHandler.Edit)))
	mux.Handle("DELETE /api/channels/{channelId}/messages/{messageId}", authMW.Middleware(http.HandlerFunc(messageHandler.Delete)))
	mux.Handle("GET /api/channels/{id}/pins", authMW.Middleware(http.HandlerFunc(messageHandler.GetPinned)))
	mux.Handle("PUT /api/channels/{channelId}/messages/{messageId}/pin", authMW.Middleware(http.HandlerFunc(messageHandler.Pin)))
	mux.Handle("DELETE /api/channels/{channelId}/messages/{messageId}/pin", authMW.Middleware(http.HandlerFunc(messageHandler.Unpin)))
	mux.Handle("PUT /api/channels/{channelId}/messages/{messageId}/reactions/{emoji}", authMW.Middleware(http.HandlerFunc(messageHandler.AddReaction)))
	mux.Handle("DELETE /api/channels/{channelId}/messages/{messageId}/reactions/{emoji}", authMW.Middleware(http.HandlerFunc(messageHandler.RemoveReaction)))

	// Upload routes (auth required)
	mux.Handle("POST /api/channels/{id}/upload", authMW.Middleware(http.HandlerFunc(uploadHandler.Upload)))

	// Invite routes
	mux.HandleFunc("GET /api/invites/{code}", inviteHandler.GetByCode) // public — see invite info before joining
	mux.Handle("POST /api/invites/{code}/join", authMW.Middleware(http.HandlerFunc(communityHandler.Join)))
	mux.Handle("POST /api/communities/{id}/invites", authMW.Middleware(http.HandlerFunc(inviteHandler.Create)))
	mux.Handle("GET /api/communities/{id}/invites", authMW.Middleware(http.HandlerFunc(inviteHandler.List)))
	mux.Handle("DELETE /api/invites/{id}", authMW.Middleware(http.HandlerFunc(inviteHandler.Delete)))

	// Role routes (auth required)
	mux.Handle("POST /api/communities/{id}/roles", authMW.Middleware(http.HandlerFunc(roleHandler.Create)))
	mux.Handle("GET /api/communities/{id}/roles", authMW.Middleware(http.HandlerFunc(roleHandler.List)))
	mux.Handle("PATCH /api/roles/{id}", authMW.Middleware(http.HandlerFunc(roleHandler.Update)))
	mux.Handle("DELETE /api/roles/{id}", authMW.Middleware(http.HandlerFunc(roleHandler.Delete)))
	mux.Handle("PATCH /api/communities/{id}/roles/reorder", authMW.Middleware(http.HandlerFunc(roleHandler.Reorder)))
	mux.Handle("PUT /api/communities/{id}/members/{userId}/roles/{roleId}", authMW.Middleware(http.HandlerFunc(roleHandler.AssignRole)))
	mux.Handle("DELETE /api/communities/{id}/members/{userId}/roles/{roleId}", authMW.Middleware(http.HandlerFunc(roleHandler.RemoveRole)))
	mux.Handle("GET /api/communities/{id}/members/{userId}/roles", authMW.Middleware(http.HandlerFunc(roleHandler.GetMemberRoles)))

	// Audit log routes (auth required)
	mux.Handle("GET /api/communities/{id}/audit-log", authMW.Middleware(http.HandlerFunc(auditLogHandler.List)))

	// DM routes (auth required)
	mux.Handle("POST /api/dm/channels", authMW.Middleware(http.HandlerFunc(dmHandler.CreateDM)))
	mux.Handle("POST /api/dm/channels/group", authMW.Middleware(http.HandlerFunc(dmHandler.CreateGroupDM)))
	mux.Handle("GET /api/dm/channels", authMW.Middleware(http.HandlerFunc(dmHandler.ListDMChannels)))
	mux.Handle("GET /api/dm/channels/{id}", authMW.Middleware(http.HandlerFunc(dmHandler.GetDMChannel)))
	mux.Handle("POST /api/dm/channels/{id}/messages", authMW.Middleware(http.HandlerFunc(dmHandler.SendMessage)))
	mux.Handle("GET /api/dm/channels/{id}/messages", authMW.Middleware(http.HandlerFunc(dmHandler.ListMessages)))
	mux.Handle("PATCH /api/dm/channels/{channelId}/messages/{messageId}", authMW.Middleware(http.HandlerFunc(dmHandler.EditMessage)))
	mux.Handle("DELETE /api/dm/channels/{channelId}/messages/{messageId}", authMW.Middleware(http.HandlerFunc(dmHandler.DeleteMessage)))

	// Notification routes (auth required)
	mux.Handle("GET /api/notifications", authMW.Middleware(http.HandlerFunc(notificationHandler.List)))
	mux.Handle("GET /api/notifications/unread-count", authMW.Middleware(http.HandlerFunc(notificationHandler.GetUnreadCount)))
	mux.Handle("PATCH /api/notifications/{id}/read", authMW.Middleware(http.HandlerFunc(notificationHandler.MarkRead)))
	mux.Handle("POST /api/notifications/read-all", authMW.Middleware(http.HandlerFunc(notificationHandler.MarkAllRead)))
	mux.Handle("DELETE /api/notifications/{id}", authMW.Middleware(http.HandlerFunc(notificationHandler.Delete)))

	// Voice routes (auth required)
	mux.Handle("POST /api/voice/channels/{id}/join", authMW.Middleware(http.HandlerFunc(voiceHandler.JoinVoice)))
	mux.Handle("POST /api/voice/leave", authMW.Middleware(http.HandlerFunc(voiceHandler.LeaveVoice)))
	mux.Handle("PATCH /api/voice/state", authMW.Middleware(http.HandlerFunc(voiceHandler.UpdateVoiceState)))
	mux.Handle("GET /api/voice/channels/{id}/participants", authMW.Middleware(http.HandlerFunc(voiceHandler.GetVoiceParticipants)))
	mux.Handle("GET /api/voice/ice-servers", authMW.Middleware(http.HandlerFunc(iceHandler.GetICEServers)))

	// Search routes (auth required)
	mux.Handle("GET /api/search", authMW.Middleware(http.HandlerFunc(searchHandler.Search)))

	// Apply global middleware
	var handler http.Handler = mux
	handler = middleware.Logger(handler)
	handler = middleware.CORS(handler)
	handler = middleware.NewRateLimiter(cacheStore, cfg.RateLimitRPS, cfg.RateLimitBurst).Middleware(handler)

	// Create server
	server := &http.Server{
		Addr:         ":" + cfg.APIPort,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server
	go func() {
		log.Printf("Server starting on :%s (env: %s)", cfg.APIPort, cfg.AppEnv)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Start token cleanup goroutine
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				count, err := userQueries.CleanExpiredTokens(ctx)
				if err != nil {
					log.Printf("Error cleaning expired tokens: %v", err)
				} else if count > 0 {
					log.Printf("Cleaned %d expired refresh tokens", count)
				}
			}
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
