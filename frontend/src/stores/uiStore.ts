import { create } from 'zustand';

type View = 'dm' | 'server';
type Theme = 'purple' | 'green' | 'blue';

interface ThemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
}

const THEMES: Record<Theme, ThemeColors> = {
  purple: { primary: '#D0BCFF', onPrimary: '#381E72', primaryContainer: 'rgba(79,55,139,0.4)' },
  green:  { primary: '#B4E197', onPrimary: '#25361A', primaryContainer: 'rgba(37,86,26,0.4)' },
  blue:   { primary: '#A1CFFF', onPrimary: '#003355', primaryContainer: 'rgba(0,64,120,0.4)' },
};

interface UIState {
  view: View;
  theme: Theme;
  showThemeModal: boolean;
  showCreateCommunityModal: boolean;
  showJoinCommunityModal: boolean;
  showSearchCommunityModal: boolean;
  showSettingsModal: boolean;
  showCreateChannelModal: boolean;
  showInviteModal: boolean;
  showFindUserModal: boolean;
  typingUsers: Record<string, { userId: string; username: string; expiry: number }[]>;

  setView: (view: View) => void;
  setTheme: (theme: Theme) => void;
  applyTheme: (theme: Theme) => void;
  setShowThemeModal: (show: boolean) => void;
  setShowCreateCommunityModal: (show: boolean) => void;
  setShowJoinCommunityModal: (show: boolean) => void;
  setShowSearchCommunityModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowCreateChannelModal: (show: boolean) => void;
  setShowInviteModal: (show: boolean) => void;
  setShowFindUserModal: (show: boolean) => void;
  addTypingUser: (channelId: string, userId: string, username: string) => void;
  removeTypingUser: (channelId: string, userId: string) => void;
}

function applyThemeToDOM(theme: Theme) {
  const colors = THEMES[theme];
  const root = document.documentElement;
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--on-primary', colors.onPrimary);
  root.style.setProperty('--primary-container', colors.primaryContainer);
  localStorage.setItem('theme', theme);
}

const savedTheme = (localStorage.getItem('theme') as Theme | null) ?? 'purple';
applyThemeToDOM(savedTheme);

export const useUIStore = create<UIState>((set) => ({
  view: 'server',
  theme: savedTheme,
  showThemeModal: false,
  showCreateCommunityModal: false,
  showJoinCommunityModal: false,
  showSearchCommunityModal: false,
  showSettingsModal: false,
  showCreateChannelModal: false,
  showInviteModal: false,
  showFindUserModal: false,
  typingUsers: {},

  setView: (view) => set({ view }),

  setTheme: (theme) => {
    applyThemeToDOM(theme);
    set({ theme });
  },

  applyTheme: (theme) => {
    applyThemeToDOM(theme);
    set({ theme });
  },

  setShowThemeModal: (show) => set({ showThemeModal: show }),
  setShowCreateCommunityModal: (show) => set({ showCreateCommunityModal: show }),
  setShowJoinCommunityModal: (show) => set({ showJoinCommunityModal: show }),
  setShowSearchCommunityModal: (show) => set({ showSearchCommunityModal: show }),
  setShowSettingsModal: (show) => set({ showSettingsModal: show }),
  setShowCreateChannelModal: (show) => set({ showCreateChannelModal: show }),
  setShowInviteModal: (show) => set({ showInviteModal: show }),
  setShowFindUserModal: (show) => set({ showFindUserModal: show }),

  addTypingUser: (channelId, userId, username) => {
    const expiry = Date.now() + 5000;
    set((s) => ({
      typingUsers: {
        ...s.typingUsers,
        [channelId]: [
          ...(s.typingUsers[channelId] ?? []).filter((u) => u.userId !== userId),
          { userId, username, expiry },
        ],
      },
    }));
    // Auto-remove after 5s
    setTimeout(() => {
      set((s) => ({
        typingUsers: {
          ...s.typingUsers,
          [channelId]: (s.typingUsers[channelId] ?? []).filter(
            (u) => u.userId !== userId || u.expiry !== expiry,
          ),
        },
      }));
    }, 5100);
  },

  removeTypingUser: (channelId, userId) =>
    set((s) => ({
      typingUsers: {
        ...s.typingUsers,
        [channelId]: (s.typingUsers[channelId] ?? []).filter((u) => u.userId !== userId),
      },
    })),
}));
