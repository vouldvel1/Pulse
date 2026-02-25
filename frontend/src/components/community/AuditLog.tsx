import { useEffect, useCallback } from 'react';
import { useRoleStore } from '../../stores/roleStore';
import type { AuditLogEntry } from '../../types';
import styles from './AuditLog.module.css';
import modalStyles from '../community/CreateCommunityModal.module.css';

interface Props {
  communityId: string;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  role_create: 'Created role',
  role_update: 'Updated role',
  role_delete: 'Deleted role',
  role_assign: 'Assigned role',
  role_unassign: 'Removed role',
  channel_create: 'Created channel',
  channel_update: 'Updated channel',
  channel_delete: 'Deleted channel',
  member_kick: 'Kicked member',
  member_ban: 'Banned member',
  community_update: 'Updated community',
  invite_create: 'Created invite',
  invite_delete: 'Deleted invite',
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseChanges(changesStr: string | null): Record<string, unknown> | null {
  if (!changesStr) return null;
  try {
    return JSON.parse(changesStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function AuditLog({ communityId, onClose }: Props) {
  const { auditLog, auditLogLoading, fetchAuditLog } = useRoleStore();

  useEffect(() => {
    void fetchAuditLog(communityId);
  }, [communityId, fetchAuditLog]);

  const handleLoadMore = useCallback(() => {
    const lastEntry = auditLog[auditLog.length - 1];
    if (lastEntry) {
      void fetchAuditLog(communityId, { before: lastEntry.created_at });
    }
  }, [auditLog, communityId, fetchAuditLog]);

  return (
    <div className={modalStyles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Audit Log</h2>
          <button className={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        <div className={styles.list}>
          {auditLog.length === 0 && !auditLogLoading && (
            <div className={styles.empty}>No audit log entries</div>
          )}
          {auditLog.map((entry) => (
            <AuditLogRow key={entry.id} entry={entry} />
          ))}
          {auditLogLoading && <div className={styles.loading}>Loading...</div>}
          {auditLog.length > 0 && !auditLogLoading && (
            <button className={styles.loadMoreBtn} onClick={handleLoadMore}>
              Load More
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const changes = parseChanges(entry.changes);

  return (
    <div className={styles.row}>
      <div className={styles.rowHeader}>
        <span className={styles.action}>{formatAction(entry.action)}</span>
        <span className={styles.target}>{entry.target_type}</span>
        <span className={styles.date}>{formatDate(entry.created_at)}</span>
      </div>
      {changes && (
        <div className={styles.changes}>
          {Object.entries(changes).map(([key, value]) => (
            <span key={key} className={styles.change}>
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
