package models

import (
	"testing"
)

// ---- Permission constants ----

func TestPermissionConstants_UniqueValues(t *testing.T) {
	perms := []struct {
		name  string
		value int64
	}{
		{"PermAdmin", PermAdmin},
		{"PermManageCommunity", PermManageCommunity},
		{"PermManageChannels", PermManageChannels},
		{"PermManageRoles", PermManageRoles},
		{"PermManageMessages", PermManageMessages},
		{"PermManageMembers", PermManageMembers},
		{"PermSendMessages", PermSendMessages},
		{"PermReadMessages", PermReadMessages},
		{"PermAttachFiles", PermAttachFiles},
		{"PermConnect", PermConnect},
		{"PermSpeak", PermSpeak},
		{"PermVideo", PermVideo},
		{"PermMuteMembers", PermMuteMembers},
		{"PermDeafenMembers", PermDeafenMembers},
		{"PermMoveMembers", PermMoveMembers},
		{"PermMentionEveryone", PermMentionEveryone},
		{"PermManageWebhooks", PermManageWebhooks},
		{"PermViewAuditLog", PermViewAuditLog},
		{"PermCreateInvite", PermCreateInvite},
		{"PermUseReactions", PermUseReactions},
		{"PermShareScreen", PermShareScreen},
	}

	seen := make(map[int64]string)
	for _, p := range perms {
		if prev, ok := seen[p.value]; ok {
			t.Errorf("permission value %d duplicated: %s and %s", p.value, prev, p.name)
		}
		seen[p.value] = p.name
	}
}

func TestPermissionConstants_ArePowersOfTwo(t *testing.T) {
	perms := []struct {
		name  string
		value int64
	}{
		{"PermAdmin", PermAdmin},
		{"PermManageCommunity", PermManageCommunity},
		{"PermManageChannels", PermManageChannels},
		{"PermManageRoles", PermManageRoles},
		{"PermManageMessages", PermManageMessages},
		{"PermManageMembers", PermManageMembers},
		{"PermSendMessages", PermSendMessages},
		{"PermReadMessages", PermReadMessages},
		{"PermAttachFiles", PermAttachFiles},
		{"PermConnect", PermConnect},
		{"PermSpeak", PermSpeak},
		{"PermVideo", PermVideo},
		{"PermMuteMembers", PermMuteMembers},
		{"PermDeafenMembers", PermDeafenMembers},
		{"PermMoveMembers", PermMoveMembers},
		{"PermMentionEveryone", PermMentionEveryone},
		{"PermManageWebhooks", PermManageWebhooks},
		{"PermViewAuditLog", PermViewAuditLog},
		{"PermCreateInvite", PermCreateInvite},
		{"PermUseReactions", PermUseReactions},
		{"PermShareScreen", PermShareScreen},
	}

	for _, p := range perms {
		if p.value <= 0 {
			t.Errorf("%s: expected positive value", p.name)
			continue
		}
		// A power of two has exactly one bit set: (v & (v-1)) == 0
		if p.value&(p.value-1) != 0 {
			t.Errorf("%s (%d) is not a power of two", p.name, p.value)
		}
	}
}

// ---- DefaultPermissions ----

func TestDefaultPermissions_ContainsExpectedPerms(t *testing.T) {
	expected := []struct {
		name  string
		value int64
	}{
		{"PermSendMessages", PermSendMessages},
		{"PermReadMessages", PermReadMessages},
		{"PermAttachFiles", PermAttachFiles},
		{"PermConnect", PermConnect},
		{"PermSpeak", PermSpeak},
		{"PermVideo", PermVideo},
		{"PermCreateInvite", PermCreateInvite},
		{"PermUseReactions", PermUseReactions},
		{"PermShareScreen", PermShareScreen},
	}

	for _, perm := range expected {
		if DefaultPermissions&perm.value == 0 {
			t.Errorf("DefaultPermissions should include %s", perm.name)
		}
	}
}

func TestDefaultPermissions_DoesNotContainAdminPerms(t *testing.T) {
	adminPerms := []struct {
		name  string
		value int64
	}{
		{"PermAdmin", PermAdmin},
		{"PermManageCommunity", PermManageCommunity},
		{"PermManageChannels", PermManageChannels},
		{"PermManageRoles", PermManageRoles},
		{"PermManageMessages", PermManageMessages},
		{"PermManageMembers", PermManageMembers},
		{"PermMuteMembers", PermMuteMembers},
		{"PermDeafenMembers", PermDeafenMembers},
		{"PermMoveMembers", PermMoveMembers},
		{"PermMentionEveryone", PermMentionEveryone},
		{"PermManageWebhooks", PermManageWebhooks},
		{"PermViewAuditLog", PermViewAuditLog},
	}

	for _, perm := range adminPerms {
		if DefaultPermissions&perm.value != 0 {
			t.Errorf("DefaultPermissions should NOT include %s", perm.name)
		}
	}
}

// ---- Bitfield operations ----

func TestPermissions_BitwiseOR(t *testing.T) {
	combined := PermSendMessages | PermReadMessages
	if combined&PermSendMessages == 0 {
		t.Error("combined should include PermSendMessages")
	}
	if combined&PermReadMessages == 0 {
		t.Error("combined should include PermReadMessages")
	}
	if combined&PermAdmin != 0 {
		t.Error("combined should NOT include PermAdmin")
	}
}

func TestPermissions_AdminGrantsAllViaCheck(t *testing.T) {
	// Owner gets ^int64(0) — all bits set
	ownerPerms := ^int64(0)
	permsToCheck := []int64{
		PermAdmin, PermManageCommunity, PermManageChannels, PermSendMessages,
	}
	for _, p := range permsToCheck {
		if ownerPerms&p == 0 {
			t.Errorf("owner should have perm %d", p)
		}
	}
}

// ---- Channel type constants ----

func TestChannelTypeConstants_Values(t *testing.T) {
	types := map[string]string{
		"text":         ChannelTypeText,
		"announcement": ChannelTypeAnnouncement,
		"voice":        ChannelTypeVoice,
		"category":     ChannelTypeCategory,
	}
	for want, got := range types {
		if got != want {
			t.Errorf("channel type: want %q, got %q", want, got)
		}
	}
}

// ---- Notification type constants ----

func TestNotificationTypeConstants_Values(t *testing.T) {
	types := map[string]string{
		"mention": NotifTypeMention,
		"reply":   NotifTypeReply,
		"dm":      NotifTypeDM,
		"system":  NotifTypeSystem,
	}
	for want, got := range types {
		if got != want {
			t.Errorf("notif type: want %q, got %q", want, got)
		}
	}
}
