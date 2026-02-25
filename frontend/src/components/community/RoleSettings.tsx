import { useState, useEffect, useCallback } from 'react';
import { useRoleStore } from '../../stores/roleStore';
import { Permissions } from '../../types';
import type { Role } from '../../types';
import styles from './RoleSettings.module.css';
import modalStyles from '../community/CreateCommunityModal.module.css';

interface Props {
  communityId: string;
  onClose: () => void;
}

// All permission entries for the editor
const PERMISSION_ENTRIES: { key: string; label: string; value: number }[] = [
  { key: 'admin', label: 'Administrator', value: Permissions.ADMIN },
  { key: 'manage_community', label: 'Manage Community', value: Permissions.MANAGE_COMMUNITY },
  { key: 'manage_channels', label: 'Manage Channels', value: Permissions.MANAGE_CHANNELS },
  { key: 'manage_roles', label: 'Manage Roles', value: Permissions.MANAGE_ROLES },
  { key: 'manage_messages', label: 'Manage Messages', value: Permissions.MANAGE_MESSAGES },
  { key: 'manage_members', label: 'Manage Members', value: Permissions.MANAGE_MEMBERS },
  { key: 'send_messages', label: 'Send Messages', value: Permissions.SEND_MESSAGES },
  { key: 'read_messages', label: 'Read Messages', value: Permissions.READ_MESSAGES },
  { key: 'attach_files', label: 'Attach Files', value: Permissions.ATTACH_FILES },
  { key: 'connect', label: 'Connect to Voice', value: Permissions.CONNECT },
  { key: 'speak', label: 'Speak in Voice', value: Permissions.SPEAK },
  { key: 'video', label: 'Video', value: Permissions.VIDEO },
  { key: 'mute_members', label: 'Mute Members', value: Permissions.MUTE_MEMBERS },
  { key: 'deafen_members', label: 'Deafen Members', value: Permissions.DEAFEN_MEMBERS },
  { key: 'move_members', label: 'Move Members', value: Permissions.MOVE_MEMBERS },
  { key: 'mention_everyone', label: 'Mention Everyone', value: Permissions.MENTION_EVERYONE },
  { key: 'manage_webhooks', label: 'Manage Webhooks', value: Permissions.MANAGE_WEBHOOKS },
  { key: 'view_audit_log', label: 'View Audit Log', value: Permissions.VIEW_AUDIT_LOG },
  { key: 'create_invite', label: 'Create Invite', value: Permissions.CREATE_INVITE },
  { key: 'use_reactions', label: 'Use Reactions', value: Permissions.USE_REACTIONS },
  { key: 'share_screen', label: 'Share Screen', value: Permissions.SHARE_SCREEN },
];

