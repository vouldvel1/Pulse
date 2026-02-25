import { create } from 'zustand';
import { api } from '../utils/api';
import type { Role, AuditLogEntry } from '../types';

interface RoleState {
  roles: Role[];
  loading: boolean;
  auditLog: AuditLogEntry[];
  auditLogLoading: boolean;

  fetchRoles: (communityId: string) => Promise<void>;
  createRole: (communityId: string, name: string, color?: string, permissions?: number) => Promise<Role>;
  updateRole: (roleId: string, updates: { name?: string; color?: string; permissions?: number }) => Promise<void>;
  deleteRole: (roleId: string) => Promise<void>;
  assignRole: (communityId: string, userId: string, roleId: string) => Promise<void>;
  removeRole: (communityId: string, userId: string, roleId: string) => Promise<void>;
  getMemberRoles: (communityId: string, userId: string) => Promise<Role[]>;
  reorderRoles: (communityId: string, positions: { id: string; position: number }[]) => Promise<void>;

  fetchAuditLog: (communityId: string, opts?: { before?: string; action?: string; actor_id?: string }) => Promise<void>;

  // WS event handlers
  handleRoleCreate: (role: Role) => void;
  handleRoleUpdate: (role: Role) => void;
  handleRoleDelete: (payload: { id: string; community_id: string }) => void;
}

export const useRoleStore = create<RoleState>((set, get) => ({
  roles: [],
  loading: false,
  auditLog: [],
  auditLogLoading: false,

  fetchRoles: async (communityId: string) => {
    set({ loading: true });
    try {
      const roles = await api.get<Role[]>(`/communities/${communityId}/roles`);
      set({ roles });
    } finally {
      set({ loading: false });
    }
  },

  createRole: async (communityId: string, name: string, color?: string, permissions?: number) => {
    const role = await api.post<Role>(`/communities/${communityId}/roles`, {
      name,
      color: color ?? null,
      permissions: permissions ?? 0,
    });
    set((state) => ({ roles: [...state.roles, role] }));
    return role;
  },

  updateRole: async (roleId: string, updates: { name?: string; color?: string; permissions?: number }) => {
    const role = await api.patch<Role>(`/roles/${roleId}`, updates);
    set((state) => ({
      roles: state.roles.map((r) => (r.id === role.id ? role : r)),
    }));
  },

  deleteRole: async (roleId: string) => {
    await api.delete(`/roles/${roleId}`);
    set((state) => ({
      roles: state.roles.filter((r) => r.id !== roleId),
    }));
  },

  assignRole: async (communityId: string, userId: string, roleId: string) => {
    await api.put(`/communities/${communityId}/members/${userId}/roles/${roleId}`);
  },

  removeRole: async (communityId: string, userId: string, roleId: string) => {
    await api.delete(`/communities/${communityId}/members/${userId}/roles/${roleId}`);
  },

  getMemberRoles: async (communityId: string, userId: string) => {
    return api.get<Role[]>(`/communities/${communityId}/members/${userId}/roles`);
  },

  reorderRoles: async (communityId: string, positions: { id: string; position: number }[]) => {
    const roles = await api.patch<Role[]>(`/communities/${communityId}/roles/reorder`, { positions });
    set({ roles });
  },

  fetchAuditLog: async (communityId: string, opts?: { before?: string; action?: string; actor_id?: string }) => {
    set({ auditLogLoading: true });
    try {
      const params = new URLSearchParams();
      if (opts?.before) params.set('before', opts.before);
      if (opts?.action) params.set('action', opts.action);
      if (opts?.actor_id) params.set('actor_id', opts.actor_id);
      const qs = params.toString();
      const path = `/communities/${communityId}/audit-log${qs ? '?' + qs : ''}`;
      const entries = await api.get<AuditLogEntry[]>(path);
      if (opts?.before) {
        // Append for pagination
        set((state) => ({ auditLog: [...state.auditLog, ...entries] }));
      } else {
        set({ auditLog: entries });
      }
    } finally {
      set({ auditLogLoading: false });
    }
  },

  handleRoleCreate: (role: Role) => {
    const existing = get().roles.find((r) => r.id === role.id);
    if (!existing) {
      set((state) => ({ roles: [...state.roles, role] }));
    }
  },

  handleRoleUpdate: (role: Role) => {
    set((state) => ({
      roles: state.roles.map((r) => (r.id === role.id ? role : r)),
    }));
  },

  handleRoleDelete: (payload: { id: string; community_id: string }) => {
    set((state) => ({
      roles: state.roles.filter((r) => r.id !== payload.id),
    }));
  },
}));
