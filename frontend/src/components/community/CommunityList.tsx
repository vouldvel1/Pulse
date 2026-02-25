import { useEffect, useState } from 'react';
import { useCommunityStore } from '../../stores/communityStore';
import { useChannelStore } from '../../stores/channelStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { CreateCommunityModal } from './CreateCommunityModal';
import { JoinCommunityModal } from './JoinCommunityModal';
import { DiscoverModal } from './DiscoverModal';
import { NotificationPanel } from '../notifications/NotificationPanel';
import styles from './CommunityList.module.css';

export function CommunityList() {
  const { communities, activeCommunityId, fetchCommunities, setActiveCommunity } = useCommunityStore();
  const { fetchChannels } = useChannelStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const handleSelect = (id: string) => {
    setActiveCommunity(id);
    fetchChannels(id);
  };

  const handleHome = () => {
    setActiveCommunity(null);
  };

  const getInitials = (name: string): string => {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <>
      <div className={styles.bar}>
        {/* Home */}
        <div className={styles.iconWrapper}>
          <button
            className={`${styles.homeBtn} ${activeCommunityId === null ? styles.active : ''}`}
            onClick={handleHome}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
          </button>
          <span className={styles.tooltip}>Home</span>
        </div>

        {/* Notifications */}
        <div className={styles.iconWrapper}>
          <button
            className={`${styles.actionBtn} ${styles.notifications}`}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <span className={styles.tooltip}>Notifications</span>
        </div>

        <div className={styles.separator} />

        {/* Communities */}
        {communities.map((community) => (
          <div key={community.id} className={styles.iconWrapper}>
            <button
              className={`${styles.serverIcon} ${activeCommunityId === community.id ? styles.active : ''}`}
              onClick={() => handleSelect(community.id)}
            >
              {community.icon_url ? (
                <img src={community.icon_url} alt={community.name} />
              ) : (
                getInitials(community.name)
              )}
            </button>
            <span className={styles.tooltip}>{community.name}</span>
          </div>
        ))}

        <div className={styles.separator} />

        {/* Actions */}
        <div className={styles.iconWrapper}>
          <button className={`${styles.actionBtn}`} onClick={() => setShowCreate(true)}>
            +
          </button>
          <span className={styles.tooltip}>Create Community</span>
        </div>
        <div className={styles.iconWrapper}>
          <button className={`${styles.actionBtn} ${styles.join}`} onClick={() => setShowJoin(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10,17 15,12 10,7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
          </button>
          <span className={styles.tooltip}>Join Community</span>
        </div>
        <div className={styles.iconWrapper}>
          <button className={`${styles.actionBtn} ${styles.discover}`} onClick={() => setShowDiscover(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <span className={styles.tooltip}>Discover</span>
        </div>
      </div>

      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinCommunityModal onClose={() => setShowJoin(false)} />}
      {showDiscover && <DiscoverModal onClose={() => setShowDiscover(false)} />}
      {showNotifications && <NotificationPanel onClose={() => setShowNotifications(false)} />}
    </>
  );
}