export function RoleSettings({ communityId, onClose }: Props) {
  const { roles, loading, fetchRoles, createRole, updateRole, deleteRole } = useRoleStore();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#5865F2');
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchRoles(communityId);
  }, [communityId, fetchRoles]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  const handleCreate = useCallback(async () => {
    if (!newRoleName.trim()) return;
    setError('');
    try {
      const role = await createRole(communityId, newRoleName.trim(), newRoleColor);
      setSelectedRoleId(role.id);
      setCreating(false);
      setNewRoleName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create role');
    }
  }, [communityId, newRoleName, newRoleColor, createRole]);

  const handleDelete = useCallback(async (roleId: string) => {
    if (!confirm('Delete this role?')) return;
    try {
      await deleteRole(roleId);
      if (selectedRoleId === roleId) {
        setSelectedRoleId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete role');
    }
  }, [deleteRole, selectedRoleId]);

  return (
    <div className={modalStyles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Roles</h2>
          <button className={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        <div className={styles.body}>
          {/* Role list sidebar */}
          <div className={styles.roleList}>
            <button className={styles.createBtn} onClick={() => setCreating(true)}>
              + Create Role
            </button>
            {loading && <div className={styles.loading}>Loading...</div>}
            {roles.map((role) => (
              <button
                key={role.id}
                className={`${styles.roleItem} ${selectedRoleId === role.id ? styles.selected : ''}`}
                onClick={() => setSelectedRoleId(role.id)}
              >
                <span
                  className={styles.roleColor}
                  style={{ background: role.color ?? '#99aab5' }}
                />
                <span className={styles.roleName}>{role.name}</span>
                {role.is_default && <span className={styles.defaultBadge}>default</span>}
              </button>
            ))}
          </div>

          {/* Role editor */}
          <div className={styles.editor}>
            {creating && (
              <div className={styles.createForm}>
                <h3 className={styles.editorTitle}>Create New Role</h3>
                {error && <p className={modalStyles.error}>{error}</p>}
                <label className={modalStyles.label}>
                  Role Name
                  <input
                    className={modalStyles.input}
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="New Role"
                    maxLength={64}
                  />
                </label>
                <label className={modalStyles.label}>
                  Color
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                  />
                </label>
                <div className={modalStyles.actions}>
                  <button className={modalStyles.cancelBtn} onClick={() => setCreating(false)}>Cancel</button>
                  <button className={modalStyles.submitBtn} onClick={handleCreate} disabled={!newRoleName.trim()}>
                    Create
                  </button>
                </div>
              </div>
            )}

            {selectedRole && !creating && (
              <RoleEditor
                role={selectedRole}
                onUpdate={updateRole}
                onDelete={handleDelete}
              />
            )}

            {!selectedRole && !creating && (
              <div className={styles.placeholder}>Select a role to edit</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Role Editor ──────────────────────────────────────────────

interface RoleEditorProps {
  role: Role;
  onUpdate: (roleId: string, updates: { name?: string; color?: string; permissions?: number }) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
}

function RoleEditor({ role, onUpdate, onDelete }: RoleEditorProps) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color ?? '#99aab5');
  const [permissions, setPermissions] = useState(role.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset when role changes
  useEffect(() => {
    setName(role.name);
    setColor(role.color ?? '#99aab5');
    setPermissions(role.permissions);
    setError('');
  }, [role.id, role.name, role.color, role.permissions]);

  const hasChanges = name !== role.name || color !== (role.color ?? '#99aab5') || permissions !== role.permissions;

  const togglePermission = (perm: number) => {
    setPermissions((prev) => prev ^ perm);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updates: { name?: string; color?: string; permissions?: number } = {};
      if (name !== role.name) updates.name = name;
      if (color !== (role.color ?? '#99aab5')) updates.color = color;
      if (permissions !== role.permissions) updates.permissions = permissions;
      await onUpdate(role.id, updates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.editorContent}>
      <h3 className={styles.editorTitle}>
        Edit Role: {role.name}
        {role.is_default && <span className={styles.defaultBadge}>default</span>}
      </h3>

      {error && <p className={styles.errorText}>{error}</p>}

      {!role.is_default && (
        <>
          <label className={styles.fieldLabel}>
            Name
            <input
              className={styles.fieldInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
            />
          </label>

          <label className={styles.fieldLabel}>
            Color
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorPicker}
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span className={styles.colorHex}>{color}</span>
            </div>
          </label>
        </>
      )}

      <div className={styles.permissionsSection}>
        <h4 className={styles.permissionsTitle}>Permissions</h4>
        <div className={styles.permissionsList}>
          {PERMISSION_ENTRIES.map((entry) => (
            <label key={entry.key} className={styles.permissionItem}>
              <input
                type="checkbox"
                checked={(permissions & entry.value) !== 0}
                onChange={() => togglePermission(entry.value)}
                className={styles.checkbox}
              />
              <span>{entry.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.editorActions}>
        {!role.is_default && (
          <button className={styles.deleteBtn} onClick={() => void onDelete(role.id)}>
            Delete Role
          </button>
        )}
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
