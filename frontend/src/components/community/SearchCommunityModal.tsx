import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/common/Modal';
import { communities as communitiesApi } from '@/utils/api';
import { useCommunityStore } from '@/stores/communityStore';
import { useUIStore } from '@/stores/uiStore';

interface CommunitySearchResult {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  visibility: string;
  member_count: number;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SearchCommunityModal({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommunitySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addCommunity = useCommunityStore((s) => s.addCommunity);
  const setActiveCommunity = useCommunityStore((s) => s.setActiveCommunity);
  const setView = useUIStore((s) => s.setView);
  const existingCommunities = useCommunityStore((s) => s.communities);
  const existingIds = new Set(existingCommunities.map((c) => c.id));

  // Search with debounce — only fires when query is non-empty (backend requires q)
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await communitiesApi.search(query.trim(), 20) as unknown as CommunitySearchResult[];
        setResults(data);
      } catch (e) {
        setResults([]);
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError('');
    }
  }, [open]);

  const handleJoin = async (c: CommunitySearchResult) => {
    setJoiningId(c.id);
    setError('');
    try {
      // Backend returns the Community object on successful join
      const joined = await communitiesApi.joinAndGet(c.id);
      addCommunity(joined);
      setActiveCommunity(joined.id);
      setView('server');
      onClose();
    } catch (err) {
      const msg = (err as Error).message;
      // "already a member" — just navigate there
      if (msg.includes('ALREADY_MEMBER') || msg.includes('already a member')) {
        setActiveCommunity(c.id);
        setView('server');
        onClose();
      } else {
        setError(msg);
      }
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Найти сервер" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 16,
            padding: '10px 16px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="icon" style={{ color: 'var(--outline)', fontSize: 20, flexShrink: 0 }}>search</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название сервера..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'white',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          {isLoading && (
            <span className="icon" style={{ color: 'var(--outline)', fontSize: 18, animation: 'spin 1s linear infinite' }}>
              progress_activity
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(242,184,181,0.1)', border: '1px solid var(--error)', borderRadius: 12, padding: '8px 14px', fontSize: 13, color: 'var(--error)' }}>
            {error}
          </div>
        )}

        {/* Results */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {!isLoading && results.length === 0 && query.trim() && (
            <div style={{ textAlign: 'center', color: 'var(--outline)', fontSize: 13, padding: '24px 0' }}>
              <span className="icon" style={{ fontSize: 36, display: 'block', opacity: 0.3, marginBottom: 8 }}>search_off</span>
              Ничего не найдено
            </div>
          )}

          {!isLoading && results.length === 0 && !query.trim() && (
            <div style={{ textAlign: 'center', color: 'var(--outline)', fontSize: 13, padding: '24px 0' }}>
              <span className="icon" style={{ fontSize: 36, display: 'block', opacity: 0.3, marginBottom: 8 }}>public</span>
              Начните вводить название
            </div>
          )}

          {results.map((c) => {
            const isMember = existingIds.has(c.id);
            const isJoining = joiningId === c.id;
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: 'var(--primary-container)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 700,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {c.icon_url
                    ? <img src={c.icon_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                    : c.name[0].toUpperCase()
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--outline)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {c.description ?? ''}
                    {c.member_count > 0 && (
                      <span style={{ marginLeft: c.description ? 6 : 0 }}>
                        {c.description ? '· ' : ''}{c.member_count} участник{c.member_count === 1 ? '' : c.member_count < 5 ? 'а' : 'ов'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action */}
                {isMember ? (
                  <button
                    onClick={() => { setActiveCommunity(c.id); setView('server'); onClose(); }}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--primary-container)',
                      color: 'var(--primary)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span className="icon" style={{ fontSize: 16 }}>login</span>
                    Открыть
                  </button>
                ) : (
                  <button
                    onClick={() => void handleJoin(c)}
                    disabled={isJoining}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--primary)',
                      color: 'var(--on-primary)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isJoining ? 'default' : 'pointer',
                      opacity: isJoining ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span className="icon" style={{ fontSize: 16 }}>
                      {isJoining ? 'progress_activity' : 'add'}
                    </span>
                    {isJoining ? 'Вход...' : 'Вступить'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
