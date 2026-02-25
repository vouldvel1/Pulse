import { useEffect, useCallback } from 'react';
import { useNotificationStore } from '../../stores/notificationStore';
import type { Notification } from '../../types';
import styles from './NotificationPanel.module.css';

interface Props {
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  mention: '@',
  reply: 'Re',
  dm: 'DM',
  system: 'i',
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function NotificationPanel({ onClose }: Props) {
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchNotifications,
    loadMore,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications().catch(() => {});
  }, [fetchNotifications]);

  const handleMarkAllRead = useCallback(() => {
    markAllRead().catch(() => {});
  }, [markAllRead]);

  const handleLoadMore = useCallback(() => {
    loadMore().catch(() => {});
  }, [loadMore]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            Notifications
            {unreadCount > 0 && (
              <span className={styles.badge}>{unreadCount}</span>
            )}
          </h3>
          <div className={styles.actions}>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.list}>
          {notifications.length === 0 && !loading && (
            <div className={styles.empty}>No notifications</div>
          )}

          {notifications.map((notif: Notification) => (
            <div
              key={notif.id}
              className={`${styles.item} ${!notif.read ? styles.unread : ''}`}
              onClick={() => {
                if (!notif.read) {
                  markRead(notif.id).catch(() => {});
                }
              }}
            >
              <div className={styles.icon}>
                {TYPE_ICONS[notif.type] ?? '?'}
              </div>
              <div className={styles.content}>
                <div className={styles.notifTitle}>{notif.title}</div>
                {notif.body && <div className={styles.body}>{notif.body}</div>}
                <div className={styles.time}>{formatTime(notif.created_at)}</div>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNotification(notif.id).catch(() => {});
                }}
                title="Delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}

          {hasMore && (
            <button
              className={styles.loadMoreBtn}
              onClick={handleLoadMore}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}

          {loading && notifications.length === 0 && (
            <div className={styles.loading}>Loading...</div>
          )}
        </div>
      </div>
    </div>
  );
}
