import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useUIStore } from '@/stores/uiStore';
import { wsClient } from '@/utils/wsClient';
import { useWebSocket } from '@/hooks/useWebSocket';

import { TopNav } from './TopNav';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { ChatView } from '@/components/chat/ChatView';
import { DMChatView } from '@/components/dm/DMChatView';

import { ThemeModal } from '@/components/settings/ThemeModal';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { CreateCommunityModal } from '@/components/community/CreateCommunityModal';
import { CreateChannelModal } from '@/components/community/CreateChannelModal';
import { JoinCommunityModal } from '@/components/community/JoinCommunityModal';

export function MainLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const fetchCommunities = useCommunityStore((s) => s.fetchCommunities);

  const view = useUIStore((s) => s.view);
  const showThemeModal = useUIStore((s) => s.showThemeModal);
  const showSettingsModal = useUIStore((s) => s.showSettingsModal);
  const showCreateCommunityModal = useUIStore((s) => s.showCreateCommunityModal);
  const showCreateChannelModal = useUIStore((s) => s.showCreateChannelModal);
  const showJoinCommunityModal = useUIStore((s) => s.showJoinCommunityModal);

  const setShowThemeModal = useUIStore((s) => s.setShowThemeModal);
  const setShowSettingsModal = useUIStore((s) => s.setShowSettingsModal);
  const setShowCreateCommunityModal = useUIStore((s) => s.setShowCreateCommunityModal);
  const setShowCreateChannelModal = useUIStore((s) => s.setShowCreateChannelModal);
  const setShowJoinCommunityModal = useUIStore((s) => s.setShowJoinCommunityModal);

  // Connect WebSocket event handlers
  useWebSocket();

  useEffect(() => {
    if (isAuthenticated) {
      void fetchMe();
      void fetchCommunities();
      wsClient.connect();
    }
    return () => {
      // Don't disconnect on unmount — keep alive
    };
  }, [isAuthenticated, fetchMe, fetchCommunities]);

  const isSrv = view === 'server';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNav
        onOpenCreateCommunity={() => setShowCreateCommunityModal(true)}
      />

      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          padding: '0 12px 12px',
          gap: 12,
        }}
      >
        <LeftSidebar onOpenSettings={() => setShowSettingsModal(true)} />

        {/* Main content */}
        {isSrv ? <ChatView /> : <DMChatView />}

        {/* Right sidebar (only in server view) */}
        {isSrv && <RightSidebar />}
      </div>

      {/* Modals */}
      <ThemeModal open={showThemeModal} onClose={() => setShowThemeModal(false)} />
      <SettingsModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
      <CreateCommunityModal open={showCreateCommunityModal} onClose={() => setShowCreateCommunityModal(false)} />
      <CreateChannelModal open={showCreateChannelModal} onClose={() => setShowCreateChannelModal(false)} />
      <JoinCommunityModal open={showJoinCommunityModal} onClose={() => setShowJoinCommunityModal(false)} />
    </div>
  );
}
