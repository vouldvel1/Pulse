import { useState, useCallback, useRef, useEffect } from 'react';
import { useCommunityStore } from '../../stores/communityStore';
import { useChannelStore } from '../../stores/channelStore';
import type { CommunitySearchResult } from '../../types';
import styles from './DiscoverModal.module.css';

interface Props {
  onClose: () => void;
}

export function DiscoverModal({ onClose }: Props) {
  const { searchCommunities, joinPublicCommunity, setActiveCommunity, communities } = useCommunityStore();
  const { fetchChannels } = useChannelStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommunitySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const data = await searchCommunities(q.trim());
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [searchCommunities]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const isMember = (communityId: string) => communities.some((c) => c.id === communityId);

  const handleJoin = async (communityId: string) => {
    setJoiningId(communityId);
    setError(null);
    try {
      const community = await joinPublicCommunity(communityId);
      setActiveCommunity(community.id);
      fetchChannels(community.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join';
      // If already member, just navigate
      if (message.includes('already a member')) {
        setActiveCommunity(communityId);
        fetchChannels(communityId);
        onClose();
        return;
      }
      setError(message);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Discover Communities</h2>
          <p className={styles.subtitle}>Find and join public communities on this server.</p>
        </div>

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search communities..."
            autoFocus
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.results}>
          {isSearching ? (
            <div className={styles.loadingSpinner}>Searching...</div>
          ) : results.length > 0 ? (
            <div className={styles.grid}>
              {results.map((community) => {
                const alreadyMember = isMember(community.id);
                return (
                  <div key={community.id} className={styles.card}>
                    <div className={styles.cardIcon}>
                      {community.icon_url ? (
                        <img src={community.icon_url} alt={community.name} />
                      ) : (
                        community.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardName}>{community.name}</div>
                      {community.description && (
                        <div className={styles.cardDesc}>{community.description}</div>
                      )}
                      <div className={styles.cardMeta}>
                        {community.member_count} {community.member_count === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                    {alreadyMember ? (
                      <button className={styles.joinedBtn} disabled>Joined</button>
                    ) : (
                      <button
                        className={styles.joinBtn}
                        onClick={() => handleJoin(community.id)}
                        disabled={joiningId === community.id}
                      >
                        {joiningId === community.id ? 'Joining...' : 'Join'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : query.trim() ? (
            <div className={styles.emptyState}>
              <div>No public communities found for &ldquo;{query}&rdquo;</div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div>Type a name to search for public communities</div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
