import { useState, useCallback } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import type { Channel } from '../../types';
import styles from '../community/CreateCommunityModal.module.css';

interface Props {
  channel: Channel;
  onClose: () => void;
}

export function ChannelSettingsModal({ channel, onClose }: Props) {
  const { updateChannel, deleteChannel } = useChannelStore();
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [isPrivate, setIsPrivate] = useState(channel.is_private);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsLoading(true);
    setError(null);
    try {
      const updates: { name?: string; topic?: string; is_private?: boolean } = {};
      if (trimmedName !== channel.name) updates.name = trimmedName;
      if (topic.trim() !== (channel.topic ?? '')) updates.topic = topic.trim();
      if (isPrivate !== channel.is_private) updates.is_private = isPrivate;

      if (Object.keys(updates).length > 0) {
        await updateChannel(channel.id, updates);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setIsLoading(false);
    }
  }, [name, topic, isPrivate, channel, updateChannel, onClose]);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await deleteChannel(channel.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    } finally {
      setIsLoading(false);
    }
  }, [channel.id, deleteChannel, onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Channel Settings</h2>
        <p className={styles.subtitle}>Edit #{channel.name}</p>

        {!confirmDelete ? (
          <form onSubmit={handleSave}>
            <label className={styles.label}>
              Channel Name
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
              />
            </label>

            {channel.type !== 'category' && (
              <label className={styles.label}>
                Topic
                <input
                  className={styles.input}
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What's this channel about?"
                />
              </label>
            )}

            {channel.type !== 'category' && (
              <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                <span>Private channel</span>
              </label>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setConfirmDelete(true)}
                style={{ color: 'var(--danger)', marginRight: 'auto' }}
              >
                Delete Channel
              </button>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={isLoading || !name.trim()}
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Are you sure you want to delete <strong>#{channel.name}</strong>? This action cannot be undone. All messages in this channel will be permanently lost.
            </p>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setConfirmDelete(false)}
              >
                Go Back
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                style={{ background: 'var(--danger)' }}
                onClick={() => { handleDelete().catch(() => {}); }}
                disabled={isLoading}
              >
                {isLoading ? 'Deleting...' : 'Delete Channel'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
