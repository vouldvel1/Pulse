import { useCallback, useRef, useEffect } from 'react';
import { useSearchStore } from '../../stores/searchStore';
import { useCommunityStore } from '../../stores/communityStore';
import { useChannelStore } from '../../stores/channelStore';
import type { SearchResult } from '../../types';
import styles from './SearchPanel.module.css';

interface Props {
  onClose: () => void;
  onNavigate?: (communityId: string, channelId: string) => void;
}

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

function highlightMatch(content: string, query: string): string {
  if (!query) return content;
  const words = query.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return content;
  const regex = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return content.replace(regex, '**$1**');
}

export function SearchPanel({ onClose, onNavigate }: Props) {
  const {
    query, results, total, loading, error,
    setQuery, search, loadMore, clear,
  } = useSearchStore();

  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const { setActiveChannel } = useChannelStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-set community filter to current community
  useEffect(() => {
    const store = useSearchStore.getState();
    if (activeCommunityId && !store.communityFilter) {
      store.setCommunityFilter(activeCommunityId);
    }
  }, [activeCommunityId]);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.length >= 2) {
      timerRef.current = setTimeout(() => {
        search();
      }, 400);
    }
  }, [setQuery, search]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (timerRef.current) clearTimeout(timerRef.current);
      search();
    }
    if (e.key === 'Escape') {
      clear();
      onClose();
    }
  }, [search, clear, onClose]);

  const handleResultClick = useCallback((result: SearchResult) => {
    if (onNavigate) {
      onNavigate(result.community_id, result.channel_id);
    } else {
      // Default: set active channel
      setActiveChannel(result.channel_id);
    }
    clear();
    onClose();
  }, [onNavigate, setActiveChannel, clear, onClose]);

  const handleClose = useCallback(() => {
    clear();
    onClose();
  }, [clear, onClose]);

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.inputWrap}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              placeholder="Search messages..."
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button className={styles.clearBtn} onClick={() => { setQuery(''); clear(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <button className={styles.closeBtn} onClick={handleClose}>Esc</button>
        </div>

        <div className={styles.body}>
          {loading && results.length === 0 && (
            <div className={styles.status}>Searching...</div>
          )}

          {error && (
            <div className={styles.status}>{error}</div>
          )}

          {!loading && !error && results.length === 0 && query.length >= 2 && (
            <div className={styles.status}>No results found</div>
          )}

          {!loading && !error && query.length < 2 && (
            <div className={styles.status}>Type at least 2 characters to search</div>
          )}

          {results.length > 0 && (
            <>
              <div className={styles.resultCount}>
                {total} result{total !== 1 ? 's' : ''}
              </div>
              <div className={styles.results}>
                {results.map((r) => (
                  <button
                    key={r.message_id}
                    className={styles.result}
                    onClick={() => handleResultClick(r)}
                  >
                    <div className={styles.resultHeader}>
                      <span className={styles.resultAuthor}>{r.author_display_name}</span>
                      <span className={styles.resultMeta}>
                        in #{r.channel_name} · {r.community_name}
                      </span>
                      <span className={styles.resultTime}>{formatTime(r.created_at)}</span>
                    </div>
                    <div
                      className={styles.resultContent}
                      dangerouslySetInnerHTML={{
                        __html: highlightMatch(r.content, query)
                          .replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>')
                          .slice(0, 300),
                      }}
                    />
                  </button>
                ))}
              </div>
              {results.length < total && (
                <button
                  className={styles.loadMore}
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
