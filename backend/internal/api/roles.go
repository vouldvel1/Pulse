package api

import (
	"encoding/json"
	"log"
	"net/http"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/pulse-chat/pulse/internal/db"
	"github.com/pulse-chat/pulse/internal/middleware"
	"github.com/pulse-chat/pulse/internal/models"
	"github.com/pulse-chat/pulse/internal/ws"
)

// WS event types for roles
const (
	EventRoleCreate       = "role_create"
	EventRoleUpdate       = "role_update"
	EventRoleDelete       = "role_delete"
	EventMemberRoleUpdate = "member_role_update"
)

type RoleHandler struct {
	roles       *db.RoleQueries
	communities *db.CommunityQueries
	channels    *db.ChannelQueries
	auditLog    *db.AuditLogQueries
	hub         *ws.Hub
}

func NewRoleHandler(roles *db.RoleQueries, communities *db.CommunityQueries, channels *db.ChannelQueries, auditLog *db.AuditLogQueries, hub *ws.Hub) *RoleHandler {
	return &RoleHandler{
		roles:       roles,
		communities: communities,
		channels:    channels,
		auditLog:    auditLog,
		hub:         hub,
	}
}

// Create handles POST /api/communities/{id}/roles
func (h *RoleHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	var req struct {
		Name        string  `json:"name"`
		Color       *string `json:"color"`
		Permissions int64   `json:"permissions"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || utf8.RuneCountInString(req.Name) > 64 {
		writeErrorWithCode(w, http.StatusBadRequest, "name must be 1-64 characters", "INVALID_NAME")
		return
	}

	role, err := h.roles.Create(r.Context(), communityID, req.Name, req.Color, req.Permissions)
	if err != nil {
		log.Printf("Error creating role: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create role")
		return
	}

	// Audit log
	if logErr := h.auditLog.Log(r.Context(), communityID, userID, "role_create", "role", role.ID, map[string]interface{}{
		"name": role.Name,
	}); logErr != nil {
		log.Printf("Audit log error: %v", logErr)
	}

	// Broadcast
	payload, _ := json.Marshal(role)
	channels, chErr := h.channels.ListByCommunity(r.Context(), communityID)
	if chErr == nil {
		for _, ch := range channels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{Type: EventRoleCreate, Payload: payload}, nil)
		}
	}

	writeJSON(w, http.StatusCreated, role)
}

// List handles GET /api/communities/{id}/roles
func (h *RoleHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	isMember, err := h.communities.IsMember(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this community")
		return
	}

	roles, err := h.roles.ListByCommunity(r.Context(), communityID)
	if err != nil {
		log.Printf("Error listing roles: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if roles == nil {
		roles = []*models.Role{}
	}

	writeJSON(w, http.StatusOK, roles)
}

// Update handles PATCH /api/roles/{id}
func (h *RoleHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	roleID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	// Get the role to determine community
	existing, err := h.roles.GetByID(r.Context(), roleID)
	if err != nil {
		log.Printf("Error getting role: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing == nil {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}

	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, existing.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	var req struct {
		Name        *string `json:"name"`
		Color       *string `json:"color"`
		Permissions *int64  `json:"permissions"`
	}
	if err := readJSONLax(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name != nil && (utf8.RuneCountInString(*req.Name) == 0 || utf8.RuneCountInString(*req.Name) > 64) {
		writeErrorWithCode(w, http.StatusBadRequest, "name must be 1-64 characters", "INVALID_NAME")
		return
	}

	// M8 fix: default roles can also update name and color, not only permissions.
	// Use the same UPDATE path for all roles; UpdateDefaultPermissions is now
	// only used internally when no full Update is needed.
	var role *models.Role
	role, err = h.roles.Update(r.Context(), roleID, req.Name, req.Color, req.Permissions)
	if err != nil {
		log.Printf("Error updating role: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update role")
		return
	}
	if role == nil {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}

	// Audit log
	changes := map[string]interface{}{}
	if req.Name != nil {
		changes["name"] = *req.Name
	}
	if req.Color != nil {
		changes["color"] = *req.Color
	}
	if req.Permissions != nil {
		changes["permissions"] = *req.Permissions
	}
	if logErr := h.auditLog.Log(r.Context(), existing.CommunityID, userID, "role_update", "role", roleID, changes); logErr != nil {
		log.Printf("Audit log error: %v", logErr)
	}

	// Broadcast
	payload, _ := json.Marshal(role)
	channels, chErr := h.channels.ListByCommunity(r.Context(), existing.CommunityID)
	if chErr == nil {
		for _, ch := range channels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{Type: EventRoleUpdate, Payload: payload}, nil)
		}
	}

	writeJSON(w, http.StatusOK, role)
}

// Delete handles DELETE /api/roles/{id}
func (h *RoleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	roleID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	existing, err := h.roles.GetByID(r.Context(), roleID)
	if err != nil {
		log.Printf("Error getting role: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing == nil {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}

	if existing.IsDefault {
		writeError(w, http.StatusForbidden, "cannot delete the default role")
		return
	}

	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, existing.CommunityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	if err := h.roles.Delete(r.Context(), roleID); err != nil {
		log.Printf("Error deleting role: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete role")
		return
	}

	// Audit log
	if logErr := h.auditLog.Log(r.Context(), existing.CommunityID, userID, "role_delete", "role", roleID, map[string]interface{}{
		"name": existing.Name,
	}); logErr != nil {
		log.Printf("Audit log error: %v", logErr)
	}

	// Broadcast
	payload, _ := json.Marshal(map[string]interface{}{
		"id":           roleID,
		"community_id": existing.CommunityID,
	})
	channels, chErr := h.channels.ListByCommunity(r.Context(), existing.CommunityID)
	if chErr == nil {
		for _, ch := range channels {
			h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{Type: EventRoleDelete, Payload: payload}, nil)
		}
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "role deleted"})
}

// AssignRole handles PUT /api/communities/{id}/members/{userId}/roles/{roleId}
func (h *RoleHandler) AssignRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	targetUserID, err := parseUUID(r.PathValue("userId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	roleID, err := parseUUID(r.PathValue("roleId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	// Verify role belongs to this community
	role, err := h.roles.GetByID(r.Context(), roleID)
	if err != nil {
		log.Printf("Error getting role: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if role == nil || role.CommunityID != communityID {
		writeError(w, http.StatusNotFound, "role not found in this community")
		return
	}

	// Verify target is a member
	isMember, err := h.communities.IsMember(r.Context(), targetUserID, communityID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusNotFound, "user is not a member of this community")
		return
	}

	if err := h.roles.AssignRole(r.Context(), targetUserID, communityID, roleID); err != nil {
		log.Printf("Error assigning role: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to assign role")
		return
	}

	// Audit log
	if logErr := h.auditLog.Log(r.Context(), communityID, userID, "role_assign", "member", targetUserID, map[string]interface{}{
		"role_id":   roleID,
		"role_name": role.Name,
	}); logErr != nil {
		log.Printf("Audit log error: %v", logErr)
	}

	// Get updated member roles for broadcast
	memberRoles, err := h.roles.GetMemberRoles(r.Context(), targetUserID, communityID)
	if err == nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"user_id":      targetUserID,
			"community_id": communityID,
			"roles":        memberRoles,
		})
		channels, chErr := h.channels.ListByCommunity(r.Context(), communityID)
		if chErr == nil {
			for _, ch := range channels {
				h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{Type: EventMemberRoleUpdate, Payload: payload}, nil)
			}
		}
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "role assigned"})
}

// RemoveRole handles DELETE /api/communities/{id}/members/{userId}/roles/{roleId}
func (h *RoleHandler) RemoveRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	targetUserID, err := parseUUID(r.PathValue("userId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	roleID, err := parseUUID(r.PathValue("roleId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	if err := h.roles.RemoveRole(r.Context(), targetUserID, communityID, roleID); err != nil {
		log.Printf("Error removing role: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to remove role")
		return
	}

	// Audit log
	role, _ := h.roles.GetByID(r.Context(), roleID)
	roleName := ""
	if role != nil {
		roleName = role.Name
	}
	if logErr := h.auditLog.Log(r.Context(), communityID, userID, "role_unassign", "member", targetUserID, map[string]interface{}{
		"role_id":   roleID,
		"role_name": roleName,
	}); logErr != nil {
		log.Printf("Audit log error: %v", logErr)
	}

	// Broadcast updated roles
	memberRoles, err := h.roles.GetMemberRoles(r.Context(), targetUserID, communityID)
	if err == nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"user_id":      targetUserID,
			"community_id": communityID,
			"roles":        memberRoles,
		})
		channels, chErr := h.channels.ListByCommunity(r.Context(), communityID)
		if chErr == nil {
			for _, ch := range channels {
				h.hub.BroadcastToChannel(ch.ID, ws.WSEvent{Type: EventMemberRoleUpdate, Payload: payload}, nil)
			}
		}
	}

	writeJSON(w, http.StatusOK, SuccessResponse{Message: "role removed"})
}

// GetMemberRoles handles GET /api/communities/{id}/members/{userId}/roles
func (h *RoleHandler) GetMemberRoles(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	targetUserID, err := parseUUID(r.PathValue("userId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	isMember, err := h.communities.IsMember(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this community")
		return
	}

	roles, err := h.roles.GetMemberRoles(r.Context(), targetUserID, communityID)
	if err != nil {
		log.Printf("Error getting member roles: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if roles == nil {
		roles = []*models.Role{}
	}

	writeJSON(w, http.StatusOK, roles)
}

// Reorder handles PATCH /api/communities/{id}/roles/reorder
func (h *RoleHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	communityID, err := parseUUID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid community id")
		return
	}

	perms, err := h.communities.GetMemberPermissions(r.Context(), userID, communityID)
	if err != nil {
		log.Printf("Error checking permissions: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if perms&models.PermManageRoles == 0 && perms&models.PermAdmin == 0 {
		writeError(w, http.StatusForbidden, "missing permission: manage roles")
		return
	}

	var req struct {
		Positions []struct {
			ID       uuid.UUID `json:"id"`
			Position int       `json:"position"`
		} `json:"positions"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Positions) == 0 {
		writeError(w, http.StatusBadRequest, "positions array is required")
		return
	}

	rolePositions := make(map[uuid.UUID]int, len(req.Positions))
	for _, p := range req.Positions {
		rolePositions[p.ID] = p.Position
	}

	if err := h.roles.ReorderRoles(r.Context(), communityID, rolePositions); err != nil {
		log.Printf("Error reordering roles: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to reorder roles")
		return
	}

	// Return updated list
	roles, err := h.roles.ListByCommunity(r.Context(), communityID)
	if err != nil {
		log.Printf("Error listing roles after reorder: %v", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, roles)
}
