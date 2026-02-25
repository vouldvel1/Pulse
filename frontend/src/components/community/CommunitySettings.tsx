import { useState, useCallback, useEffect, useRef } from 'react';
import { useCommunityStore } from '../../stores/communityStore';
import { useAuthStore } from '../../stores/authStore';
import { RoleSettings } from './RoleSettings';
import { AuditLog } from './AuditLog';
import type { Invite } from '../../types';
import styles from './CommunitySettings.module.css';

interface Props {
  communityId: string;
}

export function CommunitySettings({ communityId }: Props) {
  const { communities, createInvite, leaveCommunity, deleteCommunity, setActiveCommunity } = useCommunityStore();
  const { user } = useAuthStore();
  const community = communities.find((c) => c.id === communityId);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isOwner = community?.owner_id === user?.id;

  // Outside-click to close dropdown
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  // Auto-dismiss invite bar after 30 seconds
  useEffect(() => {
    if (!invite) return;
    const timer = setTimeout(() => setInvite(null), 30000);
    return () => clearTimeout(timer);
  }, [invite]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleCreateInvite = useCallback(async () => {
    try {
      const inv = await createInvite(communityId);
      setInvite(inv);
      setShowMenu(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    }
  }, [communityId, createInvite]);

  const handleCopyInvite = useCallback(async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [invite]);

  const handleLeave = useCallback(async () => {
    if (!confirm('Are you sure you want to leave this community?')) return;
    try {
      await leaveCommunity(communityId);
      setActiveCommunity(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave community');
    }
  }, [communityId, leaveCommunity, setActiveCommunity]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Are you sure you want to DELETE this community? This cannot be undone.')) return;
    try {
      await deleteCommunity(communityId);
      setActiveCommunity(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete community');
    }
  }, [communityId, deleteCommunity, setActiveCommunity]);

  if (!community) return null;

  const handleSearchClick = () => {
    // Dispatch keyboard shortcut for search (Ctrl+K)
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    window.dispatchEvent(event);
  };

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.name}>{community.name}</span>
        <button className={styles.menuBtn} onClick={() => setShowMenu(!showMenu)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>
      </div>
      <button className={styles.searchBtn} onClick={handleSearchClick} title="Search (Ctrl+K)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>

      {showMenu && (
        <div className={styles.dropdown} ref={dropdownRef}>
          <button className={styles.dropdownItem} onClick={() => { handleCreateInvite().catch(() => {}); }}>
            Invite People
          </button>
          <button
            className={styles.dropdownItem}
            onClick={() => {
              setShowRoles(true);
              setShowMenu(false);
            }}
          >
            Manage Roles
          </button>
          <button
            className={styles.dropdownItem}
            onClick={() => {
              setShowAuditLog(true);
              setShowMenu(false);
            }}
          >
            Audit Log
          </button>
          {!isOwner && (
            <button className={`${styles.dropdownItem} ${styles.danger}`} onClick={() => { handleLeave().catch(() => {}); }}>
              Leave Community
            </button>
          )}
          {isOwner && (
            <button className={`${styles.dropdownItem} ${styles.danger}`} onClick={() => { handleDelete().catch(() => {}); }}>
              Delete Community
            </button>
          )}
        </div>
      )}

      {invite && (
        <div className={styles.inviteBar}>
          <code className={styles.inviteCode}>{invite.code}</code>
          <button className={styles.copyBtn} onClick={() => { handleCopyInvite().catch(() => {}); }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            className={styles.inviteCloseBtn}
            onClick={() => setInvite(null)}
            title="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className={styles.errorBar}>
          <span>{error}</span>
          <button className={styles.inviteCloseBtn} onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {showRoles && (
        <RoleSettings communityId={communityId} onClose={() => setShowRoles(false)} />
      )}

      {showAuditLog && (
        <AuditLog communityId={communityId} onClose={() => setShowAuditLog(false)} />
      )}
    </div>
  );
}
