import { useState, useEffect, useRef } from 'react';
import { users as usersApi, dm as dmApi } from '@/utils/api';
import { useDMStore } from '@/stores/dmStore';
import { Avatar } from '@/components/common/Avatar';
import { Modal } from '@/components/common/Modal';
import type { User } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FindUserModal({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setActiveChannel = useDMStore((s) => s.setActiveChannel);
  const addChannel = useDMStore((s) => s.addChannel);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await usersApi.search(query.trim(), 20);
        setResults(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка поиска');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [open]);

  const handleOpenDM = async (user: User) => {
    setOpeningId(user.id);
    try {
      const channel = await dmApi.createChannel(user.id);
      addChannel(channel);
      setActiveChannel(channel.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть чат');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Найти пользователя">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <span
            className="icon"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 18,
              color: 'var(--outline)',
              pointerEvents: 'none',
            }}
          >
            search
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя пользователя..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--surface-variant)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              padding: '10px 12px 10px 40px',
              color: 'white',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ color: 'var(--error)', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120, maxHeight: 320, overflowY: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--outline)', paddingTop: 40 }}>
              Поиск...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--outline)', paddingTop: 40 }}>
              <span className="icon" style={{ fontSize: 32, opacity: 0.4, display: 'block', marginBottom: 8 }}>
                person_search
              </span>
              Пользователи не найдены
            </div>
          )}

          {!loading && !query && (
            <div style={{ textAlign: 'center', color: 'var(--outline)', paddingTop: 40, fontSize: 13 }}>
              Введите имя пользователя для поиска
            </div>
          )}

          {results.map((user) => (
            <div
              key={user.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 14,
                background: 'var(--surface-variant)',
                cursor: 'pointer',
              }}
            >
              <Avatar
                src={user.avatar_url}
                name={user.display_name ?? user.username}
                size={36}
                radius={18}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.display_name ?? user.username}
                </div>
                {user.display_name && (
                  <div style={{ fontSize: 11, color: 'var(--outline)' }}>
                    @{user.username}
                  </div>
                )}
              </div>
              <button
                onClick={() => void handleOpenDM(user)}
                disabled={openingId === user.id}
                style={{
                  padding: '7px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--primary)',
                  color: 'var(--on-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: openingId === user.id ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                {openingId === user.id ? '...' : 'Написать'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
